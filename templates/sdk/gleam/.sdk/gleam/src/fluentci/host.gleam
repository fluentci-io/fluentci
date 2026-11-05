/// Immutable host plans. Construction and compilation perform no I/O.
import gleam/dict
import gleam/int
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/string

pub type Cache {
  Cache(
    inputs: List(String),
    outputs: List(String),
    toolchain: String,
    relocatable: Bool,
    toolchain_files: List(String),
  )
}

pub type Probe {
  Probe(program: String, args: List(String), interval_ms: Int, timeout_ms: Int)
}

pub type Service {
  Service(
    readiness: Probe,
    health: Option(Probe),
    startup_timeout_ms: Int,
    shutdown_timeout_ms: Int,
    failure_threshold: Int,
  )
}

pub type ProviderKind {
  Homebrew
  MacPortsNative
  MacPortsRust
  FreeBsd
  NetBsd
  OpenBsd
}

pub type Provider {
  Provider(kind: ProviderKind, executable: Option(String))
}

pub type Condition {
  OnSuccess
  OnFailure
  Always
  Never
}

pub type Retry {
  Retry(
    max_attempts: Int,
    delay_ms: Int,
    max_delay_ms: Int,
    exit_codes: List(Int),
  )
}

pub type OutputRef {
  OutputRef(task: String, name: String)
}

pub type Policy {
  Policy(
    condition: Condition,
    retry: Option(Retry),
    allow_failure: Bool,
    outputs: List(#(String, String)),
    artifacts: List(#(String, String)),
    bindings: List(#(String, OutputRef)),
  )
}

fn default_policy() -> Policy {
  Policy(OnSuccess, None, False, [], [], [])
}

pub type Primitive

pub opaque type Task {
  Task(
    id: String,
    program: String,
    cwd: String,
    args: List(String),
    needs: List(String),
    env: List(#(String, String)),
    resources: List(String),
    shared_resources: List(String),
    timeout_ms: Option(Int),
    resource_wait_timeout_ms: Option(Int),
    cache: Option(Cache),
    service: Option(Service),
    installation: Option(#(Provider, List(String))),
    packages: List(Provider),
    policy: Option(Policy),
    primitive: Option(Primitive),
    file_operation: Option(FileOperation),
    env_files: List(String),
  )
}

pub opaque type Plan {
  Plan(
    tasks: List(Task),
    jobs: Int,
    max_services: Int,
    fail_fast: Bool,
    cache_dir: Option(String),
    resource_dir: Option(String),
    workspace: Option(#(String, List(String))),
  )
}

pub type PlanError {
  InvalidLimits
  InvalidTask
  DuplicateIds
  MissingDependency(String)
}

pub fn task(id: String, program: String, cwd: String) -> Task {
  Task(
    id:,
    program:,
    cwd:,
    args: [],
    needs: [],
    env: [],
    resources: [],
    shared_resources: [],
    timeout_ms: None,
    resource_wait_timeout_ms: None,
    cache: None,
    service: None,
    installation: None,
    packages: [],
    policy: None,
    primitive: None,
    file_operation: None,
    env_files: [],
  )
}

pub fn retry(task: Task, attempts: Int, delay_ms: Int) -> Task {
  let policy = option.unwrap(task.policy, default_policy())
  Task(
    ..task,
    policy: Some(
      Policy(..policy, retry: Some(Retry(attempts, delay_ms, 60_000, []))),
    ),
  )
}

pub fn when_task(task: Task, condition: Condition) -> Task {
  let policy = option.unwrap(task.policy, default_policy())
  let task = Task(..task, policy: Some(Policy(..policy, condition:)))
  case condition {
    Always | OnFailure ->
      Task(
        ..task,
        timeout_ms: Some(option.unwrap(task.timeout_ms, 30_000)),
        resource_wait_timeout_ms: Some(option.unwrap(
          task.resource_wait_timeout_ms,
          30_000,
        )),
      )
    _ -> task
  }
}

pub fn always(task: Task) -> Task {
  when_task(task, Always)
}

pub fn allow_failure(task: Task, enabled: Bool) -> Task {
  let policy = option.unwrap(task.policy, default_policy())
  Task(..task, policy: Some(Policy(..policy, allow_failure: enabled)))
}

pub fn artifact(task: Task, name: String, path: String) -> Task {
  let policy = option.unwrap(task.policy, default_policy())
  Task(
    ..task,
    policy: Some(
      Policy(
        ..policy,
        artifacts: list.append(
          list.filter(policy.artifacts, fn(entry) { entry.0 != name }),
          [#(name, path)],
        ),
      ),
    ),
  )
}

pub fn output(task: Task, name: String, path: String) -> Task {
  let policy = option.unwrap(task.policy, default_policy())
  Task(
    ..task,
    policy: Some(
      Policy(
        ..policy,
        outputs: list.append(
          list.filter(policy.outputs, fn(entry) { entry.0 != name }),
          [#(name, path)],
        ),
      ),
    ),
  )
}

pub fn output_env(
  task: Task,
  key: String,
  producer: Task,
  name: String,
) -> Task {
  let task = after_jobs(task, [producer])
  let policy = option.unwrap(task.policy, default_policy())
  Task(
    ..task,
    policy: Some(
      Policy(
        ..policy,
        bindings: list.append(
          list.filter(policy.bindings, fn(entry) { entry.0 != key }),
          [#(key, OutputRef(producer.id, name))],
        ),
      ),
    ),
  )
}

pub fn resource(task: Task, name: String) -> Task {
  Task(..task, resources: list.unique(list.append(task.resources, [name])))
}

/// Rename a value without changing its command/dependencies.
pub fn with_id(task: Task, id: String) -> Task {
  Task(..task, id:)
}

/// Join existing dependencies with the complete parent group.
pub fn after_jobs(task: Task, parents: List(Task)) -> Task {
  Task(
    ..task,
    needs: list.unique(list.append(task.needs, list.map(parents, task_id))),
  )
}

pub fn task_id(task: Task) -> String {
  task.id
}

pub fn with_args(task: Task, args: List(String)) -> Task {
  Task(..task, args:)
}

pub fn needs(task: Task, parents: List(Task)) -> Task {
  Task(..task, needs: list.map(parents, task_id))
}

pub fn with_env(task: Task, key: String, value: String) -> Task {
  Task(..task, env: [
    #(key, value),
    ..list.filter(task.env, fn(entry) { entry.0 != key })
  ])
}

pub fn with_resources(task: Task, resources: List(String)) -> Task {
  Task(..task, resources:)
}

pub fn with_shared_resources(task: Task, resources: List(String)) -> Task {
  Task(..task, shared_resources: resources)
}

pub fn with_timeout(task: Task, milliseconds: Int) -> Task {
  Task(..task, timeout_ms: Some(milliseconds))
}

pub fn with_resource_wait_timeout(task: Task, milliseconds: Int) -> Task {
  Task(..task, resource_wait_timeout_ms: Some(milliseconds))
}

pub fn cache(
  inputs: List(String),
  outputs: List(String),
  toolchain: String,
) -> Cache {
  Cache(inputs:, outputs:, toolchain:, relocatable: False, toolchain_files: [])
}

pub fn with_cache(task: Task, cache: Cache) -> Task {
  Task(..task, cache: Some(cache))
}

/// Verify the contents and permissions of absolute toolchain file paths.
pub fn with_toolchain_files(cache: Cache, paths: List(String)) -> Cache {
  Cache(..cache, toolchain_files: paths)
}

pub fn with_relocatable_cache(task: Task, cache: Cache) -> Task {
  Task(..task, cache: Some(Cache(..cache, relocatable: True)))
}

pub fn service(readiness: Probe) -> Service {
  Service(
    readiness:,
    health: None,
    startup_timeout_ms: 30_000,
    shutdown_timeout_ms: 5000,
    failure_threshold: 3,
  )
}

pub fn with_health(service: Service, health: Probe) -> Service {
  Service(..service, health: Some(health))
}

pub fn as_service(task: Task, service: Service) -> Task {
  Task(..task, service: Some(service))
}

pub fn provider(kind: ProviderKind) -> Provider {
  Provider(kind:, executable: None)
}

pub fn with_provider_executable(
  provider: Provider,
  executable: String,
) -> Provider {
  Provider(..provider, executable: Some(executable))
}

pub fn install(
  id: String,
  cwd: String,
  provider: Provider,
  packages: List(String),
) -> Task {
  Task(..task(id, "", cwd), installation: Some(#(provider, packages)))
}

pub fn with_package_environment(task: Task, providers: List(Provider)) -> Task {
  Task(..task, packages: providers)
}

pub fn plan(tasks: List(Task)) -> Plan {
  Plan(
    tasks:,
    jobs: 1,
    max_services: 8,
    fail_fast: True,
    cache_dir: None,
    resource_dir: None,
    workspace: None,
  )
}

pub fn with_jobs(plan: Plan, jobs: Int) -> Plan {
  Plan(..plan, jobs:)
}

pub fn with_max_services(plan: Plan, count: Int) -> Plan {
  Plan(..plan, max_services: count)
}

pub fn with_fail_fast(plan: Plan, enabled: Bool) -> Plan {
  Plan(..plan, fail_fast: enabled)
}

pub fn with_cache_directory(plan: Plan, path: String) -> Plan {
  Plan(..plan, cache_dir: Some(path))
}

pub fn with_resource_directory(plan: Plan, path: String) -> Plan {
  Plan(..plan, resource_dir: Some(path))
}

pub fn with_workspace(
  plan: Plan,
  source: String,
  inputs: List(String),
) -> Plan {
  Plan(..plan, workspace: Some(#(source, inputs)))
}

@external(javascript, "../host_ffi.mjs", "quote")
fn quote(value: String) -> String

fn object(fields: List(#(String, String))) -> String {
  "{"
  <> string.join(
    list.map(fields, fn(field) { quote(field.0) <> ":" <> field.1 }),
    ",",
  )
  <> "}"
}

fn array(values: List(String)) -> String {
  "[" <> string.join(values, ",") <> "]"
}

fn strings(values: List(String)) -> String {
  array(list.map(values, quote))
}

fn boolean(value: Bool) -> String {
  case value {
    True -> "true"
    False -> "false"
  }
}

fn optional(
  value: Option(a),
  key: String,
  encode: fn(a) -> String,
) -> List(#(String, String)) {
  case value {
    None -> []
    Some(value) -> [#(key, encode(value))]
  }
}

fn encode_probe(probe: Probe) -> String {
  object([
    #("program", quote(probe.program)),
    #("args", strings(probe.args)),
    #("interval_ms", int.to_string(probe.interval_ms)),
    #("timeout_ms", int.to_string(probe.timeout_ms)),
  ])
}

fn encode_service(service: Service) -> String {
  object(list.append(
    [
      #("readiness", encode_probe(service.readiness)),
      #("startup_timeout_ms", int.to_string(service.startup_timeout_ms)),
      #("shutdown_timeout_ms", int.to_string(service.shutdown_timeout_ms)),
      #("failure_threshold", int.to_string(service.failure_threshold)),
    ],
    optional(service.health, "health", encode_probe),
  ))
}

fn encode_provider(provider: Provider) -> String {
  let #(manager, backend) = case provider.kind {
    Homebrew -> #("homebrew", "native")
    MacPortsNative -> #("macports", "native")
    MacPortsRust -> #("macports", "rust")
    FreeBsd -> #("freebsd", "native")
    NetBsd -> #("netbsd", "native")
    OpenBsd -> #("openbsd", "native")
  }
  object(list.append(
    [#("manager", quote(manager)), #("backend", quote(backend))],
    optional(provider.executable, "executable", quote),
  ))
}

fn encode_cache(cache: Cache) -> String {
  let base = [
    #("inputs", strings(cache.inputs)),
    #("outputs", strings(cache.outputs)),
    #("toolchain", quote(cache.toolchain)),
  ]
  let base = case cache.toolchain_files {
    [] -> base
    paths -> list.append(base, [#("toolchain_files", strings(paths))])
  }
  object(case cache.relocatable {
    True -> list.append(base, [#("relocatable", "true")])
    False -> base
  })
}

fn encode_policy(policy: Policy) -> String {
  let condition = case policy.condition {
    OnSuccess -> "success"
    OnFailure -> "failure"
    Always -> "always"
    Never -> "never"
  }
  object(list.append(
    [
      #("when", quote(condition)),
      #("allow_failure", boolean(policy.allow_failure)),
      #(
        "outputs",
        object(
          list.map(policy.outputs, fn(entry) { #(entry.0, quote(entry.1)) }),
        ),
      ),
      #(
        "artifacts",
        object(
          list.map(policy.artifacts, fn(entry) { #(entry.0, quote(entry.1)) }),
        ),
      ),
      #(
        "bindings",
        object(
          list.map(policy.bindings, fn(entry) {
            #(
              entry.0,
              object([
                #("task", quote(entry.1.task)),
                #("name", quote(entry.1.name)),
              ]),
            )
          }),
        ),
      ),
    ],
    optional(policy.retry, "retry", fn(retry) {
      object([
        #("max_attempts", int.to_string(retry.max_attempts)),
        #("delay_ms", int.to_string(retry.delay_ms)),
        #("max_delay_ms", int.to_string(retry.max_delay_ms)),
        #("exit_codes", array(list.map(retry.exit_codes, int.to_string))),
      ])
    }),
  ))
}

fn encode_task(task: Task) -> String {
  let fields = [
    #("id", quote(task.id)),
    #("program", quote(task.program)),
    #("cwd", quote(task.cwd)),
    #("args", strings(task.args)),
    #("needs", strings(task.needs)),
    #(
      "env",
      object(list.map(task.env, fn(entry) { #(entry.0, quote(entry.1)) })),
    ),
    #("resources", strings(task.resources)),
  ]
  let additions =
    list.flatten([
      optional(task.timeout_ms, "timeout_ms", int.to_string),
      optional(
        task.resource_wait_timeout_ms,
        "resource_wait_timeout_ms",
        int.to_string,
      ),
      optional(task.cache, "cache", encode_cache),
      optional(task.policy, "policy", encode_policy),
      optional(task.primitive, "primitive", encode_primitive),
      optional(task.file_operation, "file_operation", encode_file_operation),
      case task.env_files {
        [] -> []
        values -> [#("env_files", strings(values))]
      },
      optional(task.service, "service", encode_service),
      optional(task.installation, "package_install", fn(install) {
        object([
          #("provider", encode_provider(install.0)),
          #("packages", strings(install.1)),
        ])
      }),
      case task.packages {
        [] -> []
        values -> [
          #("package_environment", array(list.map(values, encode_provider))),
        ]
      },
      case task.shared_resources {
        [] -> []
        values -> [#("shared_resources", strings(values))]
      },
    ])
  object(list.append(fields, additions))
}

pub fn compile(plan: Plan) -> Result(String, PlanError) {
  let ids = list.map(plan.tasks, task_id)
  let index = dict.from_list(list.map(ids, fn(id) { #(id, Nil) }))
  let missing =
    list.find(list.flat_map(plan.tasks, fn(task) { task.needs }), fn(id) {
      !dict.has_key(index, id)
    })
  case
    plan.jobs > 0 && plan.max_services > 0,
    dict.size(index) == list.length(ids),
    list.all(plan.tasks, fn(task) {
      task.id != ""
      && task.cwd != ""
      && {
        task.program != ""
        || task.installation != None
        || task.file_operation != None
        || task.primitive != None
      }
      && option.unwrap(task.timeout_ms, 1) > 0
      && option.unwrap(task.resource_wait_timeout_ms, 1) > 0
    }),
    missing
  {
    False, _, _, _ -> Error(InvalidLimits)
    _, False, _, _ -> Error(DuplicateIds)
    _, _, False, _ -> Error(InvalidTask)
    _, _, _, Ok(id) -> Error(MissingDependency(id))
    True, True, True, Error(_) -> {
      let fields = [
        #("version", "1"),
        #("inherit_env", "false"),
        #("jobs", int.to_string(plan.jobs)),
        #("max_services", int.to_string(plan.max_services)),
        #("fail_fast", boolean(plan.fail_fast)),
        #("tasks", array(list.map(plan.tasks, encode_task))),
      ]
      Ok(
        object(list.append(
          fields,
          list.flatten([
            optional(plan.cache_dir, "cache_dir", quote),
            optional(plan.resource_dir, "resource_dir", quote),
            optional(plan.workspace, "workspace", fn(workspace) {
              object([
                #("source", quote(workspace.0)),
                #("inputs", strings(workspace.1)),
              ])
            }),
          ]),
        )),
      )
    }
  }
}

pub type FileOperation {
  ReadText(path: String, limit_bytes: Int)
  ReadBytes(path: String, limit_bytes: Int)
  WriteText(path: String, text: String, overwrite: Bool)
  WriteBytes(path: String, bytes: List(Int), overwrite: Bool)
  CopyFile(source: String, destination: String, overwrite: Bool)
  CopyTree(source: String, destination: String, overwrite: Bool)
  Move(source: String, destination: String, overwrite: Bool)
  Mkdir(path: String, parents: Bool)
  Remove(path: String, recursive: Bool, missing_ok: Bool)
  Stat(path: String)
  Exists(path: String)
  ListEntries(path: String)
  Glob(pattern: String)
  Hash(path: String)
  Chmod(path: String, mode: Int)
  Symlink(target: String, path: String)
}

pub fn file_task(id: String, operation: FileOperation, cwd: String) -> Task {
  Task(..task(id, "", cwd), file_operation: Some(operation))
}

pub fn env_file(task: Task, path: String) -> Task {
  Task(..task, env_files: list.append(task.env_files, [path]))
}

fn encode_file_operation(operation: FileOperation) -> String {
  case operation {
    ReadText(path, limit_bytes) ->
      object([
        #("op", quote("read_text")),
        #("path", quote(path)),
        #("limit_bytes", int.to_string(limit_bytes)),
      ])
    ReadBytes(path, limit_bytes) ->
      object([
        #("op", quote("read_bytes")),
        #("path", quote(path)),
        #("limit_bytes", int.to_string(limit_bytes)),
      ])
    WriteText(path, text, overwrite) ->
      object([
        #("op", quote("write_text")),
        #("path", quote(path)),
        #("text", quote(text)),
        #("overwrite", boolean(overwrite)),
      ])
    WriteBytes(path, bytes, overwrite) ->
      object([
        #("op", quote("write_bytes")),
        #("path", quote(path)),
        #("bytes", array(list.map(bytes, int.to_string))),
        #("overwrite", boolean(overwrite)),
      ])
    CopyFile(source, destination, overwrite) ->
      object([
        #("op", quote("copy_file")),
        #("source", quote(source)),
        #("destination", quote(destination)),
        #("overwrite", boolean(overwrite)),
      ])
    CopyTree(source, destination, overwrite) ->
      object([
        #("op", quote("copy_tree")),
        #("source", quote(source)),
        #("destination", quote(destination)),
        #("overwrite", boolean(overwrite)),
      ])
    Move(source, destination, overwrite) ->
      object([
        #("op", quote("move")),
        #("source", quote(source)),
        #("destination", quote(destination)),
        #("overwrite", boolean(overwrite)),
      ])
    Mkdir(path, parents) ->
      object([
        #("op", quote("mkdir")),
        #("path", quote(path)),
        #("parents", boolean(parents)),
      ])
    Remove(path, recursive, missing_ok) ->
      object([
        #("op", quote("remove")),
        #("path", quote(path)),
        #("recursive", boolean(recursive)),
        #("missing_ok", boolean(missing_ok)),
      ])
    Stat(path) -> object([#("op", quote("stat")), #("path", quote(path))])
    Exists(path) -> object([#("op", quote("exists")), #("path", quote(path))])
    ListEntries(path) ->
      object([#("op", quote("list")), #("path", quote(path))])
    Glob(pattern) ->
      object([#("op", quote("glob")), #("pattern", quote(pattern))])
    Hash(path) -> object([#("op", quote("hash")), #("path", quote(path))])
    Chmod(path, mode) ->
      object([
        #("op", quote("chmod")),
        #("path", quote(path)),
        #("mode", int.to_string(mode)),
      ])
    Symlink(target, path) ->
      object([
        #("op", quote("symlink")),
        #("target", quote(target)),
        #("path", quote(path)),
      ])
  }
}

@external(javascript, "../remote_ffi.mjs", "primitiveJson")
fn encode_primitive(value: Primitive) -> String

pub fn with_primitive(task: Task, value: Primitive) -> Task {
  Task(..task, primitive: Some(value))
}
