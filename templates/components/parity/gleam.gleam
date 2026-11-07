import fluentci/plugin as p
pub fn parity() -> Result(String, String) {
  p.pipeline("component-parity") |> p.exec("printf", ["capability-parity"]) |> p.stdout
}

pub type HelloArgs { HelloArgs(name: String) }
pub fn hello(args: HelloArgs) -> String { "Hello, " <> args.name <> "!" }
