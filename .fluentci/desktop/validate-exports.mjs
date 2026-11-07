import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export function validateExports(
  entry,
  declarations = readFileSync(
    new URL("./imports.d.ts", import.meta.url),
    "utf8",
  ),
) {
  const main = declarations.match(/declare module "main"\s*\{([^}]+)\}/);
  assert.ok(main, "Desktop Wasm declarations must define module main");
  const declared = [...main[1].matchAll(/export function (\w+)\(/g)]
    .map((match) => match[1])
    .sort();
  assert.deepEqual(
    declared,
    Object.keys(entry).sort(),
    "Desktop Wasm declarations must match JavaScript exports",
  );
}
