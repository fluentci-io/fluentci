import { Action } from "../../server/graphql/objects/action.ts";
import { CircleCI, CircleCiJob } from "../../../deps.ts";

export default function generate(actions: Action[]): string {
  const circleci = new CircleCI();

  const setupFluentCI = {
    run: `\
    sudo apt-get update && sudo apt-get install -y curl unzip
    curl -fsSL https://cli.fluentci.io | bash
    fluentci --version`,
    name: "Setup FluentCI",
  };

  const steps = actions.map(({ name, commands, useWasm, plugin }) => ({
    run: commands
      .split("\n")
      .map(
        (command) =>
          `fluentci run ${useWasm ? "--wasm" : ""} ${plugin} ${command}`
      )
      .join("\n"),
    name,
  }));

  const job: CircleCiJob = new CircleCiJob()
    .machine({
      image: "ubuntu-2004:2023.07.1",
    })
    .steps(["checkout", setupFluentCI, ...steps]);

  circleci.jobs({ job }).workflow("fluentci", ["job"]);

  return circleci.toString();
}
