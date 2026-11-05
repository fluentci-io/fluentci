/** Pure native-plan matrices. run() calls execute_plan once for the whole plan. */
export type Case<A> = Readonly<{ key: string; value: A }>;
export type Task = Readonly<{
  id: string; program: string; args: readonly string[]; cwd: string;
  env: Readonly<Record<string, string>>; needs: readonly string[];
  timeout_ms?: number; resource_wait_timeout_ms?: number;
  primitive?: import("./remote.ts").Operation;
  file_operation?: import("./files.ts").FileOperation; env_files?: readonly string[];
  resources?: readonly string[]; service?: Service; policy?: Policy;
  cache?: Readonly<{ inputs: readonly string[]; outputs: readonly string[]; toolchain: string }>;
}>;
export type Plan = Readonly<{ version: 1; tasks: readonly Task[]; jobs: number; inherit_env: false; fail_fast: boolean; cache_dir?: string }>;
export type TaskResult = Readonly<{ id: string; status: string; exit_code: number | null; stdout: string; stderr: string; error: string | null; outputs?: Readonly<Record<string,string>>; artifacts?: Readonly<Record<string,{path:string;size:number;sha256:string}>>; attempts?: readonly {number:number;status:string;exit_code:number|null;duration_ms:number;error:string|null}[]; allowed_failure?: boolean; condition_skipped?: boolean; signal?: number | null; file_result?: unknown }>;
export type RunResult = Readonly<{ outcome: "succeeded" | "failed" | "cancelled"; tasks: readonly TaskResult[] }>;
const component = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase());
export const named = <A>(name: string, value: A): Case<A> => Object.freeze({ key: component(name), value });
export const axis = (name: string, values: readonly string[]): readonly Case<string>[] => Object.freeze(values.map(value => Object.freeze({ key: `${component(name)}=${component(value)}`, value })));
export function product<A, B>(left: readonly Case<A>[], right: readonly Case<B>[]): readonly Case<readonly [A, B]>[] {
  if (left.length * right.length > 4096) throw Error("matrix expansion exceeds 4096 cases");
  return Object.freeze(left.flatMap(a => right.map(b => Object.freeze({ key: `${a.key},${b.key}`, value: Object.freeze([a.value, b.value]) as readonly [A, B] }))));
}
export const include = <A>(cases: readonly Case<A>[], extra: readonly Case<A>[]): readonly Case<A>[] => Object.freeze([...cases, ...extra]);
export const exclude = <A>(cases: readonly Case<A>[], predicate: (value: A) => boolean): readonly Case<A>[] => Object.freeze(cases.filter(item => !predicate(item.value)));
export const task = (id: string, program: string, args: readonly string[], cwd = "."): Task => Object.freeze({ id, program, args: Object.freeze([...args]), cwd, env: Object.freeze({}), needs: Object.freeze([]) });
export function matrix<A>(name: string, cases: readonly Case<A>[], build: (value: A) => Task): readonly Task[] {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(name)) throw Error("invalid matrix name");
  if (cases.length > 4096) throw Error("matrix expansion exceeds 4096 cases");
  const keys = new Set<string>();
  for (const item of cases) {
    if (!item.key || item.key.includes("\0") || keys.has(item.key)) throw Error("matrix cases require unique, nonempty keys without NUL");
    keys.add(item.key);
  }
  return Object.freeze(cases.map(item => Object.freeze({ ...build(item.value), id: `${name}[${item.key}]` })));
}
export const after = (parents: readonly Task[], value: Task): Task => Object.freeze({ ...value, needs: Object.freeze([...new Set([...value.needs, ...parents.map(parent => parent.id)])]) });
export const parallel = (tasks: readonly Task[], jobs: number): Plan => Object.freeze({ version: 1, inherit_env: false, tasks: Object.freeze([...tasks]), jobs, fail_fast: true });
export function validate(plan: Plan): Plan {
  if (!Number.isInteger(plan.jobs) || plan.jobs < 1) throw Error("jobs must be positive");
  if (new Set(plan.tasks.map(task => task.id)).size !== plan.tasks.length) throw Error("duplicate task IDs");
  return plan;
}
export function compile(plan: Plan): string { return JSON.stringify(validate(plan)); }
interface GuestMemory { offset: bigint; readString(): string }
declare const Host: { getFunctions(): { execute_plan?: (ptr: bigint) => bigint } };
declare const Memory: { fromString(value: string): GuestMemory; find(ptr: bigint): GuestMemory };
export function run(plan: Plan, runDir: string): RunResult {
  const fn = Host.getFunctions().execute_plan;
  if (!fn) throw Error("This engine does not expose execute_plan; upgrade the engine");
  const request = JSON.stringify({ plan: validate(plan), run_dir: runDir });
  const report = JSON.parse(Memory.find(fn(Memory.fromString(request).offset)).readString());
  if (!["succeeded", "failed", "cancelled"].includes(report?.outcome) || !Array.isArray(report.tasks)) throw Error("invalid terminal plan report");
  return report as RunResult;
}

/** Task-first policy helpers are immutable; commands remain literal argv. */
export type Condition = "success" | "failure" | "always" | "never";
export type Retry = Readonly<{ max_attempts: number; delay_ms: number; max_delay_ms: number; exit_codes: readonly number[] }>;
export type Probe = Readonly<{ program: string; args: readonly string[]; interval_ms: number; timeout_ms: number }>;
export type Service = Readonly<{ readiness: Probe; startup_timeout_ms: number; shutdown_timeout_ms: number; failure_threshold: number }>;
export type Policy = Readonly<{ when?: Condition; retry?: Retry; allow_failure?: boolean;
  outputs?: Readonly<Record<string, string>>; artifacts?: Readonly<Record<string, string>>;
  bindings?: Readonly<Record<string, Readonly<{ task: string; name: string }>>> }>;
const policy = (value: Task, update: Policy): Task => Object.freeze({ ...value, policy: Object.freeze({ ...value.policy, ...update }) });
export const retry = (value: Task, attempts = 3, delayMs = 250): Task => policy(value, { retry: Object.freeze({ max_attempts: attempts, delay_ms: delayMs, max_delay_ms: 60000, exit_codes: Object.freeze([]) }) });
export const when = (value: Task, condition: Condition): Task => {
  const task = policy(value, { when: condition });
  return condition === "always" || condition === "failure"
    ? Object.freeze({ ...task, timeout_ms: task.timeout_ms ?? 30000, resource_wait_timeout_ms: task.resource_wait_timeout_ms ?? 30000 }) : task;
};
export const always = (value: Task): Task => when(value, "always");
export const allowFailure = (value: Task, enabled = true): Task => policy(value, { allow_failure: enabled });
export const artifact = (value: Task, name: string, path: string): Task => policy(value, { artifacts: Object.freeze({ ...value.policy?.artifacts, [name]: path }) });
export const output = (value: Task, name: string, path: string): Task => policy(value, { outputs: Object.freeze({ ...value.policy?.outputs, [name]: path }) });
export const outputEnv = (value: Task, key: string, producer: Task, name: string): Task => policy(after([producer], value), { bindings: Object.freeze({ ...value.policy?.bindings, [key]: Object.freeze({ task: producer.id, name }) }) });
export const resource = (value: Task, name: string): Task => Object.freeze({ ...value, resources: Object.freeze([...new Set([...(value.resources ?? []), name])]) });
export const service = (value: Task, readiness: Probe): Task => Object.freeze({ ...value, service: Object.freeze({ readiness: Object.freeze({ ...readiness, args: Object.freeze([...readiness.args]) }), startup_timeout_ms: 30000, shutdown_timeout_ms: 5000, failure_threshold: 3 }) });
