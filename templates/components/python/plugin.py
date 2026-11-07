from dataclasses import dataclass

@dataclass
class HelloArgs:
    name: str
    """Name to greet."""

def hello(args: HelloArgs) -> str:
    """Greet someone from a native Wasm component."""
    return f"Hello, {args.name}!"
