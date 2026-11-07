import ts from "typescript";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Use a real JavaScript/TypeScript parser, including aliases and thin SDK wrappers.
export function sourceBindings(entry) {
  const source = ts.createSourceFile(
    entry,
    readFileSync(entry, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const imports = new Map();
  const result = new Map();
  const target = (specifier) => resolve(dirname(entry), specifier.text);
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const module = target(node.moduleSpecifier);
      const clause = node.importClause;
      if (clause.name)
        imports.set(clause.name.text, {
          module,
          export: "default",
          namespace: true,
        });
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))
        imports.set(clause.namedBindings.name.text, {
          module,
          namespace: true,
        });
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings))
        for (const value of clause.namedBindings.elements)
          imports.set(value.name.text, {
            module,
            export: (value.propertyName ?? value.name).text,
          });
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const value of node.exportClause.elements)
        result.set(value.name.text, [
          {
            module: target(node.moduleSpecifier),
            export: (value.propertyName ?? value.name).text,
          },
        ]);
    }
  }
  function reference(node) {
    if (ts.isIdentifier(node)) return imports.get(node.text);
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression)
    ) {
      const binding = imports.get(node.expression.text);
      if (binding?.namespace)
        return { ...binding, namespace: undefined, export: node.name.text };
    }
    return undefined;
  }
  for (const node of source.statements) {
    if (
      ts.isExportDeclaration(node) &&
      !node.moduleSpecifier &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    )
      for (const value of node.exportClause.elements) {
        const binding = imports.get((value.propertyName ?? value.name).text);
        if (binding) result.set(value.name.text, [binding]);
      }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      node.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
      )
    ) {
      const calls = [];
      function visit(child) {
        if (ts.isCallExpression(child)) {
          const binding = reference(child.expression);
          if (binding) calls.push(binding);
        }
        ts.forEachChild(child, visit);
      }
      if (node.body) visit(node.body);
      result.set(node.name.text, calls);
    }
  }
  return result;
}

export function bindingFor(bindings, name, accepts) {
  const candidates = (bindings.get(name) ?? []).filter((binding) =>
    accepts(binding.module),
  );
  const unique = [
    ...new Map(
      candidates.map((binding) => [
        `${binding.module}:${binding.export}`,
        binding,
      ]),
    ).values(),
  ];
  if (unique.length !== 1)
    throw Error(
      `${name}: export a concrete SDK function directly so its compiler signature can be inspected`,
    );
  return unique[0];
}
