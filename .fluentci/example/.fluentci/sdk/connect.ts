import { Writable } from "node:stream";

import { Client } from "./client.gen.ts";

/**
 * ConnectOpts defines option used to connect to an engine.
 */
export interface ConnectOpts {
  /**
   * Use to overwrite Dagger workdir
   * @defaultValue process.cwd()
   */
  Workdir?: string;
  /**
   * Enable logs output
   * @example
   * LogOutput
   * ```ts
   * connect(async (client: Client) => {
    const source = await client.host().workdir().id()
    ...
    }, {LogOutput: process.stdout})
    ```
   */
  LogOutput?: Writable;
}

export type CallbackFct = (client: Client) => Promise<void>;

export interface ConnectParams {
  port: number;
  session_token: string;
}

/**
 * connect runs GraphQL server and initializes a
 * GraphQL client to execute query on it through its callback.
 * This implementation is based on the existing Go SDK.
 */
export async function connect(
  cb: CallbackFct,
  config: ConnectOpts = {}
): Promise<void> {
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

    if (config.Workdir && config.Workdir !== "") {
      throw new Error(
        "cannot configure workdir for existing session (please use --workdir or host.directory with absolute paths instead)"
      );
    }

    client = new Client({
      host: `127.0.0.1:${daggerSessionPort}`,
      sessionToken: sessionToken,
    });
  } else {
    throw new Error("DAGGER_SESSION_PORT must be set");
  }

  await cb(client);
}
