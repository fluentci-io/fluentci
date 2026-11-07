// SDK compatibility lives entirely in the guest; the component boundary is WIT.
import * as api from "fluentci:runtime/api@0.1.0";
import { log } from "fluentci:runtime/host@0.1.0";
import schema from "./component-host-schema.json";

const camel = (name) =>
  name.replace(/-([a-z])/g, (_, value) => value.toUpperCase());

export function convert(type, value, encode) {
  switch (type.kind) {
    case "scalar": {
      if (encode && ["u64", "s64"].includes(type.type)) {
        if (typeof value === "number" && !Number.isSafeInteger(value))
          throw Error("A 64-bit integer must be exact");
        const integer = BigInt(value);
        if (
          type.type === "u64" &&
          (integer < 0n || integer > 18446744073709551615n)
        )
          throw Error("Unsigned integer is out of range");
        return integer;
      }
      if (!encode && typeof value === "bigint") {
        const number = Number(value);
        if (!Number.isSafeInteger(number))
          throw Error(
            "The SDK JSON compatibility API cannot represent this integer exactly; use native WIT bindings",
          );
        return number;
      }
      return value;
    }
    case "json":
      return encode ? JSON.stringify(value) : JSON.parse(value);
    case "option":
      return value == null
        ? encode
          ? undefined
          : null
        : convert(type.value, value, encode);
    case "list": {
      const items = Array.from(value, (item) =>
        convert(type.value, item, encode),
      );
      return encode && type.value.kind === "scalar" && type.value.type === "u8"
        ? Uint8Array.from(items)
        : items;
    }
    case "tuple":
      return type.items.map((type, index) =>
        convert(type, value[index], encode),
      );
    case "map":
      return encode
        ? Object.entries(value).map(([key, value]) => [
            key,
            convert(type.value, value, encode),
          ])
        : Object.fromEntries(
            value.map(([key, value]) => [
              key,
              convert(type.value, value, encode),
            ]),
          );
    case "ref": {
      const model = schema.models[type.name];
      if (model.kind === "record") {
        const output = {};
        for (const field of model.fields) {
          const input = value[encode ? field.name : camel(field.wit)];
          if (!encode && input === undefined && field.omitNull) continue;
          output[encode ? camel(field.wit) : field.name] = convert(
            field.type,
            input,
            encode,
          );
        }
        return output;
      }
      const unit = model.cases.every((item) => !item.type);
      let name, payload;
      if (encode) {
        if (model.tag) {
          name = value[model.tag];
          payload = model.content
            ? value[model.content]
            : Object.fromEntries(
                Object.entries(value).filter(([key]) => key !== model.tag),
              );
        } else if (unit) name = value;
        else {
          if (Object.keys(value).length !== 1)
            throw Error("Expected exactly one variant");
          [[name, payload]] = Object.entries(value);
        }
      } else if (unit && !model.tag) name = value;
      else {
        name = value.tag;
        payload = value.val;
      }
      const item = model.cases.find(
        (item) => item[encode ? "name" : "wit"] === name,
      );
      if (!item) throw Error(`Unknown ${type.name} variant`);
      const data = item.type ? convert(item.type, payload, encode) : undefined;
      if (encode)
        return unit && !model.tag
          ? item.wit
          : { tag: item.wit, ...(item.type ? { val: data } : {}) };
      if (model.tag)
        return {
          ...(model.content ? { [model.content]: data } : (data ?? {})),
          [model.tag]: item.name,
        };
      return unit ? item.name : { [item.name]: data };
    }
    default:
      throw Error(`Unsupported wire kind ${type.kind}`);
  }
}

export function invoke(name, input = "") {
  const operation = schema.operations[name];
  if (!operation) throw Error(`Unknown FluentCI host operation ${name}`);
  const fn = api[camel(operation.wit)];
  let result;
  if (name === "execute_plan") {
    const { plan, run_dir } = JSON.parse(input);
    result = fn(convert(operation.input, plan, true), run_dir);
  } else {
    const value = operation.inputJson ? JSON.parse(input) : input;
    result = operation.input ? fn(convert(operation.input, value, true)) : fn();
  }
  if (!operation.output) return "";
  const value = convert(operation.output, result, false);
  return operation.outputJson || name === "execute_plan"
    ? JSON.stringify(value)
    : value;
}

// Existing SDKs share this small in-process string-block facade. No Extism
// module, guest memory ABI, or Extism host imports are loaded or instantiated.
let next = 1n;
const blocks = new Map();
function allocate(value) {
  const offset = next++;
  blocks.set(offset, String(value));
  return { offset };
}
function read(offset, consume = false) {
  if (!blocks.has(offset)) throw Error("Invalid SDK value handle");
  const value = blocks.get(offset);
  if (consume) blocks.delete(offset);
  return value;
}
export const Memory = {
  fromString: allocate,
  fromJsonObject: (value) => allocate(JSON.stringify(value)),
  find(offset) {
    const value = read(offset, true);
    return { readString: () => value, readJsonObject: () => JSON.parse(value) };
  },
};
let invocationInput = "";
export function setInvocationInput(value) {
  invocationInput = value;
}
const functions = Object.fromEntries(
  Object.entries(schema.operations).map(([name, operation]) => [
    name,
    (offset) => {
      const result = invoke(name, operation.input ? read(offset, true) : "");
      return operation.output ? allocate(result).offset : undefined;
    },
  ]),
);
export const Host = {
  getFunctions: () => functions,
  inputString: () => invocationInput,
  outputString: (value) => log(String(value)),
};
