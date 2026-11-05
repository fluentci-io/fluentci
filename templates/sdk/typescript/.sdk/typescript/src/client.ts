import { GraphQLClient, env } from "../deps.ts";

export function createGQLClient(port: number, token: string): GraphQLClient {
  const host = env.get("FLUENTCI_SESSION_HOST") || "127.0.0.1";
  return new GraphQLClient(`http://${host}:${port}/graphql`, {
    headers: {
      Authorization: "Basic " + btoa(token + ":"),
    },
  });
}
