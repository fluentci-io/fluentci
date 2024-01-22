import { fmt, lint, test } from "https://deno.land/x/deno_pipeline/mod.ts";

await fmt();
await lint();
await test();
