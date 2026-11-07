pub type HelloArgs { HelloArgs(name: String) }

/// Greet someone from a native Wasm component.
pub fn hello(args: HelloArgs) -> String { "Hello, " <> args.name <> "!" }
