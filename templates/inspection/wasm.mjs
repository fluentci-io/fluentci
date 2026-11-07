import { createHash } from "node:crypto";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

function uint(bytes, state) {
  let value = 0;
  for (let shift = 0; shift < 35; shift += 7) {
    if (state.offset >= bytes.length) throw Error("Truncated Wasm section");
    const byte = bytes[state.offset++];
    value += (byte & 127) * 2 ** shift;
    if (!(byte & 128)) {
      if (value > 0xffffffff) throw Error("Invalid Wasm section length");
      return value;
    }
  }
  throw Error("Invalid Wasm integer");
}

function leb(value) {
  const bytes = [];
  do {
    const byte = value & 127;
    value = Math.floor(value / 128);
    bytes.push(byte | (value ? 128 : 0));
  } while (value);
  return Buffer.from(bytes);
}

function name(bytes, state) {
  const length = uint(bytes, state);
  const end = state.offset + length;
  if (end > bytes.length) throw Error("Truncated Wasm name");
  const value = new TextDecoder("utf-8", { fatal: true }).decode(
    bytes.subarray(state.offset, end),
  );
  state.offset = end;
  return value;
}

export function annotate(bytes, functions) {
  const component = bytes
    .subarray(0, 8)
    .equals(Buffer.from([0, 97, 115, 109, 13, 0, 1, 0]));
  if (
    !component &&
    !bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]))
  )
    throw Error("Expected a core Wasm module");
  const sections = [bytes.subarray(0, 8)];
  const exports = new Set();
  const state = { offset: 8 };
  while (state.offset < bytes.length) {
    const start = state.offset;
    const id = bytes[state.offset++];
    const length = uint(bytes, state);
    const end = state.offset + length;
    if (end > bytes.length) throw Error("Truncated Wasm payload");
    const payload = bytes.subarray(state.offset, end);
    const reader = { offset: 0 };
    const replace = id === 0 && name(payload, reader) === "fluentci:metadata";
    if (!component && id === 7) {
      const count = uint(payload, reader);
      for (let i = 0; i < count; i++) {
        const value = name(payload, reader);
        const kind = payload[reader.offset++];
        uint(payload, reader);
        if (
          kind === 0 &&
          !value.startsWith("__") &&
          !value.startsWith("PyInit_") &&
          !["_start", "_initialize"].includes(value)
        )
          exports.add(value);
      }
    }
    if (!replace) sections.push(bytes.subarray(start, end));
    state.offset = end;
  }
  const seen = new Set();
  for (const fn of functions) {
    if ((!component && !exports.has(fn.name)) || seen.has(fn.name))
      throw Error(`Inspection does not match Wasm export ${fn.name}`);
    seen.add(fn.name);
  }
  if ([...exports].some((value) => !seen.has(value)))
    throw Error(
      `Missing inspected exports: ${[...exports].filter((value) => !seen.has(value)).join(", ")}`,
    );
  const json = Buffer.from(JSON.stringify({ functions }));
  if (json.length > 256 * 1024)
    throw Error("Function metadata exceeds 256 KiB");
  const key = Buffer.from("fluentci:metadata");
  const payload = Buffer.concat([leb(key.length), key, json]);
  return Buffer.concat([
    ...sections,
    Buffer.from([0]),
    leb(payload.length),
    payload,
  ]);
}

export async function embedInspection(artifact, functions) {
  const bytes = annotate(await readFile(artifact), functions);
  const temporary = `${artifact}.${randomUUID()}.tmp`;
  await mkdir(dirname(artifact), { recursive: true });
  await writeFile(temporary, bytes);
  await rename(temporary, artifact);
  const manifest = {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    functions,
  };
  await writeFile(
    join(dirname(artifact), "fluentci.metadata.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  return manifest;
}
