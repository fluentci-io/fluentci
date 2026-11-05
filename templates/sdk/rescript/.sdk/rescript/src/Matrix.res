/** Native-plan matrices. Values stay pure until run is called inside Wasm. */
type matrixCase<'a>
type task
type plan
type taskResult = {id: string, status: string, stdout: string, stderr: string}
type runResult = {outcome: string, tasks: array<taskResult>}

@module("./matrix_ffi.mjs") external named: (string, 'a) => matrixCase<'a> = "named"
@module("./matrix_ffi.mjs") external axis: (string, array<string>) => array<matrixCase<string>> = "axis"
@module("./matrix_ffi.mjs") external includeCases: (array<matrixCase<'a>>, array<matrixCase<'a>>) => array<matrixCase<'a>> = "include"
@module("./matrix_ffi.mjs") external exclude: (array<matrixCase<'a>>, 'a => bool) => array<matrixCase<'a>> = "exclude"
@module("./matrix_ffi.mjs") external task: (string, string, array<string>, string) => task = "task"
@module("./matrix_ffi.mjs") external withEnv: (task, string, string) => task = "withEnv"
@module("./matrix_ffi.mjs") external cached: (task, array<string>, array<string>, string) => task = "cached"
@module("./matrix_ffi.mjs") external afterJobs: (task, array<task>) => task = "after"
@module("./matrix_ffi.mjs") external parallel: (array<task>, int) => plan = "parallel"
@module("./matrix_ffi.mjs") external withCacheDirectory: (plan, string) => plan = "withCacheDirectory"
@module("./matrix_ffi.mjs") external withFailFast: (plan, bool) => plan = "withFailFast"
@module("./matrix_ffi.mjs") external compile: plan => string = "compile"
@module("./matrix_ffi.mjs") external productImpl: (array<matrixCase<'a>>, array<matrixCase<'b>>, array<matrixCase<('a, 'b)>> => result<array<matrixCase<('a, 'b)>>, string>, string => result<array<matrixCase<('a, 'b)>>, string>) => result<array<matrixCase<('a, 'b)>>, string> = "product"
@module("./matrix_ffi.mjs") external matrixImpl: (string, array<matrixCase<'a>>, 'a => task, array<task> => result<array<task>, string>, string => result<array<task>, string>) => result<array<task>, string> = "matrix"
@module("./matrix_ffi.mjs") external runImpl: (plan, string, runResult => result<runResult, string>, string => result<runResult, string>) => result<runResult, string> = "run"

let product = (left, right) => productImpl(left, right, value => Ok(value), error => Error(error))
let matrix = (name, cases, build) => matrixImpl(name, cases, build, value => Ok(value), error => Error(error))
let run = (plan, directory) => runImpl(plan, directory, value => Ok(value), error => Error(error))

/** Conditions are wire-compatible with every SDK's native plan. */
type condition = Success | Failure | Always | Never
@module("./matrix_ffi.mjs") external retry: (task, int, int) => task = "retry"
@module("./matrix_ffi.mjs") external whenImpl: (task, string) => task = "whenTask"
@module("./matrix_ffi.mjs") external always: task => task = "always"
@module("./matrix_ffi.mjs") external allowFailure: (task, bool) => task = "allowFailure"
@module("./matrix_ffi.mjs") external artifact: (task, string, string) => task = "artifact"
@module("./matrix_ffi.mjs") external output: (task, string, string) => task = "output"
@module("./matrix_ffi.mjs") external outputEnv: (task, string, task, string) => task = "outputEnv"
@module("./matrix_ffi.mjs") external resource: (task, string) => task = "resource"
@module("./matrix_ffi.mjs") external service: (task, string, array<string>, int, int) => task = "service"
let whenTask = (value, condition) => whenImpl(value, switch condition {
  | Success => "success" | Failure => "failure" | Always => "always" | Never => "never"
})

type artifactResult = {path: string, size: float, sha256: string}
@module("./matrix_ffi.mjs") external resultOutputImpl: (runResult, string, string, string => result<string, string>, string => result<string, string>) => result<string, string> = "resultOutput"
@module("./matrix_ffi.mjs") external resultArtifactImpl: (runResult, string, string, artifactResult => result<artifactResult, string>, string => result<artifactResult, string>) => result<artifactResult, string> = "resultArtifact"
let resultOutput = (report, id, name) => resultOutputImpl(report, id, name, value => Ok(value), error => Error(error))
let resultArtifact = (report, id, name) => resultArtifactImpl(report, id, name, value => Ok(value), error => Error(error))

type attempt = {number: int, status: string, exit_code: Nullable.t<int>, duration_ms: float, error: Nullable.t<string>}
@module("./matrix_ffi.mjs") external resultAttemptsImpl: (runResult, string, array<attempt> => result<array<attempt>, string>, string => result<array<attempt>, string>) => result<array<attempt>, string> = "resultAttempts"
let resultAttempts = (report, id) => resultAttemptsImpl(report, id, value => Ok(value), error => Error(error))
