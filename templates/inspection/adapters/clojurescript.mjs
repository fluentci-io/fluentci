import { readFileSync } from "node:fs";
import { bindingFor, sourceBindings } from "../bindings.mjs";
import { documentation, field } from "../common.mjs";

export function inspectClojurescript(entry, root, names, interfacePath) {
  const api = JSON.parse(readFileSync(interfacePath, "utf8"));
  const bindings = sourceBindings(entry);
  return names.map((name) => {
    const binding = bindingFor(bindings, name, (path) => path.endsWith(".cjs"));
    const definition = api.functions[binding.export];
    if (!definition)
      throw Error(`${name}: missing fresh ClojureScript compiler interface`);
    const doc = documentation(definition.description);
    const args = definition.args?.map((arg) =>
      field(arg.name, arg.type, arg.required !== false, doc.params[arg.name]),
    );
    return {
      name,
      description: doc.description,
      returnType: definition.returnType,
      ...(args ? { args } : {}),
      invoke: args
        ? {
            style: "clojurescript",
            module: binding.module,
            export: binding.export,
          }
        : { style: "legacy" },
    };
  });
}
