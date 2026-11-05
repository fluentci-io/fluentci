import fluentci/plugin

pub fn hello() -> Result(String, String) {
  plugin.pipeline("hello")
  |> plugin.exec("echo", ["Hello from FluentCI"])
  |> plugin.stdout
}
