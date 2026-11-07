import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { bindingFor, sourceBindings } from "../bindings.mjs";
import { documentation, field } from "../common.mjs";

// Parse the compiler's normalized field types, never guesses over user source.
function wire(signature) {
  const scalar = {
    string: "string",
    int: "integer",
    float: "number",
    bool: "boolean",
  }[signature];
  if (scalar) return { type: scalar };
  if (signature.startsWith("option<") && signature.endsWith(">")) {
    const inner = wire(signature.slice(7, -1));
    if (inner.optional)
      throw Error("Nested ReScript options need an explicit codec");
    return { ...inner, optional: true };
  }
  if (signature.startsWith("array<") && signature.endsWith(">")) {
    const inner = wire(signature.slice(6, -1));
    if (inner.optional || inner.type.endsWith("[]"))
      throw Error(
        "Nested/optional ReScript array elements need an explicit codec",
      );
    return { type: inner.type + "[]" };
  }
  throw Error(`Unsupported ReScript CLI field ${signature}`);
}

function show(type) {
  if (!type?.path)
    throw Error("The ReScript compiler did not expose a concrete return type");
  return (
    type.path +
    (type.genericTypeParameters?.length
      ? `<${type.genericTypeParameters.map(show).join(", ")}>`
      : "")
  );
}

export function inspectRescript(
  entry,
  root,
  exportNames,
  tool = "rescript-tools",
  component = false,
) {
  const bindings = sourceBindings(entry);
  const modules = new Map();
  function load(source) {
    if (!modules.has(source)) {
      const result = spawnSync(tool, ["doc", source], {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      });
      if (result.error) throw result.error;
      if (result.status !== 0)
        throw Error(`ReScript compiler inspection failed: ${result.stderr}`);
      modules.set(source, JSON.parse(result.stdout));
    }
    return modules.get(source);
  }
  return exportNames.map((name) => {
    const binding = bindingFor(bindings, name, (path) =>
      path.endsWith(".res.mjs"),
    );
    const source = binding.module.slice(0, -4);
    const module = load(source);
    const definition = module.items.find(
      (item) => item.kind === "value" && item.name === binding.export,
    );
    const signature = definition?.detail?.details;
    if (definition?.detail?.kind !== "signature" || !signature)
      throw Error(`${name}: missing compiled ReScript function signature`);
    const doc = documentation(definition.docstrings.join("\n"));
    const returned = show(signature.returnType);
    const fn = { name, description: doc.description, returnType: returned };
    if (
      signature.parameters.length === 1 &&
      signature.parameters[0].path === "unit"
    )
      return {
        ...fn,
        ...(component ? { args: [] } : {}),
        invoke: component
          ? {
              style: "rescript",
              module: binding.module,
              export: binding.export,
            }
          : { style: "legacy" },
      };
    if (signature.parameters.length !== 1)
      throw Error(`${name}: use one typed argument record`);
    const type = signature.parameters[0];
    const path = type.path.split(".");
    let definitions = module.items;
    if (path.length === 2)
      definitions = load(resolve(dirname(source), path[0] + ".res")).items;
    else if (path.length !== 1)
      throw Error(`${name}: unsupported record module path ${type.path}`);
    const record = definitions.find(
      (item) => item.kind === "type" && item.name === path.at(-1),
    );
    if (record?.detail?.kind !== "record")
      throw Error(`${name}: input must be a concrete exported ReScript record`);
    const fields = record.detail.items.map((item) => {
      const value = wire(item.signature);
      const docs = documentation(item.docstrings.join("\n"));
      return field(
        item.name,
        value.type,
        !item.optional && !value.optional,
        docs.description ?? doc.params[item.name],
      );
    });
    return {
      ...fn,
      args: fields,
      invoke: {
        hasRecordArgument: true,
        style: "rescript",
        module: binding.module,
        export: binding.export,
        unit: returned === "unit",
      },
    };
  });
}
