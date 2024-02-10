import { createYoga } from "../../deps.ts";
import { schema } from "../server/graphql/schema.ts";

function studio({ port }: { port?: number }) {
  const yoga = createYoga({
    schema,
  });

  Deno.serve({ port: port || 5090 }, yoga);
}

export default studio;
