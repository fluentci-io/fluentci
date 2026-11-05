//// Pure native primitives. All effects run inside the compiled host DAG.

import fluentci/host
import gleam/option.{type Option, None}

pub type Connection {
  Connection(
    host: String,
    user: Option(String),
    port: Int,
    identity: Option(String),
    install: Bool,
  )
}

pub type Direction {
  Upload
  Download
}

pub type Action {
  Get
  Put
  List
  Delete
}

pub type Algorithm {
  Sha256
  Sha512
}

pub fn connection(host: String) -> Connection {
  Connection(host, None, 22, None, True)
}

fn algorithm_name(value: Algorithm) -> String {
  case value {
    Sha256 -> "sha256"
    Sha512 -> "sha512"
  }
}

fn direction(value: Direction) -> String {
  case value {
    Upload -> "upload"
    Download -> "download"
  }
}

fn action(value: Action) -> String {
  case value {
    Get -> "get"
    Put -> "put"
    List -> "list"
    Delete -> "delete"
  }
}

@external(javascript, "../../remote_ffi.mjs", "detect")
fn detect(kind: String) -> host.Primitive

@external(javascript, "../../remote_ffi.mjs", "digest")
fn digest(algorithm: String, source: String, value: String) -> host.Primitive

@external(javascript, "../../remote_ffi.mjs", "ssh")
fn ssh_operation(
  connection: Connection,
  command: List(String),
) -> host.Primitive

@external(javascript, "../../remote_ffi.mjs", "transfer")
fn transfer(
  kind: String,
  connection: Connection,
  direction: String,
  source: String,
  destination: String,
) -> host.Primitive

@external(javascript, "../../remote_ffi.mjs", "ftp")
fn ftp_operation(
  kind: String,
  url: String,
  action: String,
  path: Option(String),
  username_env: Option(String),
  password_env: Option(String),
  install: Bool,
) -> host.Primitive

@external(javascript, "../../remote_ffi.mjs", "s3")
fn s3_operation(
  bucket: String,
  key: String,
  action: String,
  path: Option(String),
  endpoint: Option(String),
  region: Option(String),
  install: Bool,
) -> host.Primitive

pub fn os(id: String, cwd: String) -> host.Task {
  host.task(id, "", cwd) |> host.with_primitive(detect("os"))
}

pub fn arch(id: String, cwd: String) -> host.Task {
  host.task(id, "", cwd) |> host.with_primitive(detect("arch"))
}

pub fn digest_text(
  id: String,
  algorithm: Algorithm,
  text: String,
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(digest(algorithm_name(algorithm), "text", text))
}

pub fn digest_file(
  id: String,
  algorithm: Algorithm,
  path: String,
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(digest(algorithm_name(algorithm), "file", path))
}

pub fn ssh(
  id: String,
  connection: Connection,
  command: List(String),
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(ssh_operation(connection, command))
}

pub fn scp(
  id: String,
  connection: Connection,
  mode: Direction,
  source: String,
  destination: String,
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(transfer(
    "scp",
    connection,
    direction(mode),
    source,
    destination,
  ))
}

pub fn sftp(
  id: String,
  connection: Connection,
  mode: Direction,
  source: String,
  destination: String,
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(transfer(
    "sftp",
    connection,
    direction(mode),
    source,
    destination,
  ))
}

pub fn rsync(
  id: String,
  connection: Connection,
  mode: Direction,
  source: String,
  destination: String,
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(transfer(
    "rsync",
    connection,
    direction(mode),
    source,
    destination,
  ))
}

pub fn ftp(
  id: String,
  url: String,
  mode: Action,
  path: Option(String),
  username_env: Option(String),
  password_env: Option(String),
  install: Bool,
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(ftp_operation(
    "ftp",
    url,
    action(mode),
    path,
    username_env,
    password_env,
    install,
  ))
}

pub fn ftps(
  id: String,
  url: String,
  mode: Action,
  path: Option(String),
  username_env: Option(String),
  password_env: Option(String),
  install: Bool,
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(ftp_operation(
    "ftps",
    url,
    action(mode),
    path,
    username_env,
    password_env,
    install,
  ))
}

pub fn s3(
  id: String,
  bucket: String,
  key: String,
  mode: Action,
  path: Option(String),
  endpoint: Option(String),
  region: Option(String),
  install: Bool,
  cwd: String,
) -> host.Task {
  host.task(id, "", cwd)
  |> host.with_primitive(s3_operation(
    bucket,
    key,
    action(mode),
    path,
    endpoint,
    region,
    install,
  ))
}
