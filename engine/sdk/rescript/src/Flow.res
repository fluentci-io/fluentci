/** Typed, deferred component/native pipelines. Only run performs effects. */
type t<'output>
@module("fluentci:pipeline") external pipeline: string => t<unit> = "pipeline"
@module("fluentci:pipeline") external workdir: (t<'a>, string) => t<'a> = "workdir"
@module("fluentci:pipeline") external env: (t<'a>, string, string) => t<'a> = "env"
@module("fluentci:pipeline") external exec: (t<'a>, array<string>) => t<string> = "exec"
@module("fluentci:pipeline") external map: (t<'a>, 'a => 'b) => t<'b> = "map"
@module("fluentci:pipeline") external ensuring: (t<'a>, unit => unit) => t<'a> = "ensuring"
@module("fluentci:pipeline") external run: t<'a> => 'a = "run"
