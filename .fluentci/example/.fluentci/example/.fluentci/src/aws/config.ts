import { FluentAWSCodePipeline } from "../../deps.ts";

export function generateYaml(): FluentAWSCodePipeline.BuildSpec {
  const buildspec = new FluentAWSCodePipeline.BuildSpec();
  buildspec
    .phase("install", {
      commands: [
        "curl -fsSL https://deno.land/x/install/install.sh | sh",
        'export DENO_INSTALL="$HOME/.deno"',
        'export PATH="$DENO_INSTALL/bin:$PATH"',
        "deno install -A -r https://cli.fluentci.io -n fluentci",
        "curl -L https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=0.8.1 sh",
        "mv bin/dagger /usr/local/bin",
        "dagger version",
      ],
    })
    .phase("build", {
      commands: ["fluentci run deno_pipeline fmt lint test"],
    })
    .phase("post_build", {
      commands: ["echo Build completed on `date`"],
    });
  return buildspec;
}
