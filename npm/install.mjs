import { ensureBinary } from "./lib/install.mjs";

if (process.env.FLUENTCI_SKIP_DOWNLOAD !== "1") {
  try {
    await ensureBinary();
  } catch (error) {
    console.error(`Could not install FluentCI: ${error.message}`);
    process.exitCode = 1;
  }
}
