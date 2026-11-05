/** Pure operations; the native executor owns IO, provisioning and cancellation. */
import { task as baseTask, type Task } from "./matrix.ts";
export type Connection = Readonly<{
  host: string;
  user?: string;
  port?: number;
  identity?: string;
  install?: boolean;
}>;
export type Direction = "upload" | "download";
export type Action = "get" | "put" | "list" | "delete";
export type Algorithm = "sha256" | "sha512";
export type Input = Readonly<{ source: "text" | "file"; value: string }>;
export type Operation =
  | Readonly<{ kind: "os" | "arch" }>
  | Readonly<{ kind: "digest"; algorithm: Algorithm; input: Input }>
  | Readonly<{
      kind: "ssh";
      connection: Connection;
      command: readonly string[];
    }>
  | Readonly<{
      kind: "scp" | "sftp" | "rsync";
      connection: Connection;
      direction: Direction;
      source: string;
      destination: string;
    }>
  | Readonly<{
      kind: "ftp" | "ftps";
      url: string;
      action: Action;
      path?: string;
      username_env?: string;
      password_env?: string;
      install?: boolean;
    }>
  | Readonly<{
      kind: "s3";
      bucket: string;
      key: string;
      action: Action;
      path?: string;
      endpoint?: string;
      region?: string;
      install?: boolean;
    }>;
export const task = (id: string, primitive: Operation, cwd = "."): Task =>
  Object.freeze({ ...baseTask(id, "", [], cwd), primitive });
export const os = (id: string, cwd = "."): Task =>
  task(id, { kind: "os" }, cwd);
export const arch = (id: string, cwd = "."): Task =>
  task(id, { kind: "arch" }, cwd);
export const digestText = (
  id: string,
  algorithm: Algorithm,
  text: string,
  cwd = ".",
): Task =>
  task(
    id,
    { kind: "digest", algorithm, input: { source: "text", value: text } },
    cwd,
  );
export const digestFile = (
  id: string,
  algorithm: Algorithm,
  path: string,
  cwd = ".",
): Task =>
  task(
    id,
    { kind: "digest", algorithm, input: { source: "file", value: path } },
    cwd,
  );
export const ssh = (
  id: string,
  connection: Connection,
  command: readonly string[],
  cwd = ".",
): Task => task(id, { kind: "ssh", connection, command }, cwd);
export const scp = (
  id: string,
  connection: Connection,
  direction: Direction,
  source: string,
  destination: string,
  cwd = ".",
): Task =>
  task(id, { kind: "scp", connection, direction, source, destination }, cwd);
export const sftp = (
  id: string,
  connection: Connection,
  direction: Direction,
  source: string,
  destination: string,
  cwd = ".",
): Task =>
  task(id, { kind: "sftp", connection, direction, source, destination }, cwd);
export const rsync = (
  id: string,
  connection: Connection,
  direction: Direction,
  source: string,
  destination: string,
  cwd = ".",
): Task =>
  task(id, { kind: "rsync", connection, direction, source, destination }, cwd);
export const ftp = (
  id: string,
  options: Omit<Extract<Operation, { kind: "ftp" | "ftps" }>, "kind">,
  cwd = ".",
): Task => task(id, { ...options, kind: "ftp" }, cwd);
export const ftps = (
  id: string,
  options: Omit<Extract<Operation, { kind: "ftp" | "ftps" }>, "kind">,
  cwd = ".",
): Task => task(id, { ...options, kind: "ftps" }, cwd);
export const s3 = (
  id: string,
  options: Omit<Extract<Operation, { kind: "s3" }>, "kind">,
  cwd = ".",
): Task => task(id, { ...options, kind: "s3" }, cwd);
