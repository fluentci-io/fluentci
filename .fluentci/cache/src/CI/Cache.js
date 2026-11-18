import { Just, Nothing } from "../Data.Maybe/index.js";

// The compiler/WIT boundary checks field types. Encode the flat record without
// deeply recursive Argonaut row dictionaries (large Buildx contracts exceed the
// guest engine's initialization stack otherwise).
export const encodeInput = (args) => {
  const object = {};
  for (const [key, wrapped] of Object.entries(args)) {
    if (wrapped === Nothing.value) continue;
    const value = wrapped instanceof Just ? wrapped.value0 : wrapped;
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)) ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))
    )
      object[key] = value;
    else throw Error("Unsupported typed argument " + key);
  }
  return object;
};
