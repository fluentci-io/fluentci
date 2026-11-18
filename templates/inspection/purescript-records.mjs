// Derive native PureScript record returns from compiler docs, including aliases.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const name = (value) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase();
// WIT's lexer treats these as keywords even in record fields and function names.
// Keep escaping separate from metadata/JS names: `%from` still denotes `from`.
// https://github.com/bytecodealliance/wasm-tools/blob/main/crates/wit-parser/src/ast/lex.rs
const keywords = new Set(
  "use type func u8 u16 u32 u64 s8 s16 s32 s64 f32 f64 char resource own borrow record flags variant enum bool string option result future stream error-context list map as from static interface tuple world import export package constructor include with async".split(
    " ",
  ),
);
export const identifier = (value) =>
  keywords.has(value) ? "%" + value : value;

export function recordContract(fn) {
  const output = dirname(dirname(fn.invoke.module));
  const modules = new Map();
  function load(module) {
    if (!modules.has(module))
      modules.set(
        module,
        JSON.parse(readFileSync(join(output, module, "docs.json"), "utf8")),
      );
    return modules.get(module);
  }
  function application(type) {
    while (type.tag === "ParensInType") type = type.contents;
    const parameters = [];
    while (type.tag === "TypeApp") {
      parameters.unshift(type.contents[1]);
      type = type.contents[0];
      while (type.tag === "ParensInType") type = type.contents;
    }
    return { head: type, parameters };
  }
  function constructor(type) {
    return type.tag === "TypeConstructor"
      ? { module: type.contents[0].join("."), name: type.contents[1] }
      : {};
  }
  function substitute(type, values) {
    if (type?.tag === "TypeVar" && values.has(type.contents))
      return values.get(type.contents);
    if (Array.isArray(type))
      return type.map((value) => substitute(value, values));
    if (type && typeof type === "object")
      return Object.fromEntries(
        Object.entries(type).map(([key, value]) => [
          key,
          substitute(value, values),
        ]),
      );
    return type;
  }
  function resolve(type, stack = []) {
    if (type.tag === "ParensInType") return resolve(type.contents, stack);
    if (type.tag === "ForAll") return resolve(type.contents.type, stack);
    const { head, parameters } = application(type),
      c = constructor(head);
    if (!c.module || ["Prim", "Effect", "Data.Maybe"].includes(c.module))
      return type;
    const alias = load(c.module).declarations.find(
      (d) => d.title === c.name && d.info.declType === "typeSynonym",
    );
    if (!alias) return type;
    const key = c.module + "." + c.name;
    if (stack.includes(key))
      throw Error("Recursive component return type: " + key);
    return resolve(
      substitute(
        alias.info.type,
        new Map(alias.info.arguments.map(([key], i) => [key, parameters[i]])),
      ),
      [...stack, key],
    );
  }
  const declarations = [];
  function wire(type, path) {
    type = resolve(type);
    const { head, parameters } = application(type),
      c = constructor(head);
    if (c.module === "Effect") return wire(parameters[0], path);
    if (c.module === "Data.Maybe") {
      const count = declarations.length;
      const inner = wire(parameters[0], path);
      if (declarations.length !== count)
        throw Error("Optional record results require an explicit result codec");
      return "option<" + inner + ">";
    }
    const scalar = {
      String: "string",
      Int: "s32",
      Number: "f64",
      Boolean: "bool",
      Unit: null,
    };
    if (
      ["Prim", "Data.Unit"].includes(c.module) &&
      Object.hasOwn(scalar, c.name)
    )
      return scalar[c.name];
    if (c.module === "Prim" && c.name === "Array")
      return "list<" + wire(parameters[0], path + "-item") + ">";
    if (c.module === "Prim" && c.name === "Record") {
      let row = parameters[0];
      const fields = [];
      while (row.tag === "ParensInType") row = row.contents;
      while (row.tag === "RCons") {
        const [key, value, next] = row.contents;
        fields.push(
          "    " +
            identifier(name(key)) +
            ": " +
            wire(value, path + "-" + name(key)) +
            ",",
        );
        row = next;
        while (row.tag === "ParensInType") row = row.contents;
      }
      if (row.tag !== "REmpty")
        throw Error("Component result records must be closed");
      declarations.push(
        "  record " + path + " {\n" + fields.join("\n") + "\n  }\n",
      );
      return path;
    }
    throw Error(
      "Unsupported component return constructor: " + JSON.stringify(c),
    );
  }
  const module = fn.invoke.module.split(/[\\/]/).at(-2);
  let type = load(module).declarations.find(
    (d) => d.title === fn.invoke.export && d.info.declType === "value",
  ).info.type;
  type = resolve(type);
  const first = application(type);
  if (constructor(first.head).name === "Function") type = first.parameters[1];
  return {
    result: wire(type, name(fn.name) + "-result"),
    definitions: declarations.join("\n"),
  };
}
