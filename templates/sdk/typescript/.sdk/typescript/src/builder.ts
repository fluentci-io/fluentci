import { createGQLClient } from "./client.ts";
import { Context } from "./context.ts";
import { env } from "../deps.ts";

/**
 * @hidden
 *
 * Initialize a default client context from environment.
 */
export function initDefaultContext(): Context {
  let ctx = new Context();

  // Prefer FLUENTCI_SESSION_PORT if set
  const fluentciSessionPort = env.get("FLUENTCI_SESSION_PORT");
  if (fluentciSessionPort) {
    const sessionToken = env.get("FLUENTCI_SESSION_TOKEN");
    if (!sessionToken) {
      throw new Error(
        "FLUENTCI_SESSION_TOKEN must be set when using FLUENTCI_SESSION_PORT"
      );
    }

    ctx = new Context({
      client: createGQLClient(Number(fluentciSessionPort), sessionToken),
    });
  } else {
    throw new Error("FLUENTCI_SESSION_PORT must be set");
  }

  return ctx;
}
