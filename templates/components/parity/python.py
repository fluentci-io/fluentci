from fluentci import pipeline, get_env
from fluentci.plan import Plan
from fluentci.remote import digest_text

def parity() -> str:
    directory = get_env("FLUENTCI_COMPONENT_RUN_DIR")
    output = pipeline("component-parity").with_env("FLUENTCI_COMPONENT_PARITY", "capability-parity").exec("/bin/sh", "-c", 'printf "%s" "$FLUENTCI_COMPONENT_PARITY"').stdout()
    report = Plan((digest_text("digest", "sha256", "abc"),)).run(directory + "/typed-plan")
    assert report.succeeded
    return output

from dataclasses import dataclass
@dataclass
class HelloArgs:
    name: str
def hello(args: HelloArgs) -> str:
    return f"Hello, {args.name}!"
