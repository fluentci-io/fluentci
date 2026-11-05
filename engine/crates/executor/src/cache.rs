//! Opt-in local action cache. Cacheability is a contract: all consumed inputs and
//! produced outputs must be declared. This is not a filesystem/network sandbox.
use crate::{Cancellation, Task};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs::{self, File},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CachePolicy {
    pub inputs: Vec<PathBuf>,
    pub outputs: Vec<PathBuf>,
    /// Caller-provided identity for the complete toolchain/runtime, not just the launcher.
    pub toolchain: String,
    /// Absolute regular files whose bytes and permissions identify external tools.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub toolchain_files: Vec<PathBuf>,
    /// Caller guarantees outputs and logs do not depend on the physical cwd.
    #[serde(default, skip_serializing_if = "is_false")]
    pub relocatable: bool,
}

fn is_false(value: &bool) -> bool {
    !value
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct CacheResult {
    pub outcome: String,
    pub key: Option<String>,
    pub reason: String,
    /// Component digests explain key changes without exposing environment values.
    pub components: BTreeMap<String, String>,
}
impl CacheResult {
    pub fn disabled() -> Self {
        Self {
            outcome: "disabled".into(),
            reason: "task has no cache policy".into(),
            ..Self::default()
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub(crate) struct Entry {
    pub path: PathBuf,
    pub directory: bool,
    pub mode: u32,
    pub(crate) digest: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Manifest {
    version: u32,
    key: String,
    outputs: Vec<Entry>,
    stdout: String,
    stderr: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct ActionRecord {
    checksum: String,
    manifest: Manifest,
}

pub struct Prepared {
    pub key: String,
    pub(crate) executable: PathBuf,
    pub components: BTreeMap<String, String>,
    root: PathBuf,
    cancel: Cancellation,
    // Explicitly released on drop; the OS also releases it on the last close.
    _lock: crate::resources::Lock,
}

fn digest(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}
fn check_cancel(cancel: &Cancellation) -> Result<(), String> {
    if cancel.is_cancelled() {
        Err("cache operation cancelled".into())
    } else {
        Ok(())
    }
}

fn copy_stream(
    source: &mut impl Read,
    destination: &mut impl Write,
    cancel: &Cancellation,
) -> Result<(), String> {
    let mut buffer = [0u8; 65536];
    loop {
        check_cancel(cancel)?;
        let count = source.read(&mut buffer).map_err(|e| e.to_string())?;
        if count == 0 {
            return Ok(());
        }
        destination
            .write_all(&buffer[..count])
            .map_err(|e| e.to_string())?;
    }
}

pub(crate) fn copy_file(
    source: &Path,
    destination: &Path,
    cancel: &Cancellation,
) -> Result<(), String> {
    check_cancel(cancel)?;
    let mut input = open_storage_file(source).map_err(|e| e.to_string())?;
    let mut output = File::create(destination).map_err(|e| e.to_string())?;
    copy_stream(&mut input, &mut output, cancel)?;
    fs::set_permissions(
        destination,
        input.metadata().map_err(|e| e.to_string())?.permissions(),
    )
    .map_err(|e| e.to_string())
}

fn file_digest(path: &Path, cancel: &Cancellation) -> Result<String, String> {
    check_cancel(cancel)?;
    let mut file =
        open_regular_file(path, true).map_err(|e| format!("read {}: {e}", path.display()))?;
    stream_digest(&mut file, cancel)
}

fn stream_digest(file: &mut impl Read, cancel: &Cancellation) -> Result<String, String> {
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        check_cancel(cancel)?;
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}
// Storage leaves must be ordinary files. Open nonblocking before inspecting the
// descriptor so a substituted FIFO cannot trap a cache worker before cancellation.
// This protects the final component; the cache root/ancestors remain trusted.
pub(crate) fn open_storage_file(path: &Path) -> std::io::Result<File> {
    open_regular_file(path, false)
}

// Executables may be package-manager symlinks, but their opened targets must
// still be regular files. Checking the descriptor closes the stat/open gap and
// O_NONBLOCK prevents a FIFO target from trapping the worker in open().
fn open_regular_file(path: &Path, follow_links: bool) -> std::io::Result<File> {
    #[cfg(not(unix))]
    let _ = follow_links;
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK | if follow_links { 0 } else { libc::O_NOFOLLOW });
    }
    let file = options.open(path)?;
    if !file.metadata()?.is_file() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "cache source is not a regular file",
        ));
    }
    Ok(file)
}

fn copy_blob(source: &Path, destination: &Path, cancel: &Cancellation) -> Result<(), String> {
    check_cancel(cancel)?;
    let mut input = open_storage_file(source).map_err(|e| e.to_string())?;
    let mut output = File::create(destination).map_err(|e| e.to_string())?;
    copy_stream(&mut input, &mut output, cancel)?;
    fs::set_permissions(
        destination,
        input.metadata().map_err(|e| e.to_string())?.permissions(),
    )
    .map_err(|e| e.to_string())
}

fn encoded_digest<T: Serialize>(value: &T) -> Result<String, String> {
    Ok(digest(
        &serde_json::to_vec(value).map_err(|e| e.to_string())?,
    ))
}
fn valid_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
}
pub(crate) fn safe_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty() && path.components().all(|p| matches!(p, Component::Normal(_)))
}

/// Compare canonical existing ancestors, including cache/run paths not created yet.
pub(crate) fn resolved_location(path: &Path) -> Result<PathBuf, String> {
    let mut ancestor = path;
    let mut tail = Vec::new();
    while !ancestor.exists() {
        tail.push(
            ancestor
                .file_name()
                .ok_or("invalid storage path")?
                .to_owned(),
        );
        ancestor = ancestor.parent().ok_or("invalid storage path")?;
    }
    let mut resolved = fs::canonicalize(ancestor).map_err(|e| e.to_string())?;
    for part in tail.into_iter().rev() {
        resolved.push(part);
    }
    Ok(resolved)
}

pub fn validate_storage(task: &Task, storage: &Path) -> Result<(), String> {
    let storage = resolved_location(storage)?;
    let cwd = fs::canonicalize(&task.cwd).map_err(|e| e.to_string())?;
    let policy = task.cache.as_ref().ok_or("missing cache policy")?;
    for relative in policy.inputs.iter().chain(&policy.outputs) {
        let path = cwd.join(relative);
        if storage.starts_with(&path) || path.starts_with(&storage) {
            return Err(format!(
                "cache/run storage overlaps a declared path: {}",
                relative.display()
            ));
        }
    }
    for declared in &policy.toolchain_files {
        let path = resolved_location(declared)?;
        if storage.starts_with(&path) || path.starts_with(&storage) {
            return Err("cache/run storage overlaps a toolchain file".into());
        }
    }
    Ok(())
}

/// Declared writers must be ordered with every overlapping reader or writer.
/// Resource exclusion alone does not specify which version a reader consumes.
pub(crate) fn validate_workspace(
    tasks: &[Task],
    graph: &crate::graph::DependencyGraph,
) -> Result<(), String> {
    let mut paths: BTreeMap<PathBuf, Vec<(usize, bool)>> = BTreeMap::new();
    for (index, task) in tasks.iter().enumerate() {
        if let Some(policy) = &task.cache {
            let cwd = fs::canonicalize(&task.cwd).map_err(|e| e.to_string())?;
            for declared in &policy.toolchain_files {
                let path = resolved_location(declared)?;
                for output in &policy.outputs {
                    let output = resolved_location(&cwd.join(output))?;
                    if path.starts_with(&output) || output.starts_with(&path) {
                        return Err("toolchain files overlap task outputs".into());
                    }
                }
                paths.entry(path).or_default().push((index, false));
            }
            for (declared, write) in [(&policy.inputs, false), (&policy.outputs, true)] {
                for relative in declared {
                    // Do not follow artifact symlinks into a different workspace.
                    let path = checked_path(&cwd, relative)?;
                    paths.entry(path).or_default().push((index, write));
                }
            }
        }
    }
    // One task's ancestors/descendants suffice for all its overlapping paths.
    // Keep linear scratch space instead of a set of every ordered task pair.
    let mut related = vec![false; tasks.len()];
    let mut related_task = None;
    let mut pending = Vec::new();
    for (path, accesses) in &paths {
        for ancestor in path.ancestors() {
            let Some(others) = paths.get(ancestor) else {
                continue;
            };
            // Avoid a quadratic reader/reader comparison for shared source trees.
            let writers: Vec<_> = others.iter().copied().filter(|(_, write)| *write).collect();
            for &(a, write_a) in accesses {
                let candidates = if write_a {
                    others.as_slice()
                } else {
                    writers.as_slice()
                };
                for &(b, _) in candidates {
                    if a == b {
                        continue;
                    }
                    if related_task != Some(a) {
                        related.fill(false);
                        related[a] = true;
                        // Traverse each direction separately. Walking both kinds
                        // of edges at each node would wrongly order siblings.
                        for edges in [&graph.dependencies, &graph.successors] {
                            pending.extend(edges[a].iter().copied());
                            while let Some(node) = pending.pop() {
                                if !related[node] {
                                    related[node] = true;
                                    pending.extend(edges[node].iter().copied());
                                }
                            }
                        }
                        related_task = Some(a);
                    }
                    if !related[b] {
                        return Err(format!(
                            "unordered cache paths overlap between tasks {} and {} at {}; add a dependency or use separate output paths",
                            tasks[a].id, tasks[b].id, path.display()
                        ));
                    }
                }
            }
        }
    }
    Ok(())
}

impl CachePolicy {
    pub fn validate(&self) -> Result<(), String> {
        if self.toolchain.is_empty() {
            return Err("cache policy requires a toolchain identity".into());
        }
        for path in &self.toolchain_files {
            if !path.is_absolute()
                || path.file_name().is_none()
                || path
                    .components()
                    .any(|part| matches!(part, Component::ParentDir))
            {
                return Err("toolchain files must be absolute file paths without '..'".into());
            }
        }
        for path in self.inputs.iter().chain(&self.outputs) {
            if !safe_relative(path) {
                return Err(format!(
                    "cache paths must be relative without '.' or '..': {}",
                    path.display()
                ));
            }
        }
        for (i, output) in self.outputs.iter().enumerate() {
            for other in self.inputs.iter().chain(self.outputs.iter().take(i)) {
                if output.starts_with(other) || other.starts_with(output) {
                    return Err(format!(
                        "overlapping cache paths: {} and {}",
                        output.display(),
                        other.display()
                    ));
                }
            }
        }
        Ok(())
    }
}

/// Reject symlink traversal and special files. Symlink artifacts will require an
/// explicit, contained-link representation rather than following host links.
pub(crate) fn checked_path(base: &Path, relative: &Path) -> Result<PathBuf, String> {
    if !safe_relative(relative) {
        return Err("unsafe artifact path".into());
    }
    let mut path = base.to_path_buf();
    for part in relative.components() {
        path.push(part);
        match fs::symlink_metadata(&path) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err(format!("symlinks are not cacheable: {}", path.display()))
            }
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(path)
}
fn mode(meta: &fs::Metadata) -> u32 {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        meta.permissions().mode() & 0o777
    }
    #[cfg(not(unix))]
    {
        if meta.permissions().readonly() {
            0o444
        } else {
            0o644
        }
    }
}
pub(crate) fn set_mode(path: &Path, value: u32) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(value & 0o777))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(unix))]
    {
        let mut perms = fs::metadata(path).map_err(|e| e.to_string())?.permissions();
        perms.set_readonly(value & 0o200 == 0);
        fs::set_permissions(path, perms).map_err(|e| e.to_string())?;
    }
    Ok(())
}
pub(crate) fn snapshot(
    base: &Path,
    paths: &[PathBuf],
    cancel: &Cancellation,
) -> Result<Vec<Entry>, String> {
    snapshot_with_jobs(base, paths, cancel, 1)
}

pub(crate) fn snapshot_with_jobs(
    base: &Path,
    paths: &[PathBuf],
    cancel: &Cancellation,
    jobs: usize,
) -> Result<Vec<Entry>, String> {
    fn visit(
        base: &Path,
        relative: &Path,
        entries: &mut BTreeMap<PathBuf, Entry>,
        cancel: &Cancellation,
        bytes: &mut u64,
    ) -> Result<(), String> {
        check_cancel(cancel)?;
        // Input declarations can overlap (e.g. a source tree and a selected
        // generated file). Inventory each path once, then hash its contents.
        // Revisiting it only repeats I/O. Do not retain this map
        // between snapshots: preparation/publication must re-read live inputs.
        if entries.contains_key(relative) {
            return Ok(());
        }
        let path = checked_path(base, relative)?;
        let meta = fs::symlink_metadata(&path)
            .map_err(|e| format!("declared path {}: {e}", path.display()))?;
        if !meta.is_dir() && !meta.is_file() {
            return Err(format!("unsupported artifact: {}", path.display()));
        }
        if meta.is_file() {
            *bytes = bytes.saturating_add(meta.len());
        }
        entries.insert(
            relative.into(),
            Entry {
                path: relative.into(),
                directory: meta.is_dir(),
                mode: mode(&meta),
                digest: None,
            },
        );
        if meta.is_dir() {
            for item in fs::read_dir(&path).map_err(|e| e.to_string())? {
                let item = item.map_err(|e| e.to_string())?;
                visit(
                    base,
                    &relative.join(item.file_name()),
                    entries,
                    cancel,
                    bytes,
                )?;
            }
        }
        Ok(())
    }
    let mut entries = BTreeMap::new();
    let mut bytes = 0;
    for path in paths {
        visit(base, path, &mut entries, cancel, &mut bytes)?;
    }
    let mut entries: Vec<_> = entries.into_values().collect();
    // Thread startup costs more than it saves for tiny source trees.
    let jobs = if bytes < 1024 * 1024 { 1 } else { jobs };
    hash_entries(base, &mut entries, cancel, jobs, &|path, cancel| {
        check_cancel(cancel)?;
        let mut file = open_storage_file(path).map_err(|e| e.to_string())?;
        stream_digest(&mut file, cancel)
    })?;
    Ok(entries)
}

// Inventory order determines the snapshot, never worker completion order. Cache
// workers use jobs=1; only workspace setup opts into parallel hashing, avoiding
// a nested pool for every concurrently running cached task.
fn hash_entries(
    base: &Path,
    entries: &mut [Entry],
    cancel: &Cancellation,
    jobs: usize,
    hash: &(impl Fn(&Path, &Cancellation) -> Result<String, String> + Sync),
) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    if jobs <= 1
        || entries
            .iter()
            .filter(|entry| !entry.directory)
            .take(2)
            .count()
            < 2
    {
        for entry in entries.iter_mut().filter(|entry| !entry.directory) {
            check_cancel(cancel)?;
            entry.digest = Some(hash(&base.join(&entry.path), cancel)?);
        }
        return check_cancel(cancel);
    }
    let files: Vec<_> = entries
        .iter()
        .enumerate()
        .filter(|(_, entry)| !entry.directory)
        .collect();
    let workers = jobs.min(64).min(files.len());
    let next = AtomicUsize::new(0);
    let failed = AtomicBool::new(false);
    let digests = std::thread::scope(|scope| {
        let mut handles = Vec::with_capacity(workers);
        let mut failure = None;
        for _ in 0..workers {
            let work = || {
                let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let mut digests = Vec::new();
                    while !failed.load(Ordering::Relaxed) {
                        check_cancel(cancel)?;
                        let position = next.fetch_add(1, Ordering::Relaxed);
                        let Some(&(index, entry)) = files.get(position) else {
                            break;
                        };
                        digests.push((index, hash(&base.join(&entry.path), cancel)?));
                    }
                    Ok::<_, String>(digests)
                }))
                .unwrap_or_else(|_| Err("snapshot worker panicked".into()));
                if result.is_err() {
                    failed.store(true, Ordering::Relaxed);
                }
                result
            };
            match std::thread::Builder::new()
                .name("fluentci-snapshot".into())
                .spawn_scoped(scope, work)
            {
                Ok(handle) => handles.push(handle),
                Err(error) => {
                    failed.store(true, Ordering::Relaxed);
                    failure = Some(error.to_string());
                    break;
                }
            }
        }
        let mut all = Vec::new();
        // Always join every started worker, including spawn/error/panic paths.
        for handle in handles {
            match handle
                .join()
                .unwrap_or_else(|_| Err("snapshot worker panicked".into()))
            {
                Ok(digests) => all.extend(digests),
                Err(error) => {
                    failed.store(true, Ordering::Relaxed);
                    failure.get_or_insert(error);
                }
            }
        }
        if let Some(error) = failure {
            Err(error)
        } else {
            Ok(all)
        }
    })?;
    check_cancel(cancel)?;
    for (index, digest) in digests {
        entries[index].digest = Some(digest);
    }
    Ok(())
}

fn toolchain_files_digest(paths: &[PathBuf], cancel: &Cancellation) -> Result<String, String> {
    let mut identities = BTreeMap::new();
    for path in paths.iter().collect::<std::collections::BTreeSet<_>>() {
        check_cancel(cancel)?;
        let mut file = open_regular_file(path, true)
            .map_err(|e| format!("toolchain file {}: {e}", path.display()))?;
        let permissions = mode(&file.metadata().map_err(|e| e.to_string())?);
        identities.insert(path, (stream_digest(&mut file, cancel)?, permissions));
    }
    encoded_digest(&identities)
}

/// Returns None when another process owns the same action. The scheduler can
/// retry without blocking unrelated tasks or losing cancellation responsiveness.
pub fn prepare(
    root: &Path,
    task: &Task,
    dependency_keys: &[String],
) -> Result<Option<Prepared>, String> {
    prepare_cancellable(root, task, dependency_keys, &Cancellation::default())
}

pub(crate) fn prepare_cancellable(
    root: &Path,
    task: &Task,
    dependency_keys: &[String],
    cancel: &Cancellation,
) -> Result<Option<Prepared>, String> {
    #[cfg(all(test, unix))]
    crate::cache_worker_tests::pause(&task.cwd, "prepare", cancel)?;
    check_cancel(cancel)?;
    let policy = task.cache.as_ref().ok_or("missing cache policy")?;
    policy.validate()?;
    let executable = if task.file_operation.is_some() {
        PathBuf::new()
    } else if Path::new(&task.program).is_absolute() {
        PathBuf::from(&task.program)
    } else if Path::new(&task.program).components().count() > 1 {
        task.cwd.join(&task.program)
    } else {
        task.env
            .get("PATH")
            .and_then(|path| {
                std::env::split_paths(path)
                    .map(|p| {
                        if p.is_absolute() {
                            p.join(&task.program)
                        } else {
                            task.cwd.join(p).join(&task.program)
                        }
                    })
                    .find(|p| {
                        fs::metadata(p).is_ok_and(|meta| meta.is_file() && mode(&meta) & 0o111 != 0)
                    })
            })
            .ok_or("cached tasks require an absolute program or explicit PATH")?
    };
    let mut components = BTreeMap::new();
    components.insert(
        "command".into(),
        encoded_digest(&(&task.program, &task.args))?,
    );
    if let Some(operation) = &task.file_operation {
        components.insert(
            "file_operation".into(),
            encoded_digest(&("fluentci-files-v1", operation))?,
        );
    } else {
        components.insert("executable".into(), file_digest(&executable, cancel)?);
        components.insert(
            "executable_mode".into(),
            encoded_digest(&mode(
                &fs::metadata(&executable).map_err(|e| e.to_string())?,
            ))?,
        );
    }
    components.insert(
        "inputs".into(),
        encoded_digest(&snapshot(&task.cwd, &policy.inputs, cancel)?)?,
    );
    components.insert("environment".into(), encoded_digest(&task.env)?);
    components.insert("toolchain".into(), digest(policy.toolchain.as_bytes()));
    if !policy.toolchain_files.is_empty() {
        components.insert(
            "toolchain_files".into(),
            toolchain_files_digest(&policy.toolchain_files, cancel)?,
        );
    }
    components.insert("outputs".into(), encoded_digest(&policy.outputs)?);
    components.insert(
        "working_directory".into(),
        if policy.relocatable {
            digest(b"fluentci-relocatable-working-directory-v1")
        } else {
            encoded_digest(&fs::canonicalize(&task.cwd).map_err(|e| e.to_string())?)?
        },
    );
    components.insert("dependencies".into(), encoded_digest(&dependency_keys)?);
    components.insert(
        "platform".into(),
        encoded_digest(&(std::env::consts::OS, std::env::consts::ARCH))?,
    );
    components.insert("cache_format".into(), digest(b"fluentci-action-v1"));
    let key = encoded_digest(&components)?;
    for dir in ["actions", "blobs", "locks"] {
        fs::create_dir_all(root.join(dir)).map_err(|e| e.to_string())?;
    }
    let lock = crate::resources::open_lock_file(&root.join("locks").join(&key))?;
    #[cfg(unix)]
    {
        use std::os::fd::AsRawFd;
        if unsafe { libc::flock(lock.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } != 0 {
            let error = std::io::Error::last_os_error();
            if error.kind() == std::io::ErrorKind::WouldBlock {
                return Ok(None);
            }
            return Err(error.to_string());
        }
    }
    #[cfg(not(unix))]
    {
        return Err("action caching currently requires Unix advisory locks".into());
    }
    Ok(Some(Prepared {
        key,
        executable,
        components,
        root: root.into(),
        cancel: cancel.clone(),
        _lock: crate::resources::Lock::new(lock),
    }))
}

pub(crate) struct Lookup {
    pub action: Prepared,
    pub hit: bool,
    pub reason: String,
}

/// Run entirely on an owned worker while the scheduler retains resource leases.
pub(crate) fn lookup(
    root: &Path,
    task: &Task,
    dependencies: &[String],
    stdout: &Path,
    stderr: &Path,
    cancel: &Cancellation,
) -> Result<Option<Lookup>, String> {
    let Some(action) = prepare_cancellable(root, task, dependencies, cancel)? else {
        return Ok(None);
    };
    let (hit, reason) = match action.restore(task, stdout, stderr) {
        Ok(true) => (true, "verified cached outputs restored".into()),
        Ok(false) => (false, "no matching action".into()),
        Err(error) => {
            check_cancel(cancel)?;
            (false, format!("cache rejected: {error}"))
        }
    };
    check_cancel(cancel)?;
    if !hit {
        // Journal tailing is suspended for this task until lookup completes.
        let _ = fs::remove_file(stdout);
        let _ = fs::remove_file(stderr);
        action.clean_outputs(task)?;
    }
    Ok(Some(Lookup {
        action,
        hit,
        reason,
    }))
}

impl Prepared {
    pub(crate) fn with_cancellation(mut self, cancel: Cancellation) -> Self {
        self.cancel = cancel;
        self
    }

    fn blob(&self, hash: &str) -> Result<PathBuf, String> {
        if !valid_digest(hash) {
            return Err("invalid blob digest".into());
        }
        Ok(self.root.join("blobs").join(hash))
    }
    fn store_blob(&self, source: &Path, expected: &str) -> Result<(), String> {
        let destination = self.blob(expected)?;
        match open_storage_file(&destination) {
            Ok(mut file) => {
                if stream_digest(&mut file, &self.cancel)? == expected {
                    return Ok(());
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
        let mut staging =
            tempfile::NamedTempFile::new_in(self.root.join("blobs")).map_err(|e| e.to_string())?;
        let mut file = open_storage_file(source).map_err(|e| e.to_string())?;
        copy_stream(&mut file, &mut staging, &self.cancel)?;
        if file_digest(staging.path(), &self.cancel)? != expected {
            return Err(format!("file changed while caching: {}", source.display()));
        }
        staging.as_file().sync_all().map_err(|e| e.to_string())?;
        staging.persist(&destination).map_err(|e| e.to_string())?;
        Ok(())
    }
    /// Cacheable tasks start with clean declared outputs, so stale files cannot
    /// accidentally enter an action result. Inputs and outputs cannot overlap.
    pub fn clean_outputs(&self, task: &Task) -> Result<(), String> {
        check_cancel(&self.cancel)?;
        for root in &task.cache.as_ref().ok_or("missing cache policy")?.outputs {
            let output = checked_path(&task.cwd, root)?;
            if output.is_dir() {
                fs::remove_dir_all(&output).map_err(|e| e.to_string())?;
            } else if output.exists() {
                fs::remove_file(&output).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    }

    pub fn save(&self, task: &Task, stdout: &Path, stderr: &Path) -> Result<(), String> {
        #[cfg(all(test, unix))]
        crate::cache_worker_tests::pause_save(&task.cwd, &self.cancel)?;
        let policy = task.cache.as_ref().ok_or("missing cache policy")?;
        if task.file_operation.is_none()
            && (file_digest(&self.executable, &self.cancel)? != self.components["executable"]
                || encoded_digest(&mode(
                    &fs::metadata(&self.executable).map_err(|e| e.to_string())?,
                ))? != self.components["executable_mode"])
        {
            return Err("executable changed during execution; action was not cached".into());
        }
        // Never publish under the old key if declared inputs changed during execution.
        if encoded_digest(&snapshot(&task.cwd, &policy.inputs, &self.cancel)?)?
            != self.components["inputs"]
        {
            return Err("declared inputs changed during execution; action was not cached".into());
        }
        if !policy.toolchain_files.is_empty()
            && toolchain_files_digest(&policy.toolchain_files, &self.cancel)?
                != self.components["toolchain_files"]
        {
            return Err("toolchain files changed during execution; action was not cached".into());
        }
        let entries = snapshot(&task.cwd, &policy.outputs, &self.cancel)?;
        // CAS blobs are immutable by digest. Verify/publish each unique blob
        // once in this save, including logs that duplicate an output. Keep this
        // set local: a later save must detect and repair newly corrupted blobs.
        let mut stored = std::collections::HashSet::new();
        for entry in &entries {
            if let Some(hash) = &entry.digest {
                if stored.insert(hash.clone()) {
                    self.store_blob(&checked_path(&task.cwd, &entry.path)?, hash)?;
                }
            }
        }
        let stdout_digest = file_digest(stdout, &self.cancel)?;
        let stderr_digest = file_digest(stderr, &self.cancel)?;
        for (source, hash) in [(stdout, &stdout_digest), (stderr, &stderr_digest)] {
            if stored.insert(hash.clone()) {
                self.store_blob(source, hash)?;
            }
        }
        let manifest = Manifest {
            version: 1,
            key: self.key.clone(),
            outputs: entries,
            stdout: stdout_digest,
            stderr: stderr_digest,
        };
        let mut staging = tempfile::NamedTempFile::new_in(self.root.join("actions"))
            .map_err(|e| e.to_string())?;
        let record = ActionRecord {
            checksum: encoded_digest(&manifest)?,
            manifest,
        };
        serde_json::to_writer(&mut staging, &record).map_err(|e| e.to_string())?;
        staging.flush().map_err(|e| e.to_string())?;
        staging.as_file().sync_all().map_err(|e| e.to_string())?;
        check_cancel(&self.cancel)?;
        staging
            .persist(self.root.join("actions").join(format!("{}.json", self.key)))
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    /// Stage and validate every artifact before changing any workspace output.
    pub fn restore(&self, task: &Task, stdout: &Path, stderr: &Path) -> Result<bool, String> {
        #[cfg(all(test, unix))]
        crate::cache_worker_tests::pause(&task.cwd, "restore", &self.cancel)?;
        check_cancel(&self.cancel)?;
        let path = self.root.join("actions").join(format!("{}.json", self.key));
        let mut file = match open_storage_file(&path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(false),
            Err(e) => return Err(e.to_string()),
        };
        let mut bytes = Vec::new();
        copy_stream(&mut file, &mut bytes, &self.cancel)?;
        let record: ActionRecord =
            serde_json::from_slice(&bytes).map_err(|e| format!("invalid cache manifest: {e}"))?;
        if encoded_digest(&record.manifest)? != record.checksum {
            return Err("cache manifest checksum mismatch".into());
        }
        let manifest = record.manifest;
        if manifest.version != 1 || manifest.key != self.key {
            return Err("cache manifest identity mismatch".into());
        }
        let policy = task.cache.as_ref().ok_or("missing cache policy")?;
        let staging = tempfile::Builder::new()
            .prefix(".fluentci-restore-")
            .tempdir_in(&task.cwd)
            .map_err(|e| e.to_string())?;
        let artifacts = staging.path().join("artifacts");
        fs::create_dir(&artifacts).map_err(|e| e.to_string())?;
        let mut seen = std::collections::HashSet::new();
        for entry in &manifest.outputs {
            if !safe_relative(&entry.path)
                || !policy
                    .outputs
                    .iter()
                    .any(|root| entry.path.starts_with(root))
                || !seen.insert(entry.path.clone())
            {
                return Err("cache manifest contains an invalid output path".into());
            }
            checked_path(&task.cwd, &entry.path)?;
            let destination = artifacts.join(&entry.path);
            if entry.directory {
                if entry.digest.is_some() {
                    return Err("directory has a blob digest".into());
                }
                fs::create_dir_all(&destination).map_err(|e| e.to_string())?;
            } else {
                let hash = entry.digest.as_ref().ok_or("file has no blob digest")?;
                if let Some(parent) = destination.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                copy_blob(&self.blob(hash)?, &destination, &self.cancel)?;
                if file_digest(&destination, &self.cancel)? != *hash {
                    return Err("cache blob failed integrity verification".into());
                }
                set_mode(&destination, entry.mode)?;
            }
        }
        for root in &policy.outputs {
            if !seen.contains(root) {
                return Err("cache manifest is missing an output root".into());
            }
            checked_path(&task.cwd, root)?;
        }
        // Verify logs too, before publishing restored outputs.
        let staged_stdout = staging.path().join(".stdout-log");
        let staged_stderr = staging.path().join(".stderr-log");
        for (hash, target) in [
            (&manifest.stdout, &staged_stdout),
            (&manifest.stderr, &staged_stderr),
        ] {
            copy_blob(&self.blob(hash)?, target, &self.cancel)?;
            if file_digest(target, &self.cancel)? != *hash {
                return Err("cached log failed integrity verification".into());
            }
        }
        for entry in manifest.outputs.iter().rev().filter(|e| e.directory) {
            set_mode(&artifacts.join(&entry.path), entry.mode)?;
        }
        // A log write failure must not occur after workspace publication.
        copy_file(&staged_stdout, stdout, &self.cancel)?;
        copy_file(&staged_stderr, stderr, &self.cancel)?;
        check_cancel(&self.cancel)?;
        publish_outputs(&task.cwd, &artifacts, &policy.outputs)?;
        Ok(true)
    }
}

/// Preserve existing outputs until every replacement succeeds. This rolls back
/// ordinary filesystem errors; it is not a crash-atomic multi-path transaction.
fn publish_outputs(cwd: &Path, artifacts: &Path, outputs: &[PathBuf]) -> Result<(), String> {
    let backups = tempfile::Builder::new()
        .prefix(".fluentci-backup-")
        .tempdir_in(cwd)
        .map_err(|e| e.to_string())?;
    let mut replaced = Vec::new();
    let publication = (|| {
        for (index, root) in outputs.iter().enumerate() {
            let destination = checked_path(cwd, root)?;
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let backup = backups.path().join(index.to_string());
            let existed = destination.try_exists().map_err(|e| e.to_string())?;
            if existed {
                fs::rename(&destination, &backup).map_err(|e| e.to_string())?;
            }
            // Record the backup before attempting the replacement, so even a
            // failure on this rename restores the original output.
            replaced.push((destination.clone(), backup, existed, false));
            fs::rename(artifacts.join(root), &destination).map_err(|e| e.to_string())?;
            replaced.last_mut().unwrap().3 = true;
        }
        Ok::<_, String>(())
    })();
    if let Err(error) = publication {
        let mut failures = Vec::new();
        for (destination, backup, existed, installed) in replaced.into_iter().rev() {
            let rollback = (|| {
                if installed {
                    // Move back instead of recursively deleting: read-only
                    // output trees can still be rolled back by their parent.
                    let relative = destination.strip_prefix(cwd).map_err(|e| e.to_string())?;
                    fs::rename(&destination, artifacts.join(relative))
                        .map_err(|e| e.to_string())?;
                }
                if existed {
                    fs::rename(&backup, &destination).map_err(|e| e.to_string())?;
                }
                Ok::<_, String>(())
            })();
            if let Err(reason) = rollback {
                failures.push(format!("{}: {reason}", destination.display()));
            }
        }
        if !failures.is_empty() {
            let retained = backups.keep();
            return Err(format!(
                "cache publication failed: {error}; rollback failed: {}; backups retained at {}",
                failures.join("; "),
                retained.display()
            ));
        }
        return Err(format!(
            "cache publication failed (outputs rolled back): {error}"
        ));
    }
    Ok(())
}

#[cfg(test)]
mod publication_tests {
    use super::*;

    #[test]
    fn later_failure_restores_replaced_outputs_and_preserves_blocker() {
        let workspace = tempfile::tempdir().unwrap();
        let staged = tempfile::tempdir().unwrap();
        fs::write(workspace.path().join("first"), "original").unwrap();
        fs::write(workspace.path().join("blocked"), "keep").unwrap();
        fs::write(staged.path().join("first"), "cached").unwrap();
        fs::create_dir(staged.path().join("blocked")).unwrap();
        fs::write(staged.path().join("blocked/second"), "second").unwrap();
        let error = publish_outputs(
            workspace.path(),
            staged.path(),
            &["first".into(), "blocked/second".into()],
        )
        .unwrap_err();
        assert!(error.contains("outputs rolled back"), "{error}");
        assert_eq!(
            fs::read_to_string(workspace.path().join("first")).unwrap(),
            "original"
        );
        assert_eq!(
            fs::read_to_string(workspace.path().join("blocked")).unwrap(),
            "keep"
        );
        assert_eq!(
            fs::read_to_string(staged.path().join("first")).unwrap(),
            "cached"
        );
    }

    #[test]
    fn failed_replacement_restores_its_backup_and_removes_new_outputs() {
        let workspace = tempfile::tempdir().unwrap();
        let staged = tempfile::tempdir().unwrap();
        fs::write(workspace.path().join("second"), "original").unwrap();
        fs::write(staged.path().join("first"), "cached").unwrap();
        // The second staged output is deliberately missing.
        assert!(publish_outputs(
            workspace.path(),
            staged.path(),
            &["first".into(), "second".into()]
        )
        .is_err());
        assert!(!workspace.path().join("first").exists());
        assert_eq!(
            fs::read_to_string(workspace.path().join("second")).unwrap(),
            "original"
        );
    }
}

#[cfg(test)]
mod cancellation_tests {
    use super::*;

    #[test]
    fn streaming_copy_stops_between_chunks() {
        struct CancelAfterRead {
            cancel: Cancellation,
            reads: usize,
        }
        impl Read for CancelAfterRead {
            fn read(&mut self, buffer: &mut [u8]) -> std::io::Result<usize> {
                self.reads += 1;
                buffer.fill(42);
                self.cancel.cancel();
                Ok(buffer.len())
            }
        }
        let cancel = Cancellation::default();
        let mut source = CancelAfterRead {
            cancel: cancel.clone(),
            reads: 0,
        };
        let mut destination = Vec::new();
        assert!(copy_stream(&mut source, &mut destination, &cancel)
            .unwrap_err()
            .contains("cancelled"));
        assert_eq!(source.reads, 1);
        assert_eq!(destination.len(), 65536);
    }

    #[cfg(unix)]
    #[test]
    fn cache_sources_reject_fifo_substitution_and_keep_regular_executable_links() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let tool = root.path().join("tool");
        let target = root.path().join("target");
        fs::copy("/bin/sh", &target).unwrap();
        symlink(&target, &tool).unwrap();
        let task: Task = serde_json::from_value(serde_json::json!({
            "id": "build", "program": tool, "cwd": root.path(),
            "cache": {"inputs": [], "outputs": ["output"], "toolchain": "test"}
        }))
        .unwrap();
        let action = prepare(&root.path().join("cache"), &task, &[])
            .unwrap()
            .unwrap();
        let output = root.path().join("output");
        let stdout = root.path().join("stdout");
        let stderr = root.path().join("stderr");
        fs::write(&output, "artifact").unwrap();
        fs::write(&stdout, "log").unwrap();
        fs::write(&stderr, "").unwrap();
        fs::remove_file(&target).unwrap();
        let c_path = std::ffi::CString::new(target.as_os_str().as_encoded_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(c_path.as_ptr(), 0o600) }, 0);
        assert!(action
            .save(&task, &stdout, &stderr)
            .unwrap_err()
            .contains("not a regular file"));
        assert!(!action
            .root
            .join("actions")
            .join(format!("{}.json", action.key))
            .exists());
        assert!(action
            .store_blob(&target, &digest(b"unused"))
            .unwrap_err()
            .contains("not a regular file"));
        assert!(copy_file(&target, &output, &Cancellation::default())
            .unwrap_err()
            .contains("not a regular file"));
        assert_eq!(fs::read(&output).unwrap(), b"artifact");
    }

    #[cfg(unix)]
    #[test]
    fn cancelled_cache_work_does_not_publish_or_replace_outputs() {
        let root = tempfile::tempdir().unwrap();
        let task: Task = serde_json::from_value(serde_json::json!({
            "id": "build", "program": "/bin/sh", "cwd": root.path(),
            "cache": {"inputs": [], "outputs": ["output"], "toolchain": "test"}
        }))
        .unwrap();
        let cache = root.path().join("cache");
        let output = root.path().join("output");
        let stdout = root.path().join("stdout");
        let stderr = root.path().join("stderr");
        fs::write(&output, "cached").unwrap();
        fs::write(&stdout, "log").unwrap();
        fs::write(&stderr, "").unwrap();
        let cancel = Cancellation::default();
        let prepared = prepare_cancellable(&cache, &task, &[], &cancel)
            .unwrap()
            .unwrap();
        cancel.cancel();
        assert!(prepared
            .save(&task, &stdout, &stderr)
            .unwrap_err()
            .contains("cancelled"));
        assert!(!cache
            .join("actions")
            .join(format!("{}.json", prepared.key))
            .exists());
        drop(prepared);
        let cancel = Cancellation::default();
        let prepared = prepare_cancellable(&cache, &task, &[], &cancel)
            .unwrap()
            .unwrap();
        prepared.save(&task, &stdout, &stderr).unwrap();
        fs::write(&output, "preserved").unwrap();
        cancel.cancel();
        assert!(prepared
            .restore(&task, &stdout, &stderr)
            .unwrap_err()
            .contains("cancelled"));
        assert!(prepared
            .clean_outputs(&task)
            .unwrap_err()
            .contains("cancelled"));
        assert_eq!(fs::read_to_string(output).unwrap(), "preserved");
        assert!(
            matches!(prepare_cancellable(&root.path().join("unused"), &task, &[], &cancel), Err(e) if e.contains("cancelled"))
        );
        assert!(!root.path().join("unused").exists());
    }
}

#[cfg(test)]
mod snapshot_tests {
    use super::*;

    #[test]
    fn overlapping_roots_preserve_snapshot_and_detect_later_changes() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir_all(root.path().join("tree/nested")).unwrap();
        fs::write(root.path().join("tree/nested/data"), b"first").unwrap();
        fs::write(root.path().join("tree/other"), b"other").unwrap();
        let cancel = Cancellation::default();
        let expected = snapshot(root.path(), &["tree".into()], &cancel).unwrap();
        for paths in [
            vec!["tree", "tree", "tree/nested", "tree/nested/data"],
            vec!["tree/nested/data", "tree/nested", "tree", "tree"],
        ] {
            let paths = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();
            assert_eq!(snapshot(root.path(), &paths, &cancel).unwrap(), expected);
            assert_eq!(
                encoded_digest(&snapshot(root.path(), &paths, &cancel).unwrap()).unwrap(),
                encoded_digest(&expected).unwrap()
            );
        }
        fs::write(root.path().join("tree/nested/data"), b"later").unwrap();
        assert_ne!(
            snapshot(
                root.path(),
                &["tree".into(), "tree/nested/data".into()],
                &cancel
            )
            .unwrap(),
            expected
        );
        assert!(snapshot(
            root.path(),
            &["tree".into(), "tree/missing".into()],
            &cancel
        )
        .is_err());
        cancel.cancel();
        assert!(snapshot(root.path(), &["tree".into(), "tree".into()], &cancel).is_err());
    }

    #[test]
    #[ignore = "release-only snapshot benchmark; no timing threshold"]
    fn overlapping_input_snapshot_benchmark() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("tree")).unwrap();
        fs::write(root.path().join("tree/data"), vec![42; 8 * 1024 * 1024]).unwrap();
        let paths = (0..32)
            .map(|i| PathBuf::from(if i % 2 == 0 { "tree" } else { "tree/data" }))
            .collect::<Vec<_>>();
        let cancel = Cancellation::default();
        let expected = snapshot(root.path(), &["tree".into()], &cancel).unwrap();
        for _ in 0..5 {
            let start = std::time::Instant::now();
            let actual = snapshot(root.path(), &paths, &cancel).unwrap();
            let elapsed = start.elapsed();
            assert_eq!(actual, expected);
            eprintln!(
                "overlapping_input_snapshot seconds={:.6}",
                elapsed.as_secs_f64()
            );
        }
    }
}

#[cfg(all(test, unix))]
mod duplicate_blob_tests {
    use super::*;

    fn fixture(root: &Path, count: usize, bytes: &[u8]) -> (Task, Prepared, PathBuf, PathBuf) {
        fs::create_dir(root.join("outputs")).unwrap();
        for index in 0..count {
            fs::write(root.join("outputs").join(index.to_string()), bytes).unwrap();
        }
        let stdout = root.join("stdout");
        let stderr = root.join("stderr");
        fs::write(&stdout, bytes).unwrap();
        fs::write(&stderr, bytes).unwrap();
        let task: Task = serde_json::from_value(serde_json::json!({
            "id":"duplicate-blobs", "program":"/bin/sh", "cwd":root,
            "cache":{"inputs":[],"outputs":["outputs"],"toolchain":"fixture"}
        }))
        .unwrap();
        let action = prepare(&root.join("cache"), &task, &[]).unwrap().unwrap();
        (task, action, stdout, stderr)
    }

    fn substitute(path: &Path, kind: &str, target: &Path) {
        fs::remove_file(path).unwrap();
        match kind {
            "symlink" => std::os::unix::fs::symlink(target, path).unwrap(),
            "directory" => fs::create_dir(path).unwrap(),
            "fifo" => {
                use std::os::unix::ffi::OsStrExt;
                let path = std::ffi::CString::new(path.as_os_str().as_bytes()).unwrap();
                assert_eq!(unsafe { libc::mkfifo(path.as_ptr(), 0o600) }, 0);
            }
            _ => unreachable!(),
        }
    }

    #[test]
    fn substituted_storage_entries_reject_restore_without_publishing() {
        for entry in ["manifest", "blob", "stdout", "stderr"] {
            for kind in ["symlink", "directory", "fifo"] {
                let root = tempfile::tempdir().unwrap();
                let (task, action, stdout, stderr) = fixture(root.path(), 2, b"shared");
                fs::write(&stdout, b"cached stdout").unwrap();
                fs::write(&stderr, b"cached stderr").unwrap();
                action.save(&task, &stdout, &stderr).unwrap();
                let path = if entry == "manifest" {
                    action
                        .root
                        .join("actions")
                        .join(format!("{}.json", action.key))
                } else {
                    let bytes: &[u8] = match entry {
                        "stdout" => b"cached stdout",
                        "stderr" => b"cached stderr",
                        _ => b"shared",
                    };
                    action.blob(&digest(bytes)).unwrap()
                };
                // Even a symlink to byte-for-byte valid content must be rejected.
                let target = root.path().join("external");
                let original = fs::read(&path).unwrap();
                fs::write(&target, &original).unwrap();
                substitute(&path, kind, &target);
                fs::write(root.path().join("outputs/0"), b"keep output").unwrap();
                fs::write(&stdout, b"keep stdout").unwrap();
                fs::write(&stderr, b"keep stderr").unwrap();
                assert!(
                    action.restore(&task, &stdout, &stderr).is_err(),
                    "{entry}/{kind}"
                );
                assert_eq!(
                    fs::read(root.path().join("outputs/0")).unwrap(),
                    b"keep output"
                );
                assert_eq!(fs::read(&stdout).unwrap(), b"keep stdout");
                assert_eq!(fs::read(&stderr).unwrap(), b"keep stderr");
                assert_eq!(fs::read(&target).unwrap(), original);
            }
        }
    }

    #[test]
    fn substituted_blobs_reject_save_without_modifying_external_content() {
        for kind in ["symlink", "directory", "fifo"] {
            let root = tempfile::tempdir().unwrap();
            let (task, action, stdout, stderr) = fixture(root.path(), 2, b"shared");
            action.save(&task, &stdout, &stderr).unwrap();
            let blob = action.blob(&digest(b"shared")).unwrap();
            let target = root.path().join("external");
            fs::write(&target, b"shared").unwrap();
            substitute(&blob, kind, &target);
            assert!(action.save(&task, &stdout, &stderr).is_err(), "{kind}");
            assert_eq!(fs::read(&target).unwrap(), b"shared");
        }
    }

    #[test]
    fn duplicate_outputs_and_logs_repair_corruption_and_refresh_between_saves() {
        let root = tempfile::tempdir().unwrap();
        let (task, action, stdout, stderr) = fixture(root.path(), 2, b"shared");
        action.save(&task, &stdout, &stderr).unwrap();
        let shared_blob = action.blob(&digest(b"shared")).unwrap();
        assert_eq!(
            fs::read_dir(root.path().join("cache/blobs"))
                .unwrap()
                .count(),
            1
        );
        fs::write(&shared_blob, b"corrupted").unwrap();
        action.save(&task, &stdout, &stderr).unwrap();
        assert_eq!(fs::read(&shared_blob).unwrap(), b"shared");
        fs::write(root.path().join("outputs/0"), b"changed output").unwrap();
        fs::write(&stdout, b"changed stdout").unwrap();
        action.save(&task, &stdout, &stderr).unwrap();
        fs::remove_dir_all(root.path().join("outputs")).unwrap();
        fs::remove_file(&stdout).unwrap();
        fs::remove_file(&stderr).unwrap();
        assert!(action.restore(&task, &stdout, &stderr).unwrap());
        assert_eq!(
            fs::read(root.path().join("outputs/0")).unwrap(),
            b"changed output"
        );
        assert_eq!(fs::read(root.path().join("outputs/1")).unwrap(), b"shared");
        assert_eq!(fs::read(&stdout).unwrap(), b"changed stdout");
        assert_eq!(fs::read(&stderr).unwrap(), b"shared");
        assert_eq!(
            fs::read_dir(root.path().join("cache/blobs"))
                .unwrap()
                .count(),
            3
        );
    }

    #[test]
    #[ignore = "release-only duplicate blob publication benchmark; no timing threshold"]
    fn duplicate_blob_publication_benchmark() {
        let root = tempfile::tempdir().unwrap();
        let bytes = vec![42; 4 * 1024 * 1024];
        let (task, action, stdout, stderr) = fixture(root.path(), 16, &bytes);
        action.save(&task, &stdout, &stderr).unwrap();
        for _ in 0..5 {
            let start = std::time::Instant::now();
            action.save(&task, &stdout, &stderr).unwrap();
            eprintln!(
                "duplicate_blob_publication seconds={:.6}",
                start.elapsed().as_secs_f64()
            );
        }
        fs::remove_dir_all(root.path().join("outputs")).unwrap();
        assert!(action.restore(&task, &stdout, &stderr).unwrap());
        for index in 0..16 {
            assert_eq!(
                fs::read(root.path().join("outputs").join(index.to_string())).unwrap(),
                bytes
            );
        }
        assert_eq!(fs::read(stdout).unwrap(), bytes);
        assert_eq!(fs::read(stderr).unwrap(), bytes);
    }
}

#[cfg(all(test, unix))]
mod parallel_snapshot_tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Barrier,
    };

    fn entries(count: usize) -> Vec<Entry> {
        (0..count)
            .map(|index| Entry {
                path: index.to_string().into(),
                directory: false,
                mode: 0o644,
                digest: None,
            })
            .collect()
    }
    struct Active<'a>(&'a AtomicUsize);
    impl Drop for Active<'_> {
        fn drop(&mut self) {
            self.0.fetch_sub(1, Ordering::SeqCst);
        }
    }

    #[test]
    fn serial_and_parallel_snapshots_have_identical_content_and_order() {
        let root = tempfile::tempdir().unwrap();
        fs::create_dir(root.path().join("tree")).unwrap();
        fs::create_dir(root.path().join("tree/empty")).unwrap();
        for index in 0..12 {
            fs::write(
                root.path().join(format!("tree/{index}")),
                vec![index as u8; 100_000 + index],
            )
            .unwrap();
        }
        let roots = vec!["tree".into(), "tree/0".into(), "tree".into()];
        let cancel = Cancellation::default();
        let serial = snapshot(root.path(), &roots, &cancel).unwrap();
        for jobs in [1, 2, 4, usize::MAX] {
            assert_eq!(
                snapshot_with_jobs(root.path(), &roots, &cancel, jobs).unwrap(),
                serial
            );
        }
        fs::write(root.path().join("tree/0"), b"changed").unwrap();
        let changed = snapshot_with_jobs(root.path(), &roots, &cancel, 4).unwrap();
        assert_ne!(changed, serial);
        assert_eq!(changed, snapshot(root.path(), &roots, &cancel).unwrap());
        std::os::unix::fs::symlink(root.path().join("tree/0"), root.path().join("tree/link"))
            .unwrap();
        assert!(snapshot_with_jobs(root.path(), &roots, &cancel, 4).is_err());
        cancel.cancel();
        assert!(snapshot_with_jobs(root.path(), &[], &cancel, 4).is_err());
    }

    #[test]
    fn hashing_overlaps_without_exceeding_the_requested_bound() {
        let active = AtomicUsize::new(0);
        let peak = AtomicUsize::new(0);
        let calls = AtomicUsize::new(0);
        let barrier = Barrier::new(2);
        let mut entries = entries(12);
        hash_entries(
            Path::new("/unused"),
            &mut entries,
            &Cancellation::default(),
            2,
            &|path, _| {
                let running = active.fetch_add(1, Ordering::SeqCst) + 1;
                let _active = Active(&active);
                peak.fetch_max(running, Ordering::SeqCst);
                if calls.fetch_add(1, Ordering::SeqCst) < 2 {
                    barrier.wait();
                }
                std::thread::sleep(std::time::Duration::from_millis(2));
                Ok(path.file_name().unwrap().to_string_lossy().into_owned())
            },
        )
        .unwrap();
        assert_eq!(peak.load(Ordering::SeqCst), 2);
        assert_eq!(active.load(Ordering::SeqCst), 0);
        assert_eq!(calls.load(Ordering::SeqCst), 12);
        for entry in entries {
            assert_eq!(entry.digest.as_deref(), entry.path.to_str());
        }
    }

    #[test]
    fn cancellation_failure_and_panic_join_all_hash_workers() {
        for outcome in ["cancel", "error", "panic"] {
            let active = AtomicUsize::new(0);
            let finished = AtomicUsize::new(0);
            let barrier = Barrier::new(2);
            let cancel = Cancellation::default();
            let mut entries = entries(2);
            let result = hash_entries(
                Path::new("/unused"),
                &mut entries,
                &cancel,
                2,
                &|path, token| {
                    active.fetch_add(1, Ordering::SeqCst);
                    let _active = Active(&active);
                    barrier.wait();
                    if path.file_name().unwrap() == "0" {
                        match outcome {
                            "cancel" => {
                                token.cancel();
                                return Err("cancelled".into());
                            }
                            "error" => return Err("injected read failure".into()),
                            _ => panic!("injected hash panic"),
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    finished.fetch_add(1, Ordering::SeqCst);
                    Ok("other worker finished".into())
                },
            );
            assert!(result.is_err(), "{outcome}");
            assert_eq!(active.load(Ordering::SeqCst), 0, "{outcome}");
            assert_eq!(finished.load(Ordering::SeqCst), 1, "{outcome}");
            assert!(entries.iter().all(|entry| entry.digest.is_none()));
        }
    }
}
