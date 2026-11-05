---
title: "Host and transfer primitives"
description: "Compose host facts, digests, SSH, file transfers, and S3 operations in native task graphs."
section: "Build pipelines"
url: "/guides/primitives/"
source: "guides/primitives.md"
---

## Compose operations as tasks

Primitive constructors describe work. They do not connect to servers, install
tools, or read files until their native plan executes. Combine these tasks with
ordinary commands, dependencies, timeouts, environment bindings, and resources.
Use a matching engine and SDK; these bindings are included in the bundled SDK
sources and may precede the next published SDK release.

| Operation    | Result or behavior                                                                   |
| ------------ | ------------------------------------------------------------------------------------ |
| OS           | Rust host OS identifier, such as `macos`, `linux`, `freebsd`, `netbsd`, or `openbsd` |
| Architecture | Rust host architecture identifier, such as `aarch64` or `x86_64`                     |
| Digest       | Streaming SHA-256 or SHA-512 of UTF-8 text or a file                                 |
| SSH          | Run an argument vector on a remote host through its POSIX shell                      |
| SCP / SFTP   | Upload or download files                                                             |
| rsync        | Synchronize a source and destination over SSH                                        |
| FTP / FTPS   | Get, put, list, or delete; FTPS requires TLS                                         |
| S3           | Get, put, list, or delete through AWS CLI, including compatible endpoints            |

OS, architecture, and digest tasks write a newline-terminated value to stdout
and expose the trimmed result as the named output `value`. Use the SDK's output
environment binding to pass it to a dependent command. File paths resolve from
the task's working directory. OS and architecture describe the executor host;
they are not cross-compilation target selectors.

## SDK entry points

All eight SDKs expose the same operation kinds. Use their native enums or unions
for algorithms, actions, and transfer directions.

| SDK           | Module                                                       | Digest constructor            |
| ------------- | ------------------------------------------------------------ | ----------------------------- |
| ClojureScript | `fluentci.remote`                                            | `digest-text` / `digest-file` |
| PureScript    | `FluentCI.Host.Remote`                                       | `digestText` / `digestFile`   |
| TypeScript    | `src/remote.ts`                                              | `digestText` / `digestFile`   |
| Python        | `fluentci.remote`                                            | `digest_text` / `digest_file` |
| Gleam         | `fluentci/host/remote`                                       | `digest_text` / `digest_file` |
| Elixir        | `FluentCI.Remote`                                            | `digest_text` / `digest_file` |
| ReScript      | `Remote`                                                     | `digestText` / `digestFile`   |
| Rust          | `fluentci_pdk::remote` or native `fluentci_executor::remote` | `Operation::Digest`           |

For example, describe a digest in each SDK:

```clojurescript
(require '[fluentci.remote :as remote])
(remote/digest-text "checksum" :sha256 "hello" ".")
```

```purescript
import FluentCI.Host.Remote as Remote

checksum = Remote.digestText "checksum" Remote.Sha256 "hello" "."
```

```typescript
import { digestText } from "./.sdk/typescript/src/remote.ts";

const checksum = digestText("checksum", "sha256", "hello");
```

```python
from fluentci.remote import digest_text

checksum = digest_text("checksum", "sha256", "hello")
```

```gleam
import fluentci/host/remote

pub fn checksum() {
  remote.digest_text("checksum", remote.Sha256, "hello", ".")
}
```

```elixir
checksum = FluentCI.Remote.digest_text("checksum", :sha256, "hello")
```

```rescript
let checksum = Remote.digestText("checksum", Remote.Sha256, "hello", ".")
```

```rust
use fluentci_pdk::remote::{self, Algorithm, Input, Operation};

let checksum = remote::task(
    "checksum",
    Operation::Digest {
        algorithm: Algorithm::Sha256,
        input: Input::Text("hello".into()),
    },
    ".",
);
```

Add the resulting task to a [native plan](/guides/native-plans/). Rust's PDK
serializes typed requests at the Wasm host boundary; the native executor can
compile and execute its Rust plan directly.

## SSH and transfers

SSH connections specify `host`, optional `user` and `identity`, a port (default
22), and `install` (default true). SSH uses batch authentication and normal host
key verification. Provision a key or agent and trusted host keys before the
task runs. Password prompts are disabled.

```typescript
import { ssh, scp } from "./.sdk/typescript/src/remote.ts";
import { after } from "./.sdk/typescript/src/matrix.ts";

const connection = {
  host: "deploy.example.com",
  user: "deploy",
  port: 22,
  install: false,
};
const upload = scp(
  "upload",
  connection,
  "upload",
  "dist/app.tar.gz",
  "/srv/app.tar.gz",
);
const inspect = after(
  [upload],
  ssh("inspect", connection, ["ls", "-lh", "/srv/app.tar.gz"]),
);
```

Commands are argument vectors. The executor quotes each SSH argument for the
remote POSIX shell. Remote execution still requires the named program on the
server. Local provisioning installs client tools only.

FTP and FTPS accept `username_env` and `password_env`: names of variables in
the task environment. Credentials are supplied through a private temporary
curl configuration and removed after execution. Do not embed credentials in
URLs. S3 uses the AWS CLI credential chain from the task environment, with
optional `endpoint` and `region` fields for services such as R2 or MinIO.

## Tool provisioning

Digest and host detection need no external tools. Network primitives use
OpenSSH, curl, rsync, or AWS CLI. rsync must support `--protect-args` (rsync 3+);
older bundled clients are skipped so a suitable client can be provisioned.
The executor first searches PATH and standard
system/package-manager locations. When missing and `install` is true, it uses
an available host package manager:

| Platform | Package managers                          |
| -------- | ----------------------------------------- |
| macOS    | Homebrew or MacPorts                      |
| Linux    | apt-get, dnf, yum, apk, pacman, or zypper |
| FreeBSD  | pkg                                       |
| NetBSD   | pkgin                                     |
| OpenBSD  | pkg_add                                   |

Installation needs package repository access and appropriate permissions.
Non-root hosts use noninteractive sudo; unavailable managers or permissions
produce an error. Set `install: false` for preprovisioned or locked CI images.
Package availability depends on the OS repository. These POSIX backends do not
imply that every BSD release has been tested.

## Cache and lifecycle

Remote operations are side effects and cannot use the local action cache.
Host facts and digests may be cached with an explicit cache policy. For a file
digest, declare a safe relative path covered by the cache inputs. This lets
changes to the source invalidate the action. Use dependencies and exclusive
resources to order writes to a shared destination.

Native operations participate in task cancellation and timeouts. Cancelling a
transfer stops its client process group; it does not roll back remote changes
already accepted by the server. See [caching](/guides/caching/) and
[services](/guides/services/) for related lifecycle contracts.
