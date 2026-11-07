import { fileURLToPath } from "node:url";

export function wrapperSource(entry, functions) {
  const imports = [
    `import * as original from ${JSON.stringify(entry)};`,
    `import { readArguments, writeResult } from ${JSON.stringify(fileURLToPath(new URL("./runtime.mjs", import.meta.url)))};`,
  ];
  const wrappers = [];
  functions.forEach((fn, index) => {
    if (!/^[A-Za-z_$][\w$]*$/.test(fn.name))
      throw Error(`Unsupported JavaScript export name ${fn.name}`);
    const invoke = fn.invoke;
    if (invoke.style === "legacy") {
      wrappers.push(
        `export function ${fn.name}() { return original[${JSON.stringify(fn.name)}](); }`,
      );
      return;
    }
    imports.push(
      `import * as native${index} from ${JSON.stringify(invoke.module)};`,
    );
    const statements = [
      `const input = readArguments(${JSON.stringify(fn.args)});`,
    ];
    let argument = "input";
    if (
      invoke.style === "purescript" &&
      invoke.fields.some((field) => field.optional)
    ) {
      imports.push(
        `import { Just as Just${index}, Nothing as Nothing${index} } from ${JSON.stringify(invoke.maybe)};`,
      );
      for (const field of invoke.fields.filter((field) => field.optional))
        statements.push(
          `input[${JSON.stringify(field.name)}] = Object.prototype.hasOwnProperty.call(input, ${JSON.stringify(field.name)}) ? new Just${index}(input[${JSON.stringify(field.name)}]) : Nothing${index}.value;`,
        );
    }
    if (invoke.style === "gleam") {
      imports.push(
        `import * as constructor${index} from ${JSON.stringify(invoke.constructorModule)};`,
      );
      if (invoke.fields.some((field) => field.list))
        imports.push(
          `import { toList as toList${index} } from ${JSON.stringify(invoke.prelude)};`,
        );
      if (invoke.fields.some((field) => field.optional))
        imports.push(
          `import { Some as Some${index}, None as None${index} } from ${JSON.stringify(invoke.option)};`,
        );
      const values = invoke.fields.map((field) => {
        let value = `input[${JSON.stringify(field.name)}]`;
        if (field.list) value = `toList${index}(${value})`;
        if (field.optional)
          value = `Object.prototype.hasOwnProperty.call(input, ${JSON.stringify(field.name)}) ? new Some${index}(${value}) : new None${index}()`;
        return value;
      });
      argument = `new constructor${index}[${JSON.stringify(invoke.constructor)}](${values.join(", ")})`;
    }
    if (invoke.style === "clojurescript") {
      statements.push(
        `native${index}.__fluentci_invoke(native${index}[${JSON.stringify(invoke.export)}], input);`,
      );
      wrappers.push(
        `export function ${fn.name}() { ${statements.join("\n")} }`,
      );
      return;
    }
    statements.push(
      `let result = native${index}[${JSON.stringify(invoke.export)}](${argument});`,
    );
    if (invoke.effect) statements.push("result = result();");
    if (invoke.result)
      statements.push(
        "if (!result.isOk()) throw Error(String(result[0])); result = result[0];",
      );
    if (!invoke.unit) statements.push("writeResult(result);");
    wrappers.push(`export function ${fn.name}() { ${statements.join("\n")} }`);
  });
  return imports.join("\n") + "\n" + wrappers.join("\n") + "\n";
}
