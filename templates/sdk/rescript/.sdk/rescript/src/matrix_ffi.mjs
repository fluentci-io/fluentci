const frozen = Object.freeze;
const component = value => encodeURIComponent(value).replace(/[!'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase());
const result = (ok, error, f) => { try { return ok(f()); } catch (e) { return error(e instanceof Error ? e.message : String(e)); } };
export const named = (name, value) => frozen({ key: component(name), value });
export const axis = (name, values) => frozen(values.map(value => frozen({ key: `${component(name)}=${component(value)}`, value })));
export const include = (cases, extra) => frozen([...cases, ...extra]);
export const exclude = (cases, predicate) => frozen(cases.filter(c => !predicate(c.value)));
export const product = (left, right, ok, error) => result(ok, error, () => {
  if (left.length * right.length > 4096) throw Error("matrix expansion exceeds 4096 cases");
  return frozen(left.flatMap(a => right.map(b => frozen({ key: `${a.key},${b.key}`, value: frozen([a.value, b.value]) }))));
});
export const task = (id, program, args, cwd) => frozen({ id, program, args: frozen([...args]), cwd, env: frozen({}), needs: frozen([]) });
export const withEnv = (task, key, value) => frozen({ ...task, env: frozen({ ...task.env, [key]: value }) });
export const after = (task, parents) => frozen({ ...task, needs: frozen([...new Set([...task.needs, ...parents.map(parent => parent.id)])]) });
export const parallel = (tasks, jobs) => frozen({ version: 1, inherit_env: false, tasks: frozen([...tasks]), jobs, fail_fast: true });
export const withFailFast = (plan, fail_fast) => frozen({ ...plan, fail_fast });
export const compile = plan => {
  if (!Number.isInteger(plan.jobs) || plan.jobs < 1) throw Error("jobs must be positive");
  if (new Set(plan.tasks.map(task => task.id)).size !== plan.tasks.length) throw Error("duplicate task IDs");
  return JSON.stringify(plan);
};
export const matrix = (name, cases, build, ok, error) => result(ok, error, () => {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name)) throw Error("invalid matrix name");
  if (cases.length > 4096) throw Error("matrix expansion exceeds 4096 cases");
  const keys = new Set();
  for (const c of cases) {
    if (!c.key || c.key.includes("\0") || keys.has(c.key)) throw Error("matrix cases require unique, nonempty keys without NUL");
    keys.add(c.key);
  }
  return frozen(cases.map(c => frozen({ ...build(c.value), id: `${name}[${c.key}]` })));
});
export const run = (plan, directory, ok, error) => result(ok, error, () => {
  const fn = Host.getFunctions().execute_plan;
  if (!fn) throw Error("This engine does not expose execute_plan; upgrade the engine");
  const request = JSON.stringify({ plan: JSON.parse(compile(plan)), run_dir: directory });
  const report = JSON.parse(Memory.find(fn(Memory.fromString(request).offset)).readString());
  if (!["succeeded", "failed", "cancelled"].includes(report?.outcome) || !Array.isArray(report.tasks)) throw Error("invalid terminal plan report");
  return report;
});

export const cached = (task, inputs, outputs, toolchain) => frozen({ ...task, cache: frozen({ inputs: frozen([...inputs]), outputs: frozen([...outputs]), toolchain }) });

export const withCacheDirectory = (plan, cache_dir) => frozen({ ...plan, cache_dir });

const policy = (value, update) => frozen({ ...value, policy: frozen({ ...value.policy, ...update }) });
export const retry = (value, attempts, delayMs) => policy(value, { retry: frozen({ max_attempts: attempts, delay_ms: delayMs, max_delay_ms: 60000, exit_codes: frozen([]) }) });
export const whenTask = (value, condition) => {
  const task = policy(value, { when: condition });
  return ["always", "failure"].includes(condition) ? frozen({ ...task, timeout_ms: task.timeout_ms ?? 30000, resource_wait_timeout_ms: task.resource_wait_timeout_ms ?? 30000 }) : task;
};
export const always = value => whenTask(value, "always");
export const allowFailure = (value, enabled) => policy(value, { allow_failure: enabled });
export const artifact = (value, name, path) => policy(value, { artifacts: frozen({ ...value.policy?.artifacts, [name]: path }) });
export const output = (value, name, path) => policy(value, { outputs: frozen({ ...value.policy?.outputs, [name]: path }) });
export const outputEnv = (value, key, producer, name) => policy(after(value, [producer]), { bindings: frozen({ ...value.policy?.bindings, [key]: frozen({ task: producer.id, name }) }) });
export const resource = (value, name) => frozen({ ...value, resources: frozen([...new Set([...(value.resources ?? []), name])]) });
export const service = (value, program, args, interval_ms, timeout_ms) => frozen({ ...value, service: frozen({ readiness: frozen({ program, args: frozen([...args]), interval_ms, timeout_ms }), startup_timeout_ms: 30000, shutdown_timeout_ms: 5000, failure_threshold: 3 }) });
export const resultOutput = (report, id, name, ok, error) => result(ok, error, () => {
  const value = report.tasks.find(task => task.id === id)?.outputs?.[name];
  if (typeof value !== "string") throw Error(`missing output ${id}.${name}`);
  return value;
});
export const resultArtifact = (report, id, name, ok, error) => result(ok, error, () => {
  const value = report.tasks.find(task => task.id === id)?.artifacts?.[name];
  if (!value || typeof value.path !== "string" || typeof value.sha256 !== "string" || typeof value.size !== "number") throw Error(`missing artifact ${id}.${name}`);
  return frozen({ ...value });
});
export const resultAttempts = (report, id, ok, error) => result(ok, error, () => {
  const task = report.tasks.find(task => task.id === id);
  if (!task) throw Error(`missing task ${id}`);
  return frozen((task.attempts ?? []).map(attempt => frozen({ ...attempt })));
});
