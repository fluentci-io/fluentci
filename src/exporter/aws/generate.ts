import { Action } from "../../server/graphql/objects/action.ts";
import { BuildSpec } from "../../../deps.ts";

export default function generate(actions: Action[]): string {
  const buildspec = new BuildSpec();
  const withDagger = actions.some(({ useWasm }) => !useWasm)
    ? [
        "curl -L https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=0.11.0 sh",
        "mv bin/dagger /usr/local/bin",
        "dagger version",
      ]
    : [];

  buildspec
    .phase("install", {
      commands: [
        "curl -fsSL https://cli.fluentci.io | bash",
        "fluentci --version",
        ...withDagger,
      ],
    })
    .phase("build", {
      commands: actions
        .map(({ commands, useWasm, plugin }) =>
          commands
            .split("\n")
            .map(
              (command) =>
                `fluentci run ${useWasm ? "--wasm" : ""} ${plugin} ${command}`
            )
        )
        .flat(),
    })
    .phase("post_build", {
      commands: ["echo Build completed on `date`"],
    });
  return buildspec.toString();
}
