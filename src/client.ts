import { GraphQLClient } from "../deps.ts";

const endpoint =
  Deno.env.get("FLUENTCI_GRAPHQL_API") || "http://127.0.0.1:6076/graphql";

export default new GraphQLClient(endpoint);
