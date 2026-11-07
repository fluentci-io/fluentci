export function documentation(text = "") {
  const params = {};
  const description = [];
  for (const line of String(text ?? "").split("\n")) {
    const param = /^\s*(?:@param\s+|:param\s+)([\w-]+)\s*(?::|-)?\s*(.*)$/.exec(
      line,
    );
    if (param) params[param[1]] = param[2];
    else if (!/^\s*@(?:returns?|param)\b/.test(line)) description.push(line);
  }
  return { description: description.join("\n").trim() || undefined, params };
}

export function publicMetadata(exports) {
  return exports.map(({ name, args, returnType, description }) => ({
    name,
    ...(description ? { description } : {}),
    ...(args ? { inputFormat: "json", args } : {}),
    returnType,
  }));
}

export function field(name, type, required = true, description) {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name) || name === "help")
    throw Error(`Unsupported argument field ${name}`);
  if (
    !["string", "integer", "number", "boolean"].includes(
      type.replace(/\[\]$/, ""),
    )
  )
    throw Error(`Unsupported CLI field type ${type}`);
  return {
    name,
    type,
    ...(required ? {} : { required: false }),
    ...(description ? { description } : {}),
  };
}
