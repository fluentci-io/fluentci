/** Immutable values for FluentCI Wasm guests. Terminal functions invoke the PDK. */
type t

@module("./guest_ffi.mjs") external pipeline: string => t = "pipeline"
@module("./guest_ffi.mjs") external exec: (t, array<string>) => t = "exec"
@module("./guest_ffi.mjs") external shell: (t, string) => t = "shell"
@module("./guest_ffi.mjs") external workdir: (t, string) => t = "workdir"
@module("./guest_ffi.mjs") external env: (t, string, string) => t = "env"
@module("./guest_ffi.mjs") external run: (t, bool, string => result<string, string>, string => result<string, string>) => result<string, string> = "run"

let stdout = value => run(value, false, value => Ok(value), error => Error(error))
let stderr = value => run(value, true, value => Ok(value), error => Error(error))
