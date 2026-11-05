/// Pure native filesystem task constructors.
import fluentci/host

pub fn read_text(
  id: String,
  path: String,
  limit_bytes: Int,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.ReadText(path, limit_bytes), cwd)
}

pub fn read_bytes(
  id: String,
  path: String,
  limit_bytes: Int,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.ReadBytes(path, limit_bytes), cwd)
}

pub fn write_text(
  id: String,
  path: String,
  text: String,
  overwrite: Bool,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.WriteText(path, text, overwrite), cwd)
}

pub fn write_bytes(
  id: String,
  path: String,
  bytes: List(Int),
  overwrite: Bool,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.WriteBytes(path, bytes, overwrite), cwd)
}

pub fn copy_file(
  id: String,
  source: String,
  destination: String,
  overwrite: Bool,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.CopyFile(source, destination, overwrite), cwd)
}

pub fn copy_tree(
  id: String,
  source: String,
  destination: String,
  overwrite: Bool,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.CopyTree(source, destination, overwrite), cwd)
}

pub fn move(
  id: String,
  source: String,
  destination: String,
  overwrite: Bool,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.Move(source, destination, overwrite), cwd)
}

pub fn mkdir(
  id: String,
  path: String,
  parents: Bool,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.Mkdir(path, parents), cwd)
}

pub fn remove(
  id: String,
  path: String,
  recursive: Bool,
  missing_ok: Bool,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.Remove(path, recursive, missing_ok), cwd)
}

pub fn stat(id: String, path: String, cwd: String) -> host.Task {
  host.file_task(id, host.Stat(path), cwd)
}

pub fn exists(id: String, path: String, cwd: String) -> host.Task {
  host.file_task(id, host.Exists(path), cwd)
}

pub fn list_entries(id: String, path: String, cwd: String) -> host.Task {
  host.file_task(id, host.ListEntries(path), cwd)
}

pub fn glob(id: String, pattern: String, cwd: String) -> host.Task {
  host.file_task(id, host.Glob(pattern), cwd)
}

pub fn hash(id: String, path: String, cwd: String) -> host.Task {
  host.file_task(id, host.Hash(path), cwd)
}

pub fn chmod(id: String, path: String, mode: Int, cwd: String) -> host.Task {
  host.file_task(id, host.Chmod(path, mode), cwd)
}

pub fn symlink(
  id: String,
  target: String,
  path: String,
  cwd: String,
) -> host.Task {
  host.file_task(id, host.Symlink(target, path), cwd)
}

pub fn env_file(task: host.Task, path: String) -> host.Task {
  host.env_file(task, path)
}
