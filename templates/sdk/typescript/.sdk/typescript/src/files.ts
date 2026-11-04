/** Pure native filesystem tasks; structured query values appear in file_result. */
import {task, type Task} from "./matrix.ts";
export type FileOperation = Readonly<{ op: "read_text"; path: string; limit_bytes: number }> |
  Readonly<{ op: "read_bytes"; path: string; limit_bytes: number }> |
  Readonly<{ op: "write_text"; path: string; text: string; overwrite: boolean }> |
  Readonly<{ op: "write_bytes"; path: string; bytes: readonly number[]; overwrite: boolean }> |
  Readonly<{ op: "copy_file"; source: string; destination: string; overwrite: boolean }> |
  Readonly<{ op: "copy_tree"; source: string; destination: string; overwrite: boolean }> |
  Readonly<{ op: "move"; source: string; destination: string; overwrite: boolean }> |
  Readonly<{ op: "mkdir"; path: string; parents: boolean }> |
  Readonly<{ op: "remove"; path: string; recursive: boolean; missing_ok: boolean }> |
  Readonly<{ op: "stat"; path: string }> |
  Readonly<{ op: "exists"; path: string }> |
  Readonly<{ op: "list"; path: string }> |
  Readonly<{ op: "glob"; pattern: string }> |
  Readonly<{ op: "hash"; path: string }> |
  Readonly<{ op: "chmod"; path: string; mode: number }> |
  Readonly<{ op: "symlink"; target: string; path: string }>;
export const fileTask = (id: string, operation: FileOperation, cwd = "."): Task => Object.freeze({...task(id, "", [], cwd), file_operation: Object.freeze({...operation})});
export const envFile = (value: Task, path: string): Task => Object.freeze({...value, env_files: Object.freeze([...(value.env_files ?? []), path])});
export const readText = (id: string, path: string, limitBytes = 1048576, cwd = "."): Task => fileTask(id, {op: "read_text", path, limit_bytes: limitBytes}, cwd);
export const readBytes = (id: string, path: string, limitBytes = 1048576, cwd = "."): Task => fileTask(id, {op: "read_bytes", path, limit_bytes: limitBytes}, cwd);
export const writeText = (id: string, path: string, text: string, overwrite = false, cwd = "."): Task => fileTask(id, {op: "write_text", path, text, overwrite}, cwd);
export const writeBytes = (id: string, path: string, bytes: readonly number[], overwrite = false, cwd = "."): Task => fileTask(id, {op: "write_bytes", path, bytes: Object.freeze([...bytes]), overwrite}, cwd);
export const copyFile = (id: string, source: string, destination: string, overwrite = false, cwd = "."): Task => fileTask(id, {op: "copy_file", source, destination, overwrite}, cwd);
export const copyTree = (id: string, source: string, destination: string, overwrite = false, cwd = "."): Task => fileTask(id, {op: "copy_tree", source, destination, overwrite}, cwd);
export const move = (id: string, source: string, destination: string, overwrite = false, cwd = "."): Task => fileTask(id, {op: "move", source, destination, overwrite}, cwd);
export const mkdir = (id: string, path: string, parents = false, cwd = "."): Task => fileTask(id, {op: "mkdir", path, parents}, cwd);
export const remove = (id: string, path: string, recursive = false, missingOk = false, cwd = "."): Task => fileTask(id, {op: "remove", path, recursive, missing_ok: missingOk}, cwd);
export const stat = (id: string, path: string, cwd = "."): Task => fileTask(id, {op: "stat", path}, cwd);
export const exists = (id: string, path: string, cwd = "."): Task => fileTask(id, {op: "exists", path}, cwd);
export const list = (id: string, path = ".", cwd = "."): Task => fileTask(id, {op: "list", path}, cwd);
export const glob = (id: string, pattern: string, cwd = "."): Task => fileTask(id, {op: "glob", pattern}, cwd);
export const hash = (id: string, path: string, cwd = "."): Task => fileTask(id, {op: "hash", path}, cwd);
export const chmod = (id: string, path: string, mode: number, cwd = "."): Task => fileTask(id, {op: "chmod", path, mode}, cwd);
export const symlink = (id: string, target: string, path: string, cwd = "."): Task => fileTask(id, {op: "symlink", target, path}, cwd);
