@val @scope("Host") external output: string => unit = "outputString"

let hello = () => {
  switch Guest.pipeline("hello")->Guest.exec(["echo", "Hello from FluentCI"])->Guest.stdout {
  | Ok(value) => output(value)
  | Error(message) => JsError.throwWithMessage(message)
  }
}
