import { Action } from "../../server/graphql/objects/action.ts";
import { Workflow, JobSpec } from "../../../deps.ts";

export default function generate(actions: Action[]): string {
  const workflow = new Workflow("ci");

  const push = {
    branches: ["main"],
  };

  const tasks: JobSpec = {
    "runs-on": "ubuntu-latest",
    steps: [
      {
        uses: "actions/checkout@v2",
      },
      {
        name: "Setup Fluent CI",
        uses: "fluentci-io/setup-fluentci@v5",
      },
      ...actions.map(({ name, commands, useWasm, plugin }) => ({
        name,
        run: commands
          .split("\n")
          .map(
            (command) =>
              `fluentci run ${useWasm ? "--wasm" : ""} ${plugin} ${command}`
          )
          .join("\n"),
      })),
    ],
  };

  workflow.on({ push }).jobs({ tasks });

  return workflow.toString();
}
