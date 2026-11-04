import { dag } from "./.sdk/typescript/src/plugin.ts";

export function hello() {
  Host.outputString(dag.pipeline("hello").withExec(["echo", "Hello from FluentCI"]).stdout());
}
