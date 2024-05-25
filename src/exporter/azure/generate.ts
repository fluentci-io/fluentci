import { Action } from "../../server/graphql/objects/action.ts";
import { AzurePipeline } from "../../../deps.ts";

export default function generate(actions: Action[]): string {
  const pipeline = new AzurePipeline();

  const setupFluentCI = `\
    curl -fsSL https://cli.fluentci.io | bash
    fluentci --version
    echo "##vso[task.prependpath]\${HOME}/.deno/bin
  `
    .split("\n")
    .map((line) => line.trim())
    .join("\n");

  const steps = [
    {
      script: setupFluentCI,
      displayName: "Setup FluentCI",
    },
  ];

  pipeline
    .trigger(["main"])
    .pool({
      vmImage: "ubuntu-latest",
    })
    .steps([
      ...steps,
      ...actions.map(({ commands, useWasm, plugin, name }) => ({
        script: commands
          .split("\n")
          .map(
            (command) =>
              `fluentci run ${useWasm ? "--wasm" : ""} ${plugin} ${command}`
          )
          .join("\n"),
        displayName: name,
      })),
    ]);
  return pipeline.toString();
}
