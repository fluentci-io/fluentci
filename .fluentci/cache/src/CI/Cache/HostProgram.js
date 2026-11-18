// This FFI is consumed from output/CI.Cache.HostProgram/foreign.js.
// build.mjs writes the self-contained compressed host payload before packaging.
import { hostProgram as embedded } from "../../dist/embedded-host.mjs";
export const hostProgram = embedded;
