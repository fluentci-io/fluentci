const optional = (value) => (value.isSome() ? value[0] : undefined);
const connection = (value) => ({
  host: value.host,
  user: optional(value.user),
  port: value.port,
  identity: optional(value.identity),
  install: value.install,
});
export const primitiveJson = (value) => JSON.stringify(value);
export const detect = (kind) => Object.freeze({ kind });
export const digest = (algorithm, source, value) =>
  Object.freeze({ kind: "digest", algorithm, input: { source, value } });
export const ssh = (value, command) =>
  Object.freeze({
    kind: "ssh",
    connection: connection(value),
    command: command.toArray(),
  });
export const transfer = (kind, value, direction, source, destination) =>
  Object.freeze({
    kind,
    connection: connection(value),
    direction,
    source,
    destination,
  });
export const ftp = (
  kind,
  url,
  action,
  path,
  username_env,
  password_env,
  install,
) =>
  Object.freeze({
    kind,
    url,
    action,
    path: optional(path),
    username_env: optional(username_env),
    password_env: optional(password_env),
    install,
  });
export const s3 = (bucket, key, action, path, endpoint, region, install) =>
  Object.freeze({
    kind: "s3",
    bucket,
    key,
    action,
    path: optional(path),
    endpoint: optional(endpoint),
    region: optional(region),
    install,
  });
