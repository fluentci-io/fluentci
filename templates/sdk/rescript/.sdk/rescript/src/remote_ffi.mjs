const task = (id, primitive, cwd) =>
  Object.freeze({
    id,
    program: "",
    args: [],
    cwd,
    env: {},
    needs: [],
    primitive,
  });
const connection = (value) => ({
  host: value.host,
  user: value.user,
  port: value.port,
  identity: value.identity,
  install: value.install,
});
export const detect = (id, kind, cwd) => task(id, { kind }, cwd);
export const digest = (id, algorithm, source, value, cwd) =>
  task(id, { kind: "digest", algorithm, input: { source, value } }, cwd);
export const ssh = (id, value, command, cwd) =>
  task(
    id,
    { kind: "ssh", connection: connection(value), command: [...command] },
    cwd,
  );
export const transfer = (
  id,
  kind,
  value,
  direction,
  source,
  destination,
  cwd,
) =>
  task(
    id,
    { kind, connection: connection(value), direction, source, destination },
    cwd,
  );
export const ftp = (
  id,
  kind,
  url,
  action,
  path,
  username_env,
  password_env,
  install,
  cwd,
) =>
  task(
    id,
    { kind, url, action, path, username_env, password_env, install },
    cwd,
  );
export const s3 = (
  id,
  bucket,
  key,
  action,
  path,
  endpoint,
  region,
  install,
  cwd,
) =>
  task(
    id,
    { kind: "s3", bucket, key, action, path, endpoint, region, install },
    cwd,
  );
