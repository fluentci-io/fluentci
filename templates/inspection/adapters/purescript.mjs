import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { bindingFor, sourceBindings } from "../bindings.mjs";
import { documentation, field } from "../common.mjs";

function application(type) {
  const parameters = [];
  while (type.tag === "TypeApp") {
    parameters.unshift(type.contents[1]);
    type = type.contents[0];
  }
  return { head: type, parameters };
}

function constructor(type) {
  return type.tag === "TypeConstructor"
    ? { module: type.contents[0].join("."), name: type.contents[1] }
    : undefined;
}

export function inspectPurescript(entry, root, exportNames) {
  const bindings = sourceBindings(entry);
  const modules = new Map();
  let output;
  function load(name) {
    if (!modules.has(name)) {
      const path = join(output, name, "docs.json");
      if (!existsSync(path))
        throw Error(
          `Missing compiler docs for ${name}; build with --codegen js,docs,corefn`,
        );
      modules.set(name, JSON.parse(readFileSync(path, "utf8")));
    }
    return modules.get(name);
  }
  function resolve(type, stack = []) {
    const app = application(type);
    const head = constructor(app.head);
    if (
      !head ||
      head.module === "Prim" ||
      ["Effect", "Data.Maybe"].includes(head.module)
    )
      return type;
    const definition = load(head.module).declarations.find(
      (declaration) =>
        declaration.title === head.name &&
        declaration.info.declType === "typeSynonym",
    );
    if (!definition) return type;
    if (stack.includes(`${head.module}.${head.name}`))
      throw Error("Recursive input aliases are not supported");
    const parameters = definition.info.arguments.map(([name], index) => [
      name,
      app.parameters[index],
    ]);
    const substitutions = new Map(parameters);
    function substitute(node) {
      if (node?.tag === "TypeVar" && substitutions.has(node.contents))
        return substitutions.get(node.contents);
      if (Array.isArray(node)) return node.map(substitute);
      if (node && typeof node === "object")
        return Object.fromEntries(
          Object.entries(node).map(([key, value]) => [key, substitute(value)]),
        );
      return node;
    }
    return resolve(substitute(definition.info.type), [
      ...stack,
      `${head.module}.${head.name}`,
    ]);
  }
  function show(type) {
    if (type.tag === "ForAll") return show(type.contents.type);
    const app = application(type);
    const head = constructor(app.head);
    if (head?.module === "Prim" && head.name === "Function")
      return `${show(app.parameters[0])} -> ${show(app.parameters[1])}`;
    if (head)
      return [
        head.name,
        ...app.parameters.map((parameter) =>
          parameter.tag === "TypeApp"
            ? `(${show(parameter)})`
            : show(parameter),
        ),
      ].join(" ");
    if (type.tag === "TypeVar") return type.contents;
    if (type.tag === "REmpty") return "{}";
    if (type.tag === "RCons")
      return `{ ${rows(type)
        .map(([label, value]) => `${label} :: ${show(value)}`)
        .join(", ")} }`;
    throw Error(`Unsupported PureScript return type ${type.tag}`);
  }
  function rows(type) {
    const fields = [];
    while (type.tag === "RCons") {
      fields.push([type.contents[0], type.contents[1]]);
      type = type.contents[2];
    }
    if (type.tag !== "REmpty")
      throw Error("Input records must have a closed, concrete row");
    return fields;
  }
  function wire(type) {
    type = resolve(type);
    const { head, parameters } = application(type);
    const value = constructor(head);
    if (value?.module === "Data.Maybe" && value.name === "Maybe")
      return { ...wire(parameters[0]), optional: true };
    const scalar = {
      String: "string",
      Int: "integer",
      Number: "number",
      Boolean: "boolean",
    }[value?.name];
    if (value?.module === "Prim" && scalar) return { type: scalar };
    if (value?.module === "Prim" && value.name === "Array") {
      const element = wire(parameters[0]);
      if (element.optional || element.type.endsWith("[]"))
        throw Error(
          "Nested/optional array elements require a supported input codec",
        );
      return { type: element.type + "[]" };
    }
    throw Error(
      `Unsupported PureScript CLI field ${show(type)}; use a public record of concrete supported types`,
    );
  }
  return exportNames.map((name) => {
    const binding = bindingFor(bindings, name, (path) =>
      /[/\\]output[/\\][^/\\]+[/\\]index\.js$/.test(path),
    );
    const directory = dirname(binding.module);
    output = dirname(directory);
    const docs = JSON.parse(readFileSync(join(directory, "docs.json"), "utf8"));
    modules.set(docs.name, docs);
    const core = JSON.parse(
      readFileSync(join(directory, "corefn.json"), "utf8"),
    );
    if (!core.exports.includes(binding.export))
      throw Error(`${name}: missing compiled PureScript export`);
    const definition = docs.declarations.find(
      (declaration) =>
        declaration.title === binding.export &&
        declaration.info.declType === "value",
    );
    if (!definition)
      throw Error(
        `${name}: missing compiler signature; export the typed entrypoint from its module`,
      );
    let signature = definition.info.type;
    while (signature.tag === "ForAll") signature = signature.contents.type;
    const app = application(signature);
    const head = constructor(app.head);
    const doc = documentation(definition.comments);
    const fn = { name, description: doc.description };
    if (!(head?.module === "Prim" && head.name === "Function"))
      return {
        ...fn,
        returnType: show(signature),
        invoke: { style: "legacy" },
      };
    const argument = application(resolve(app.parameters[0]));
    const record = constructor(argument.head);
    if (!(record?.module === "Prim" && record.name === "Record"))
      throw Error(
        `${name}: use one typed argument record instead of positional/curried public parameters`,
      );
    const returned = application(app.parameters[1]);
    const outputType = constructor(returned.head);
    if (outputType?.module === "Prim" && outputType.name === "Function")
      throw Error(`${name}: use one typed argument record`);
    if (outputType?.name === "Aff")
      throw Error(`${name}: asynchronous guest entrypoints are not supported`);
    const fields = rows(argument.parameters[0]).map(([label, value]) => {
      const type = wire(value);
      return {
        ...field(label, type.type, !type.optional, doc.params[label]),
        ...type,
      };
    });
    const effect =
      outputType?.module === "Effect" && outputType.name === "Effect";
    const resultType = effect ? returned.parameters[0] : app.parameters[1];
    const unit = constructor(application(resultType).head)?.name === "Unit";
    return {
      ...fn,
      args: fields.map(({ optional, ...arg }) => arg),
      returnType: show(app.parameters[1]),
      invoke: {
        module: binding.module,
        export: binding.export,
        style: "purescript",
        effect,
        unit,
        fields,
        maybe: join(output, "Data.Maybe/index.js"),
      },
    };
  });
}
