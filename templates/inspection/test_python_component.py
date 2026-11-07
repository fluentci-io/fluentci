import sys
from pathlib import Path
import unittest
sys.path.insert(0, str(Path(__file__).parent))
from python_component import inspect_component

SOURCE = '''from dataclasses import dataclass
from typing import Optional
@dataclass
class Args:
    src: str
    """Source directory."""
    jobs: Optional[int] = None

def build(args: Args) -> str:
    """Build source files."""
    return args.src
'''

class Components(unittest.TestCase):
    def test_source_types_and_docs_generate_wit(self):
        wit, wrapper, metadata = inspect_component(SOURCE)
        self.assertIn("jobs: option<s64>", wit)
        self.assertIn("/// Source directory.", wit)
        self.assertIn("-> string", wit)
        self.assertNotIn("extism", wrapper)
        self.assertFalse(metadata[0]["args"][1]["required"])
        updated = inspect_component(SOURCE.replace("Optional[int]", "Optional[bool]"))[0]
        self.assertIn("jobs: option<bool>", updated)

    def test_inspection_does_not_evaluate_user_code(self):
        inspect_component("raise RuntimeError('do not execute')\n" + SOURCE)

    def test_untyped_and_async_exports_fail(self):
        with self.assertRaises(ValueError):
            inspect_component("def build(args): return args")
        with self.assertRaises(ValueError):
            inspect_component("async def build() -> str: return 'x'")

if __name__ == "__main__":
    unittest.main()
