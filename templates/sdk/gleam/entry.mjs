import { hello as invoke } from "./build/dev/javascript/fluentci_plugin_demo/plugin.mjs";

export function hello() {
  const result = invoke();
  if (!result.isOk()) throw Error(result[0]);
  Host.outputString(result[0]);
}
