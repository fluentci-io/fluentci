import extism


@extism.plugin_fn
def hello() -> None:
    extism.output_str("Hello from FluentCI")
