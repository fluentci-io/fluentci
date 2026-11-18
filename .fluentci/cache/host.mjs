import * as Setup from "./output/CI.Cache.Setup/index.js";
import * as Generic from "./output/CI.Cache.Generic/index.js";
import { fromAff } from "./output/Control.Promise/index.js";
import { build } from "./run.mjs";
const operation = process.argv[1];
const input = JSON.parse(process.argv[2] || "{}");
const env = { ...process.env };
if (input.url?.trim()) env.FLUENTCI_CACHE_URL = input.url.trim();
let result;
try {
  if (operation === "setup")
    result = await fromAff(
      Setup.setup(env)(input.url ?? "")(input.protocol)(
        input.configDir ?? `.fluentci/cache/${input.protocol}`,
      )(input.repository ?? "buildkit/default:cache"),
    )();
  else if (operation === "save")
    result = await fromAff(
      Generic.save(env)(input.url ?? "")(input.key)(input.path)(
        input.compression ?? "zstd",
      ),
    )();
  else if (operation === "restore")
    result = await fromAff(
      Generic.restore(env)(input.url ?? "")(input.key)(input.path)(
        input.required ?? false,
      ),
    )();
  else if (operation === "nixBuild") {
    await build(env, undefined, undefined, {
      flake: input.flake ?? ".#default",
    });
    result = { outcome: "success" };
  } else throw Error("Unknown cache operation");
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
