from pathlib import Path
import argparse
import sys
sys.path.insert(0, str(Path(__file__).parent / ".sdk/inspection"))
from python_component import build_component

parser = argparse.ArgumentParser(description="Generate WIT and compile a Python component")
parser.add_argument("--source", type=Path, default=Path("plugin.py"))
parser.add_argument("--output", type=Path, default=Path("dist/plugin.wasm"))
args = parser.parse_args()
build_component(args.source, args.output)
