import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { bindingFor, sourceBindings } from "../bindings.mjs";
import { documentation, field } from "../common.mjs";

export function inspectGleam(entry, root, exportNames, interfacePath) {
  const api = JSON.parse(readFileSync(interfacePath, "utf8"));
  const base = resolve(root, "build/dev/javascript", api.name);
  const bindings = sourceBindings(entry);
  function resolveType(type, substitutions = []) {
    if (type.kind === "variable") {
      if (!substitutions[type.id])
        throw Error("Input fields must have concrete Gleam types");
      return resolveType(substitutions[type.id], []);
    }
    if (type.kind !== "named")
      throw Error(`Unsupported Gleam input type ${JSON.stringify(type)}`);
    const module = api.modules[type.module];
    const alias = module?.["type-aliases"]?.[type.name];
    if (alias) return resolveType(alias.alias, type.parameters);
    return {
      ...type,
      parameters: (type.parameters ?? []).map((parameter) =>
        parameter.kind === "variable"
          ? (substitutions[parameter.id] ?? parameter)
          : parameter,
      ),
    };
  }
  function show(type) {
    if (type.kind === "fn")
      return `fn(${type.parameters.map(show).join(", ")}) -> ${show(type.return)}`;
    if (type.kind === "tuple")
      return `#(${type.elements.map(show).join(", ")})`;
    if (type.kind === "variable") return `a${type.id}`;
    if (type.kind !== "named")
      throw Error(`Unsupported Gleam return type ${JSON.stringify(type)}`);
    return (
      type.name +
      (type.parameters?.length
        ? `(${type.parameters.map(show).join(", ")})`
        : "")
    );
  }
  function wire(type) {
    type = resolveType(type);
    if (type.name === "Option" && type.module === "gleam/option")
      return { ...wire(type.parameters[0]), optional: true };
    const primitive = {
      String: "string",
      Int: "integer",
      Float: "number",
      Bool: "boolean",
    }[type.name];
    if (primitive && type.module === "gleam") return { type: primitive };
    if (type.name === "List" && type.module === "gleam") {
      const inner = wire(type.parameters[0]);
      if (inner.optional || inner.list)
        throw Error(
          "Nested/optional Gleam list elements require a supported input codec",
        );
      return { type: inner.type + "[]", list: true };
    }
    throw Error(`Unsupported Gleam CLI field ${show(type)}`);
  }
  return exportNames.map((name) => {
    const binding = bindingFor(bindings, name, (path) =>
      path.startsWith(base + "/"),
    );
    const moduleName = relative(base, binding.module)
      .replace(/\.mjs$/, "")
      .replaceAll("\\", "/");
    const definition = api.modules[moduleName]?.functions?.[binding.export];
    if (!definition)
      throw Error(
        `${name}: missing fresh Gleam compiler interface for ${moduleName}.${binding.export}`,
      );
    const doc = documentation(definition.documentation);
    const result = {
      name,
      description: doc.description,
      returnType: show(definition.return),
    };
    if (!definition.parameters.length)
      return { ...result, invoke: { style: "legacy" } };
    if (definition.parameters.length !== 1)
      throw Error(`${name}: use one typed argument record`);
    const type = resolveType(definition.parameters[0].type);
    if (type.module === "gleam" && type.name === "String")
      return { ...result, invoke: { style: "legacy" } };
    const record = api.modules[type.module]?.types?.[type.name];
    if (
      !record ||
      record.constructors?.length !== 1 ||
      !record.constructors[0].parameters.every((parameter) => parameter.label)
    )
      throw Error(
        `${name}: input must have one public constructor with named fields`,
      );
    const constructor = record.constructors[0];
    const fieldsDoc = documentation(
      constructor.documentation || record.documentation,
    );
    const fields = constructor.parameters.map((parameter) => {
      const value = wire(resolveType(parameter.type, type.parameters));
      return {
        ...field(
          parameter.label,
          value.type,
          !value.optional,
          fieldsDoc.params[parameter.label] ?? doc.params[parameter.label],
        ),
        ...value,
      };
    });
    return {
      ...result,
      args: fields.map(({ list, optional, ...arg }) => arg),
      invoke: {
        module: binding.module,
        export: binding.export,
        style: "gleam",
        fields,
        constructor: constructor.name,
        constructorModule: join(base, type.module + ".mjs"),
        prelude: join(base, "gleam.mjs"),
        option: resolve(
          root,
          "build/dev/javascript/gleam_stdlib/gleam/option.mjs",
        ),
        result:
          definition.return.kind === "named" &&
          definition.return.name === "Result",
        unit: definition.return.name === "Nil",
      },
    };
  });
}
