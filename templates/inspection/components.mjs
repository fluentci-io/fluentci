import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { embedInspection } from "./wasm.mjs";

export function witName(name) {
  const value = name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:-[a-z][a-z0-9]*)*$/.test(value))
    throw Error(`Unsupported WIT name ${name}`);
  return value;
}

export function jsName(name) {
  return witName(name).replace(/-([a-z])/g, (_, letter) =>
    letter.toUpperCase(),
  );
}

export function wireType(type) {
  if (type.endsWith("[]")) return `list<${wireType(type.slice(0, -2))}>`;
  const value = {
    string: "string",
    integer: "s32",
    number: "f64",
    boolean: "bool",
  }[type];
  if (!value) throw Error(`Unsupported component field ${type}`);
  return value;
}

// These are compiler-rendered types, never guesses from source text. Adapters
// resolve aliases before supplying them; unsupported contracts fail the build.
export function returnType(type, sdk) {
  type = type.trim();
  const scalar = {
    string: "string",
    String: "string",
    str: "string",
    int: "s32",
    Int: "s32",
    integer: "s32",
    number: "f64",
    Number: "f64",
    float: "f64",
    Float: "f64",
    boolean: "bool",
    Boolean: "bool",
    Bool: "bool",
    bool: "bool",
    unit: null,
    Unit: null,
    void: null,
    Nil: null,
    nil: null,
    None: null,
  };
  if (Object.hasOwn(scalar, type)) return scalar[type];
  if (type.startsWith("Effect "))
    return returnType(type.slice(7).replace(/^\((.*)\)$/, "$1"), sdk);
  if (type.endsWith("[]")) return `list<${returnType(type.slice(0, -2), sdk)}>`;
  const list =
    /^(?:Array|array|List|list)[<(]([^<>(),]+)[>)]$/.exec(type) ??
    /^Array ([A-Za-z]+)$/.exec(type);
  if (list) return `list<${returnType(list[1], sdk)}>`;
  const option =
    /^(?:option|Option|Maybe)[<(]([^<>(),]+)[>)]$/.exec(type) ??
    /^Maybe ([A-Za-z]+)$/.exec(type);
  if (option) return `option<${returnType(option[1], sdk)}>`;
  const result = /^(?:Result|result)[<(]([^<>(),]+),\s*([^<>(),]+)[>)]$/.exec(
    type,
  );
  if (result)
    return `result<${returnType(result[1], sdk) ?? "_"}, ${returnType(result[2], sdk) ?? "_"}>`;
  throw Error(
    `Unsupported ${sdk} component return type ${type}; use a concrete scalar, list, option, or result`,
  );
}

function docs(text) {
  return text
    ? text
        .split("\n")
        .map((line) => `  /// ${line}\n`)
        .join("")
    : "";
}

export function componentContract(functions, sdk) {
  const names = new Set();
  const definitions = functions.map((fn) => {
    const name = witName(fn.name);
    if (names.has(name)) throw Error(`Duplicate WIT export ${name}`);
    names.add(name);
    if (!fn.args && fn.invoke.style === "legacy" && !fn.component)
      throw Error(
        `${fn.name}: component exports must return typed values instead of writing Extism output`,
      );
    const result = fn.component?.returnType ?? returnType(fn.returnType, sdk);
    const args = fn.args ?? [];
    const fields = new Set();
    const record = args.length
      ? `  record ${name}-args {\n${args
          .map((arg) => {
            const field = witName(arg.name);
            if (fields.has(field)) throw Error(`Duplicate WIT field ${field}`);
            fields.add(field);
            const type = wireType(arg.type);
            return `${docs(arg.description)}    ${field}: ${arg.required === false ? `option<${type}>` : type},`;
          })
          .join("\n")}\n  }\n`
      : "";
    return {
      ...fn,
      witName: name,
      result,
      declaration: `${record}${docs(fn.description)}  ${name}: func(${args.length ? `args: ${name}-args` : ""})${result ? ` -> ${result}` : ""};`,
    };
  });
  return {
    functions: definitions,
    wit: `package fluentci:module@0.1.0;\n\ninterface api {\n${definitions.map((fn) => fn.declaration).join("\n")}\n}\n\nworld plugin {\n  import fluentci:runtime/host@0.1.0;\n  import fluentci:runtime/api@0.1.0;\n  export api;\n}\n`,
  };
}

export function componentSource(functions) {
  const imports = [
    `import { setInvocationInput } from ${JSON.stringify(fileURLToPath(new URL("./component-host.mjs", import.meta.url)))};`,
  ];
  const members = functions.map((fn, index) => {
    const invoke = fn.invoke;
    if (invoke.style === "clojurescript")
      imports.push(
        `const loadNative${index} = () => require(${JSON.stringify(invoke.module)});`,
      );
    else
      imports.push(
        `import * as native${index} from ${JSON.stringify(invoke.module)};`,
      );
    const statements =
      invoke.style === "clojurescript"
        ? [`const native${index} = loadNative${index}();`]
        : [];
    const args = fn.args ?? [];
    statements.push(
      `const input = {${args.map((arg) => `${JSON.stringify(arg.name)}: args[${JSON.stringify(jsName(arg.name))}]`).join(",")}};`,
    );
    for (const arg of args.filter((arg) => arg.required === false))
      statements.push(
        `if (input[${JSON.stringify(arg.name)}] === undefined) delete input[${JSON.stringify(arg.name)}];`,
      );
    statements.push(
      `setInvocationInput(${args.length ? "JSON.stringify(input)" : '\"\"'});`,
    );
    const hasRecord = args.length > 0 || invoke.hasRecordArgument;
    let value = "input";
    if (invoke.style === "purescript") {
      if (invoke.fields?.some((field) => field.optional)) {
        imports.push(
          `import { Just as Just${index}, Nothing as Nothing${index} } from ${JSON.stringify(invoke.maybe)};`,
        );
        for (const field of invoke.fields.filter((field) => field.optional))
          statements.push(
            `input[${JSON.stringify(field.name)}] = input[${JSON.stringify(field.name)}] === undefined ? Nothing${index}.value : new Just${index}(input[${JSON.stringify(field.name)}]);`,
          );
      }
    } else if (invoke.style === "gleam" && hasRecord) {
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
        let v = `input[${JSON.stringify(field.name)}]`;
        if (field.list) v = `toList${index}(${v})`;
        if (field.optional)
          v = `input[${JSON.stringify(field.name)}] === undefined ? new None${index}() : new Some${index}(${v})`;
        return v;
      });
      value = `new constructor${index}[${JSON.stringify(invoke.constructor)}](${values.join(",")})`;
    }
    if (invoke.style === "clojurescript") {
      statements.push(
        `let result = native${index}.__fluentci_component_invoke(native${index}[${JSON.stringify(invoke.export)}], ${hasRecord ? "input" : "undefined"});`,
      );
    } else {
      statements.push(
        `let result = native${index}[${JSON.stringify(invoke.export)}]${invoke.noArgumentValue ? "" : `(${hasRecord ? value : ""})`};`,
      );
      if (invoke.effect) statements.push("result = result();");
    }
    if (fn.result?.startsWith("result<")) {
      if (invoke.style !== "gleam")
        throw Error(
          `${fn.name}: result conversion is not implemented for ${invoke.style}`,
        );
      statements.push(
        "if (!result.isOk()) throw result[0]; result = result[0];",
      );
    } else if (fn.result?.startsWith("list<") && invoke.style === "gleam")
      statements.push("result = Array.from(result);");
    else if (fn.result?.startsWith("option<") && invoke.style === "gleam")
      statements.push("result = result[0];");
    else if (fn.result?.startsWith("option<") && invoke.style === "purescript")
      statements.push("result = result.value0;");
    if (fn.result) statements.push("return result;");
    return `${JSON.stringify(jsName(fn.name))}(${args.length ? "args" : ""}) { ${statements.join("\n")} }`;
  });
  return (
    imports.join("\n") + `\nexport const api = {${members.join(",\n")}};\n`
  );
}

export async function buildComponent({ root, artifact, functions, sdk }) {
  const directory = resolve(root, "dist");
  const { wit, functions: contract } = componentContract(functions, sdk);
  const witDir = join(directory, "wit");
  await mkdir(join(witDir, "deps/runtime"), { recursive: true });
  await writeFile(join(witDir, "module.wit"), wit);
  await writeFile(
    join(witDir, "deps/runtime/runtime.wit"),
    await readFile(join(root, ".sdk/wit/runtime.wit")),
  );
  const entry = join(directory, ".fluentci-component.mjs");
  await writeFile(entry, componentSource(contract));
  const js = join(directory, "component.js");
  await build({
    entryPoints: [entry],
    outfile: js,
    bundle: true,
    format: "esm",
    platform: "neutral",
    external: ["fluentci:runtime/*"],
    inject: [fileURLToPath(new URL("./component-host.mjs", import.meta.url))],
  });
  const { componentize } = await import(
    process.env.FLUENTCI_COMPONENTIZE_JS ?? "@bytecodealliance/componentize-js"
  );
  const { _addPreopen } =
    await import("@bytecodealliance/preview2-shim/filesystem");
  _addPreopen(witDir, witDir);
  const { component } = await componentize(await readFile(js, "utf8"), {
    witPath: witDir,
    worldName: "plugin",
    disableFeatures: ["http", "fetch-event"],
  });
  await writeFile(artifact, component);
  // Descriptions accompany the actual WIT ABI. The host checks every field and
  // return type against the component before accepting this metadata.
  return embedInspection(
    artifact,
    contract.map((fn) => ({
      name: fn.witName,
      inputFormat: "wit",
      args: (fn.args ?? []).map((arg) => ({
        ...arg,
        name: witName(arg.name),
        type:
          arg.required === false
            ? `option<${wireType(arg.type)}>`
            : wireType(arg.type),
      })),
      returnType: fn.result ?? "unit",
      ...(fn.description ? { description: fn.description } : {}),
    })),
  );
}
