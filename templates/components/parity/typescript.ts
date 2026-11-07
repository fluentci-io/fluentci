import { dag } from "./.sdk/typescript/src/plugin";
import { parallel, run } from "./.sdk/typescript/src/matrix";
import { digestText } from "./.sdk/typescript/src/remote";
export function parity(): string {
  const directory = dag.getEnv("FLUENTCI_COMPONENT_RUN_DIR");
  const pipeline = dag.pipeline("component-parity");
  dag.setEnvs({ FLUENTCI_COMPONENT_PARITY: "capability-parity" });
  const output = pipeline.withExec([`printf '%s' "$FLUENTCI_COMPONENT_PARITY"`]).stdout();
  const report = run(parallel([digestText("digest", "sha256", "abc")], 1), `${directory}/typed-plan`);
  if (report.outcome !== "succeeded") throw Error("Typed plan failed");
  return output;
}

export function hello(args: {name: string}): string {return `Hello, ${args.name}!`;}
