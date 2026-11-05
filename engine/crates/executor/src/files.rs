//! Native, cancellable filesystem tasks. Paths are relative to the task workspace.
use crate::{cache, Cancellation, Task};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

fn read_limit() -> u64 {
    1024 * 1024
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operation {
    ReadText {
        path: PathBuf,
        #[serde(default = "read_limit")]
        limit_bytes: u64,
    },
    ReadBytes {
        path: PathBuf,
        #[serde(default = "read_limit")]
        limit_bytes: u64,
    },
    WriteText {
        path: PathBuf,
        text: String,
        #[serde(default)]
        overwrite: bool,
    },
    WriteBytes {
        path: PathBuf,
        bytes: Vec<u8>,
        #[serde(default)]
        overwrite: bool,
    },
    CopyFile {
        source: PathBuf,
        destination: PathBuf,
        #[serde(default)]
        overwrite: bool,
    },
    CopyTree {
        source: PathBuf,
        destination: PathBuf,
        #[serde(default)]
        overwrite: bool,
    },
    Move {
        source: PathBuf,
        destination: PathBuf,
        #[serde(default)]
        overwrite: bool,
    },
    Mkdir {
        path: PathBuf,
        #[serde(default)]
        parents: bool,
    },
    Remove {
        path: PathBuf,
        #[serde(default)]
        recursive: bool,
        #[serde(default)]
        missing_ok: bool,
    },
    Stat {
        path: PathBuf,
    },
    Exists {
        path: PathBuf,
    },
    List {
        path: PathBuf,
    },
    Glob {
        pattern: String,
    },
    Hash {
        path: PathBuf,
    },
    Chmod {
        path: PathBuf,
        mode: u32,
    },
    Symlink {
        target: PathBuf,
        path: PathBuf,
    },
}
fn relative(path: &Path, root_ok: bool) -> Result<(), String> {
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
        || (!root_ok && path.components().all(|c| c == Component::CurDir))
    {
        return Err(format!(
            "file path must stay inside cwd: {}",
            path.display()
        ));
    }
    Ok(())
}
impl Operation {
    pub fn validate(&self, task: &Task) -> Result<(), String> {
        if !task.program.is_empty()
            || !task.args.is_empty()
            || task.service.is_some()
            || task.package_install.is_some()
            || !task.package_environment.is_empty()
        {
            return Err(
                "file tasks cannot also contain a process, service, or package provider".into(),
            );
        }
        match self {
            Self::ReadText { path, limit_bytes } | Self::ReadBytes { path, limit_bytes } => {
                relative(path, false)?;
                if *limit_bytes == 0 || *limit_bytes > 1024 * 1024 {
                    return Err("file reads require limit_bytes between 1 and 1048576".into());
                }
            }
            Self::CopyFile {
                source,
                destination,
                ..
            }
            | Self::CopyTree {
                source,
                destination,
                ..
            }
            | Self::Move {
                source,
                destination,
                ..
            } => {
                relative(source, false)?;
                relative(destination, false)?;
                let normalized = |path: &Path| {
                    path.components()
                        .filter(|part| *part != Component::CurDir)
                        .collect::<PathBuf>()
                };
                let source = normalized(source);
                let destination = normalized(destination);
                if destination.starts_with(&source) || source.starts_with(&destination) {
                    return Err("file source and destination must not overlap".into());
                }
            }
            Self::Symlink { target, path } => {
                relative(target, false)?;
                relative(path, false)?;
            }
            Self::List { path } | Self::Stat { path } | Self::Exists { path } => {
                relative(path, true)?
            }
            Self::Glob { pattern } => {
                relative(Path::new(pattern), true)?;
                if pattern.contains(['[', ']', '\\']) {
                    return Err("glob supports *, ?, and ** path segments".into());
                }
            }
            Self::Chmod { path, mode } => {
                relative(path, false)?;
                if *mode > 0o777 {
                    return Err("file mode must be between 0 and 0777".into());
                }
            }
            Self::WriteText { path, .. }
            | Self::WriteBytes { path, .. }
            | Self::Mkdir { path, .. }
            | Self::Remove { path, .. }
            | Self::Hash { path } => relative(path, false)?,
        }
        if let Some(policy) = &task.cache {
            // Destructive operations cannot be replayed by restoring produced files.
            if matches!(
                self,
                Self::Move { .. } | Self::Remove { .. } | Self::Chmod { .. } | Self::Symlink { .. }
            ) {
                return Err(
                    "move, remove, chmod, and symlink tasks cannot be action cached".into(),
                );
            }
            let covered = |p: &Path| policy.inputs.iter().any(|r| p.starts_with(r));
            let produced = |p: &Path| policy.outputs.iter().any(|r| p.starts_with(r));
            match self {
                Self::ReadText { path, .. }
                | Self::ReadBytes { path, .. }
                | Self::Hash { path }
                | Self::Stat { path }
                | Self::Exists { path }
                | Self::List { path }
                    if !covered(path) =>
                {
                    return Err(
                        "cached file queries must declare their path in cache inputs".into(),
                    )
                }
                Self::Glob { pattern } if !pattern.split('/').next().is_some_and(|prefix| !prefix.contains(['*','?']) && covered(Path::new(prefix))) => {
                    return Err(
                        "cached glob tasks require a literal directory prefix declared in cache inputs".into(),
                    )
                }
                Self::CopyFile {
                    source,
                    destination,
                    ..
                }
                | Self::CopyTree {
                    source,
                    destination,
                    ..
                } if !covered(source) || !produced(destination) => {
                    return Err(
                        "cached copies must declare source inputs and destination outputs".into(),
                    )
                }
                Self::WriteText { path, .. }
                | Self::WriteBytes { path, .. }
                | Self::Mkdir { path, .. }
                    if !produced(path) =>
                {
                    return Err(
                        "cached file mutations must declare their destination outputs".into(),
                    )
                }
                _ => (),
            }
        }
        Ok(())
    }
}
fn check(cancel: &Cancellation) -> Result<(), String> {
    if cancel.is_cancelled() {
        Err("file operation cancelled".into())
    } else {
        Ok(())
    }
}
// Inspect parents without following symlinks. The final link can be inspected,
// moved or removed, but reads/copies/chmod never dereference links.
fn path(root: &Path, value: &Path, final_link: bool) -> Result<PathBuf, String> {
    relative(value, true)?;
    let mut full = root.to_path_buf();
    let parts: Vec<_> = value
        .components()
        .filter(|p| *p != Component::CurDir)
        .collect();
    for (i, part) in parts.iter().enumerate() {
        full.push(part.as_os_str());
        match fs::symlink_metadata(&full) {
            Ok(meta) if meta.file_type().is_symlink() && !(final_link && i + 1 == parts.len()) => {
                return Err(format!(
                    "file path traverses a symlink: {}",
                    value.display()
                ))
            }
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(format!("{}: {e}", value.display())),
        }
    }
    Ok(full)
}
fn regular(path: &Path) -> Result<File, String> {
    cache::open_storage_file(path).map_err(|e| format!("{}: {e}", path.display()))
}
fn read(path: &Path, limit: u64, cancel: &Cancellation) -> Result<Vec<u8>, String> {
    let mut file = regular(path)?;
    let mut result = Vec::new();
    let mut buffer = [0u8; 65536];
    loop {
        check(cancel)?;
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            return Ok(result);
        }
        if result.len() as u64 + n as u64 > limit {
            return Err(format!(
                "file exceeds limit_bytes {limit}: {}",
                path.display()
            ));
        }
        result.extend_from_slice(&buffer[..n]);
    }
}
fn commit(
    temp: tempfile::NamedTempFile,
    dest: &Path,
    overwrite: bool,
    cancel: &Cancellation,
) -> Result<(), String> {
    temp.as_file().sync_all().map_err(|e| e.to_string())?;
    check(cancel)?;
    if overwrite {
        temp.persist(dest)
    } else {
        temp.persist_noclobber(dest)
    }
    .map_err(|e| e.to_string())?;
    File::open(dest.parent().unwrap())
        .and_then(|d| d.sync_all())
        .map_err(|e| e.to_string())
}
fn write(dest: &Path, bytes: &[u8], overwrite: bool, cancel: &Cancellation) -> Result<(), String> {
    let mut temp =
        tempfile::NamedTempFile::new_in(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    for chunk in bytes.chunks(65536) {
        check(cancel)?;
        temp.write_all(chunk).map_err(|e| e.to_string())?;
    }
    commit(temp, dest, overwrite, cancel)
}
fn copy(source: &Path, dest: &Path, overwrite: bool, cancel: &Cancellation) -> Result<(), String> {
    let mut input = regular(source)?;
    let before = input.metadata().map_err(|e| e.to_string())?;
    let mut temp =
        tempfile::NamedTempFile::new_in(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    let mut buffer = [0u8; 65536];
    loop {
        check(cancel)?;
        let n = input.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        temp.write_all(&buffer[..n]).map_err(|e| e.to_string())?;
    }
    let after = input.metadata().map_err(|e| e.to_string())?;
    if before.len() != after.len() || before.modified().ok() != after.modified().ok() {
        return Err(format!("source changed during copy: {}", source.display()));
    }
    temp.as_file()
        .set_permissions(before.permissions())
        .map_err(|e| e.to_string())?;
    commit(temp, dest, overwrite, cancel)
}
fn entries(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !fs::symlink_metadata(dir)
        .map_err(|e| e.to_string())?
        .is_dir()
    {
        return Err(format!("not a directory: {}", dir.display()));
    }
    let mut result = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .map(|e| e.map(|e| e.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    result.sort();
    Ok(result)
}
fn copy_tree(
    source: &Path,
    dest: &Path,
    overwrite: bool,
    cancel: &Cancellation,
) -> Result<(), String> {
    check(cancel)?;
    match fs::create_dir(dest) {
        Ok(()) => (),
        Err(e)
            if overwrite
                && e.kind() == std::io::ErrorKind::AlreadyExists
                && fs::symlink_metadata(dest).is_ok_and(|m| m.is_dir()) => {}
        Err(e) => return Err(e.to_string()),
    };
    for entry in entries(source)? {
        check(cancel)?;
        let target = dest.join(entry.file_name().unwrap());
        let metadata = fs::symlink_metadata(&entry).map_err(|e| e.to_string())?;
        if metadata.is_dir() {
            copy_tree(&entry, &target, overwrite, cancel)?;
        } else if metadata.is_file() {
            copy(&entry, &target, overwrite, cancel)?;
        } else {
            return Err(format!(
                "copy_tree rejects links and special files: {}",
                entry.display()
            ));
        }
    }
    fs::set_permissions(
        dest,
        fs::metadata(source)
            .map_err(|e| e.to_string())?
            .permissions(),
    )
    .map_err(|e| e.to_string())
}
fn remove(path: &Path, recursive: bool, cancel: &Cancellation) -> Result<(), String> {
    check(cancel)?;
    let metadata = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        if recursive {
            for entry in entries(path)? {
                remove(&entry, true, cancel)?;
            }
        }
        fs::remove_dir(path).map_err(|e| e.to_string())
    } else {
        fs::remove_file(path).map_err(|e| e.to_string())
    }
}
fn segment(pattern: &str, value: &str) -> bool {
    let mut row = vec![false; value.chars().count() + 1];
    row[0] = true;
    let chars: Vec<_> = value.chars().collect();
    for p in pattern.chars() {
        let mut next = vec![false; chars.len() + 1];
        if p == '*' {
            next[0] = row[0];
        }
        for i in 0..chars.len() {
            next[i + 1] = if p == '*' {
                row[i + 1] || next[i]
            } else {
                row[i] && (p == '?' || p == chars[i])
            };
        }
        row = next;
    }
    row[chars.len()]
}
fn matches(pattern: &[&str], path: &[&str]) -> bool {
    let mut row = vec![false; path.len() + 1];
    row[0] = true;
    for part in pattern {
        let mut next = vec![false; path.len() + 1];
        next[0] = *part == "**" && row[0];
        for (i, value) in path.iter().enumerate() {
            next[i + 1] = if *part == "**" {
                row[i + 1] || next[i]
            } else {
                row[i] && segment(part, value)
            };
        }
        row = next;
    }
    row[path.len()]
}
fn glob(
    root: &Path,
    dir: &Path,
    pattern: &[&str],
    found: &mut Vec<String>,
    cancel: &Cancellation,
) -> Result<(), String> {
    for entry in entries(dir)? {
        check(cancel)?;
        let name = entry
            .strip_prefix(root)
            .unwrap()
            .to_str()
            .ok_or("file path is not UTF-8")?
            .to_string();
        if matches(pattern, &name.split('/').collect::<Vec<_>>()) {
            found.push(name);
        }
        if found.len() > 10000 {
            return Err("glob exceeds 10000 results".into());
        }
        if fs::symlink_metadata(&entry)
            .map_err(|e| e.to_string())?
            .is_dir()
        {
            glob(root, &entry, pattern, found, cancel)?;
        }
    }
    Ok(())
}
fn perform(op: &Operation, root: &Path, cancel: &Cancellation) -> Result<Value, String> {
    check(cancel)?;
    Ok(match op {
        Operation::ReadText {
            path: p,
            limit_bytes,
        } => json!(
            String::from_utf8(read(&path(root, p, false)?, *limit_bytes, cancel)?)
                .map_err(|e| e.to_string())?
        ),
        Operation::ReadBytes {
            path: p,
            limit_bytes,
        } => json!(read(&path(root, p, false)?, *limit_bytes, cancel)?),
        Operation::WriteText {
            path: p,
            text,
            overwrite,
        } => {
            write(&path(root, p, false)?, text.as_bytes(), *overwrite, cancel)?;
            Value::Null
        }
        Operation::WriteBytes {
            path: p,
            bytes,
            overwrite,
        } => {
            write(&path(root, p, false)?, bytes, *overwrite, cancel)?;
            Value::Null
        }
        Operation::CopyFile {
            source,
            destination,
            overwrite,
        } => {
            copy(
                &path(root, source, false)?,
                &path(root, destination, false)?,
                *overwrite,
                cancel,
            )?;
            Value::Null
        }
        Operation::CopyTree {
            source,
            destination,
            overwrite,
        } => {
            let source = path(root, source, false)?;
            let dest = path(root, destination, false)?;
            if fs::symlink_metadata(&dest).is_ok() {
                if !overwrite {
                    return Err(format!("destination exists: {}", dest.display()));
                }
                copy_tree(&source, &dest, true, cancel)?;
                return Ok(Value::Null);
            }
            let stage = tempfile::tempdir_in(dest.parent().unwrap()).map_err(|e| e.to_string())?;
            let tree = stage.path().join("tree");
            copy_tree(&source, &tree, false, cancel)?;
            check(cancel)?;
            if fs::symlink_metadata(&dest).is_ok() {
                return Err("copy_tree destination appeared during copy".into());
            }
            fs::rename(tree, dest).map_err(|e| e.to_string())?;
            Value::Null
        }
        Operation::Move {
            source,
            destination,
            overwrite,
        } => {
            let source = path(root, source, true)?;
            let dest = path(root, destination, true)?;
            check(cancel)?;
            if !overwrite && fs::symlink_metadata(&dest).is_ok() {
                return Err(format!("destination exists: {}", dest.display()));
            }
            fs::rename(source, dest).map_err(|e| e.to_string())?;
            Value::Null
        }
        Operation::Mkdir { path: p, parents } => {
            let dest = path(root, p, false)?;
            if *parents {
                fs::create_dir_all(dest)
            } else {
                fs::create_dir(dest)
            }
            .map_err(|e| e.to_string())?;
            Value::Null
        }
        Operation::Remove {
            path: p,
            recursive,
            missing_ok,
        } => {
            let dest = path(root, p, true)?;
            match fs::symlink_metadata(&dest) {
                Err(e) if *missing_ok && e.kind() == std::io::ErrorKind::NotFound => (),
                Err(e) => return Err(e.to_string()),
                Ok(_) => remove(&dest, *recursive, cancel)?,
            };
            Value::Null
        }
        Operation::Stat { path: p } => {
            let metadata = fs::symlink_metadata(path(root, p, true)?).map_err(|e| e.to_string())?;
            let kind = if metadata.is_file() {
                "file"
            } else if metadata.is_dir() {
                "directory"
            } else if metadata.file_type().is_symlink() {
                "symlink"
            } else {
                "special"
            };
            #[cfg(unix)]
            let mode = {
                use std::os::unix::fs::PermissionsExt;
                metadata.permissions().mode() & 0o777
            };
            #[cfg(not(unix))]
            let mode = 0;
            json!({"kind":kind,"size":metadata.len(),"mode":mode})
        }
        Operation::Exists { path: p } => match fs::symlink_metadata(path(root, p, true)?) {
            Ok(_) => json!(true),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!(false),
            Err(e) => return Err(e.to_string()),
        },
        Operation::List { path: p } => {
            let mut names = Vec::new();
            for entry in entries(&path(root, p, false)?)? {
                check(cancel)?;
                names.push(
                    entry
                        .file_name()
                        .unwrap()
                        .to_str()
                        .ok_or("file path is not UTF-8")?
                        .to_string(),
                );
                if names.len() > 10000 {
                    return Err("list exceeds 10000 results".into());
                }
            }
            json!(names)
        }
        Operation::Glob { pattern } => {
            let mut found = Vec::new();
            let parts: Vec<_> = pattern.split('/').filter(|p| *p != ".").collect();
            glob(root, root, &parts, &mut found, cancel)?;
            found.sort();
            json!(found)
        }
        Operation::Hash { path: p } => {
            let mut input = regular(&path(root, p, false)?)?;
            let mut hash = Sha256::new();
            let mut buffer = [0u8; 65536];
            loop {
                check(cancel)?;
                let n = input.read(&mut buffer).map_err(|e| e.to_string())?;
                if n == 0 {
                    break;
                }
                hash.update(&buffer[..n]);
            }
            json!(hex::encode(hash.finalize()))
        }
        Operation::Chmod { path: p, mode } => {
            let dest = path(root, p, false)?;
            let meta = fs::symlink_metadata(&dest).map_err(|e| e.to_string())?;
            if !meta.is_file() && !meta.is_dir() {
                return Err("chmod requires a regular file or directory".into());
            }
            cache::set_mode(&dest, *mode)?;
            Value::Null
        }
        Operation::Symlink { target, path: p } => {
            let target = path(root, target, false)?;
            let dest = path(root, p, false)?;
            let parent = dest.parent().unwrap();
            let a: Vec<_> = parent.components().collect();
            let b: Vec<_> = target.components().collect();
            let common = a.iter().zip(&b).take_while(|(a, b)| a == b).count();
            let mut relative = PathBuf::new();
            for _ in common..a.len() {
                relative.push("..");
            }
            for part in &b[common..] {
                relative.push(part.as_os_str());
            }
            #[cfg(unix)]
            std::os::unix::fs::symlink(relative, dest).map_err(|e| e.to_string())?;
            #[cfg(not(unix))]
            return Err("symlink currently requires Unix".into());
            Value::Null
        }
    })
}
pub(crate) fn execute(
    task: &Task,
    mut stdout: File,
    mut stderr: File,
    cancel: &Cancellation,
) -> Result<(), String> {
    let op = task
        .file_operation
        .as_ref()
        .ok_or("missing file operation")?;
    let result = perform(op, &task.cwd, cancel).map_err(|e| {
        let mut context = serde_json::to_value(op).unwrap_or_default();
        if let Some(object) = context.as_object_mut() {
            object.remove("text");
            object.remove("bytes");
        }
        let message = format!("file operation {context}: {e}");
        let _ = writeln!(stderr, "{message}");
        message
    })?;
    let bytes = serde_json::to_vec(&result).map_err(|e| e.to_string())?;
    if bytes.len() >= 8 * 1024 * 1024 {
        return Err("file query result exceeds 8 MiB".into());
    }
    stdout
        .write_all(&bytes)
        .and_then(|_| stdout.write_all(b"\n"))
        .map_err(|e| e.to_string())
}
pub(crate) fn result(stdout: &Path) -> Result<Value, String> {
    serde_json::from_slice(&read(stdout, 8 * 1024 * 1024, &Cancellation::default())?)
        .map_err(|e| e.to_string())
}

pub(crate) fn validate_env(task: &Task) -> Result<(), String> {
    for file in &task.env_files {
        relative(file, false)?;
    }
    Ok(())
}
/// Literal dotenv grammar: no interpolation, command substitution or shell evaluation.
pub fn parse_env(text: &str) -> Result<std::collections::BTreeMap<String, String>, String> {
    let mut values = std::collections::BTreeMap::new();
    for (index, line) in text.lines().enumerate() {
        let parse = || -> Option<(String, String)> {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return Some((String::new(), String::new()));
            }
            let line = line.strip_prefix("export ").unwrap_or(line).trim_start();
            let (key, value) = line.split_once('=')?;
            let key = key.trim();
            if key.is_empty()
                || !key.bytes().enumerate().all(|(i, c)| {
                    c == b'_' || c.is_ascii_alphabetic() || i > 0 && c.is_ascii_digit()
                })
            {
                return None;
            }
            let value = value.trim();
            let value = if value.starts_with(['\'', '"']) {
                let quote = value.chars().next()?;
                let mut chars = value[1..].char_indices();
                let mut output = String::new();
                let mut end = None;
                while let Some((i, c)) = chars.next() {
                    if c == quote {
                        end = Some(i + 1 + c.len_utf8());
                        break;
                    }
                    if c == '\\' && quote == '"' {
                        output.push(match chars.next()?.1 {
                            'n' => '\n',
                            'r' => '\r',
                            't' => '\t',
                            '"' => '"',
                            '\\' => '\\',
                            _ => return None,
                        });
                    } else {
                        output.push(c);
                    }
                }
                let tail = value[end?..].trim();
                if !tail.is_empty() && !tail.starts_with('#') {
                    return None;
                }
                output
            } else {
                let end = value
                    .char_indices()
                    .find(|(i, c)| {
                        *c == '#' && (*i == 0 || value[..*i].ends_with(char::is_whitespace))
                    })
                    .map(|(i, _)| i)
                    .unwrap_or(value.len());
                value[..end].trim_end().to_string()
            };
            if value.contains('\0') {
                return None;
            }
            Some((key.into(), value))
        };
        let (key, value) =
            parse().ok_or_else(|| format!("invalid env entry at line {}", index + 1))?;
        if !key.is_empty() {
            values.insert(key, value);
        }
    }
    Ok(values)
}
pub(crate) fn resolve_env(task: &Task) -> Result<Task, String> {
    let mut resolved = task.clone();
    let mut values = std::collections::BTreeMap::new();
    for file in &task.env_files {
        let source = path(&task.cwd, file, false)?;
        let text = String::from_utf8(read(&source, 1024 * 1024, &Cancellation::default())?)
            .map_err(|_| format!("env file {} is not UTF-8", file.display()))?;
        values.extend(parse_env(&text).map_err(|e| format!("env file {}: {e}", file.display()))?);
    }
    values.extend(task.env.clone());
    resolved.env = values;
    Ok(resolved)
}
