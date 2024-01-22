import Client, { connect } from "https://sdk.fluentci.io/v0.1.9/mod.ts";
import { fmt, lint, test } from "https://deno.land/x/deno_pipeline/mod.ts";

function pipeline(src = ".") {
  connect(async (client: Client) => {
    await fmt(client, src);
    await lint(client, src);
    await test(client, src);
  });
}

pipeline();
