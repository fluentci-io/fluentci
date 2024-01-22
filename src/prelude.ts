import run from "https://deno.land/x/fluentci@v0.10.9/src/cmd/run.ts";
import init from "https://deno.land/x/fluentci@v0.10.9/src/cmd/init.ts";
import search from "https://deno.land/x/fluentci@v0.10.9/src/cmd/search.ts";
import upgrade, {
  checkForUpdate,
} from "https://deno.land/x/fluentci@v0.10.9/src/cmd/upgrade.ts";
import listJobs from "https://deno.land/x/fluentci@v0.10.9/src/cmd/list.ts";
import generateWorkflow from "https://deno.land/x/fluentci@v0.10.9/src/cmd/github.ts";
import generateGitlabCIConfig from "https://deno.land/x/fluentci@v0.10.9/src/cmd/gitlab.ts";
import generateAWSCodePipelineConfig from "https://deno.land/x/fluentci@v0.10.9/src/cmd/aws.ts";
import generateAzurePipelinesConfig from "https://deno.land/x/fluentci@v0.10.9/src/cmd/azure.ts";
import generateCircleCIConfig from "https://deno.land/x/fluentci@v0.10.9/src/cmd/circleci.ts";
import docs from "https://deno.land/x/fluentci@v0.10.9/src/cmd/docs.ts";
import cache from "https://deno.land/x/fluentci@v0.10.9/src/cmd/cache.ts";
import doctor from "https://deno.land/x/fluentci@v0.10.9/src/cmd/doctor.ts";
import showEnvs from "https://deno.land/x/fluentci@v0.10.9/src/cmd/env.ts";
import login from "https://deno.land/x/fluentci@v0.10.9/src/cmd/login.ts";
import publish from "https://deno.land/x/fluentci@v0.10.9/src/cmd/publish.ts";
import startAgent, {
  listAgents,
} from "https://deno.land/x/fluentci@v0.10.9/src/cmd/agent.ts";
import whoami from "https://deno.land/x/fluentci@v0.10.9/src/cmd/whoami.ts";
import { Client } from "https://esm.sh/@dagger.io/dagger@0.9.6";
import { GraphQLClient } from "https://esm.sh/graphql-request@6.1.0";

const ls = listJobs;

let client: Client;

// Prefer DAGGER_SESSION_PORT if set
const daggerSessionPort = Deno.env.get("DAGGER_SESSION_PORT");
if (daggerSessionPort) {
  const sessionToken = Deno.env.get("DAGGER_SESSION_TOKEN");
  if (!sessionToken) {
    throw new Error(
      "DAGGER_SESSION_TOKEN must be set when using DAGGER_SESSION_PORT"
    );
  }

  client = new Client({
    ctx: {
      connection: async () => {
        return new GraphQLClient(
          `http://127.0.0.1:${daggerSessionPort}/query`,
          {
            headers: {
              Authorization: `Basic ${btoa(sessionToken + ":")}`,
            },
          }
        );
      },
      close: () => {},
    },
  });
} else {
  throw new Error("DAGGER_SESSION_PORT must be set");
}
