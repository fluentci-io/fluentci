import { Action } from "../../server/graphql/objects/action.ts";
import { GitlabCI, Job } from "../../../deps.ts";

export default function generate(actions: Action[]): string {
  const docker = new Job()
    .image("denoland/deno:debian-1.42.4")
    .services(["docker:${DOCKER_VERSION}-dind"])
    .variables({
      DOCKER_HOST: "tcp://docker:2376",
      DOCKER_TLS_VERIFY: "1",
      DOCKER_TLS_CERTDIR: "/certs",
      DOCKER_CERT_PATH: "/certs/client",
      DOCKER_DRIVER: "overlay2",
      DOCKER_VERSION: "20.10.16",
      GITLAB_ACCESS_TOKEN: "$GITLAB_ACCESS_TOKEN",
    });

  const fluentci = new Job().extends(".docker").beforeScript(
    `
    apt-get update
    apt-get install -y curl tar gzip ca-certificates openssl git unzip libncursesw6
    deno install -A -r https://cli.fluentci.io -n fluentci
    fluentci --version
    curl -L https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=0.11.0 sh
    mv bin/dagger /usr/local/bin
    dagger version
    `
  );

  let gitlabci = new GitlabCI()
    .addJob(".docker", docker)
    .addJob(".fluentci", fluentci);

  for (const action of actions) {
    gitlabci = gitlabci.addJob(
      action.name,
      new Job().extends(".fluentci").script(
        action.commands
          .split("\n")
          .map(
            (command) =>
              `fluentci run ${action.useWasm ? "--wasm" : ""} ${
                action.plugin
              } ${command}`
          )
          .join("\n")
      )
    );
  }

  return gitlabci.toString();
}
