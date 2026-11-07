// This file is bundled into the guest. It has no Node or build-time dependencies.
function matches(value, type) {
  if (type.endsWith("[]"))
    return (
      Array.isArray(value) &&
      value.every((item) => matches(item, type.slice(0, -2)))
    );
  if (type === "string")
    return typeof value === "string" && !value.includes("\0");
  if (type === "boolean") return typeof value === "boolean";
  if (type === "integer")
    return (
      Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
    );
  if (type === "number")
    return typeof value === "number" && Number.isFinite(value);
  return false;
}

export function readArguments(fields, input = Host.inputString()) {
  const value = JSON.parse(input);
  if (!value || Array.isArray(value) || typeof value !== "object")
    throw Error("Expected a named argument object");
  for (const key of Object.keys(value))
    if (!fields.some((field) => field.name === key))
      throw Error(`Unknown argument ${key}`);
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(value, field.name)) {
      if (field.required !== false)
        throw Error(`Missing required argument ${field.name}`);
    } else if (!matches(value[field.name], field.type))
      throw Error(`${field.name} expects ${field.type}`);
  }
  return value;
}

export function writeResult(value) {
  if (value !== undefined)
    Host.outputString(
      typeof value === "string" ? value : JSON.stringify(value),
    );
}
