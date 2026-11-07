import ts from "typescript";
import { join, resolve } from "node:path";
import { field, documentation } from "../common.mjs";
import { fileURLToPath } from "node:url";

export function programFor(entry, root) {
  const defaults = {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    allowJs: true,
    checkJs: false,
    skipLibCheck: true,
    noEmit: true,
    allowImportingTsExtensions: true,
  };
  const config = ts.findConfigFile(root, ts.sys.fileExists);
  let options = defaults;
  if (config) {
    const parsed = ts.readConfigFile(config, ts.sys.readFile);
    if (parsed.error)
      throw Error(
        ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"),
      );
    options = {
      ...ts.parseJsonConfigFileContent(parsed.config, ts.sys, root).options,
      ...defaults,
    };
  }
  const ambient = fileURLToPath(new URL("../guest.d.ts", import.meta.url));
  const program = ts.createProgram([resolve(entry), ambient], options);
  const source = program.getSourceFile(resolve(entry));
  if (!source) throw Error(`Cannot inspect ${entry}`);
  const errors = program
    .getSyntacticDiagnostics()
    .concat(program.getSemanticDiagnostics());
  if (errors.length)
    throw Error(
      ts.formatDiagnosticsWithColorAndContext(errors, {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      }),
    );
  return { program, source, checker: program.getTypeChecker() };
}

export function inspectTypescript(entry, root, exportNames, component = false) {
  const { source, checker } = programFor(entry, root);
  const exports = checker.getExportsOfModule(
    checker.getSymbolAtLocation(source),
  );
  return exportNames.map((name) => {
    let symbol = exports.find((symbol) => symbol.name === name);
    if (!symbol) throw Error(`No source export ${name} in ${entry}`);
    if (symbol.flags & ts.SymbolFlags.Alias)
      symbol = checker.getAliasedSymbol(symbol);
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
    if (signatures.length !== 1)
      throw Error(`Export ${name} requires one concrete function signature`);
    const signature = signatures[0];
    const returns = checker.getReturnTypeOfSignature(signature);
    const returnType = checker.typeToString(
      returns,
      declaration,
      ts.TypeFormatFlags.NoTruncation,
    );
    const doc = documentation(
      ts.displayPartsToString(symbol.getDocumentationComment(checker)),
    );
    const tags = new Map(
      symbol
        .getJsDocTags(checker)
        .filter((tag) => tag.name === "param")
        .map((tag) => {
          const text = ts.displayPartsToString(tag.text ?? []);
          const [key, ...body] = text.split(/\s+/);
          return [key, body.join(" ").replace(/^-\s*/, "")];
        }),
    );
    if (!signature.parameters.length)
      return {
        name,
        returnType,
        description: doc.description,
        invoke: {
          module: entry,
          export: name,
          style: component ? "record" : "legacy",
        },
        ...(component ? { args: [] } : {}),
      };
    if (signature.parameters.length !== 1 || signature.typeParameters?.length)
      throw Error(`${name}: use a single concrete typed argument record`);
    if (
      returns.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown) ||
      checker.getPromisedTypeOfPromise(returns)
    )
      throw Error(
        `${name}: an explicit synchronous return contract is required`,
      );
    const parameter = signature.parameters[0];
    const node =
      parameter.valueDeclaration ?? signature.declaration.parameters[0];
    if (node.dotDotDotToken || node.initializer)
      throw Error(
        `${name}: default optional fields inside the handler, not the entire argument record`,
      );
    const record = checker.getTypeOfSymbolAtLocation(parameter, node);
    if (
      !(record.flags & ts.TypeFlags.Object) ||
      checker.getIndexInfosOfType(record).length ||
      checker.isArrayType(record)
    )
      throw Error(
        `${name}: arguments must be a typed record with named fields`,
      );
    function scalar(type) {
      if (type.isUnion()) {
        const parts = type.types.filter(
          (part) => !(part.flags & ts.TypeFlags.Undefined),
        );
        if (
          parts.length === 2 &&
          parts.every((part) => part.flags & ts.TypeFlags.BooleanLiteral)
        )
          return "boolean";
        if (parts.length !== 1)
          throw Error(
            `${name}: unsupported union ${checker.typeToString(type)}; use optional scalar fields`,
          );
        return scalar(parts[0]);
      }
      if (type.isLiteral() || type.flags & ts.TypeFlags.BooleanLiteral)
        throw Error(
          `${name}: literal-only input fields need an explicit codec`,
        );
      if (type.flags & ts.TypeFlags.String) return "string";
      if (type.flags & ts.TypeFlags.Number) return "number";
      if (type.flags & ts.TypeFlags.Boolean) return "boolean";
      if (checker.isArrayType(type) && !checker.isTupleType(type)) {
        const inner = scalar(checker.getTypeArguments(type)[0]);
        if (inner.endsWith("[]"))
          throw Error(`${name}: nested arrays require a supported input codec`);
        return inner + "[]";
      }
      throw Error(
        `${name}: unsupported field type ${checker.typeToString(type)}`,
      );
    }
    const args = checker.getPropertiesOfType(record).map((property) => {
      const location =
        property.valueDeclaration ?? property.declarations?.[0] ?? node;
      const propertyType = checker.getTypeOfSymbolAtLocation(
        property,
        location,
      );
      const description =
        ts.displayPartsToString(property.getDocumentationComment(checker)) ||
        tags.get(property.name) ||
        doc.params[property.name];
      return field(
        property.name,
        scalar(propertyType),
        !(property.flags & ts.SymbolFlags.Optional),
        description,
      );
    });
    return {
      name,
      args,
      returnType,
      description: doc.description,
      invoke: {
        module: entry,
        export: name,
        style: "record",
        hasRecordArgument: true,
      },
    };
  });
}
