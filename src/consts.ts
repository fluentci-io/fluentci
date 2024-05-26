import { dir } from "../deps.ts";

export const VERSION = "0.14.2";

export const BASE_URL = "https://api.fluentci.io/v1";

const FLUENTCI_HOST = Deno.env.get("FLUENTCI_HOST") || "vm.fluentci.io";

const scheme =
  FLUENTCI_HOST.startsWith("localhost") ||
  FLUENTCI_HOST.split(":")[0].match(/(?:[0-9]{1,3}\.){3}[0-9]{1,3}/)
    ? "http"
    : "https";

export const FLUENTCI_API_URL = `${scheme}://${FLUENTCI_HOST}`;
export const FLUENTCI_WS_URL = "wss://events.fluentci.io";
export const FLUENTCI_EVENTS_URL = "https://events.fluentci.io";
export const RUNNER_URL = "https://whole-dove-21.deno.dev";

export const BUILD_DIR = `${dir("home")}/.fluentci/builds`;

export const FLUENTCI_KV_PREFIX = "fluentci";
