# Upstream protocol definitions

These unmodified protocol definitions were retrieved on 2026-11-17 from:

- `build/bazel/`: <https://github.com/bazelbuild/remote-apis/tree/main/build/bazel>
- `google/`: <https://github.com/googleapis/googleapis/tree/master/google>

Each file retains its upstream copyright and Apache 2.0 license notice.
`LICENSE` contains the Apache 2.0 license. Google well-known Protobuf types
come from the installed Protocol Buffers compiler rather than this directory.

`cache/build.rs` generates Rust bindings using `tonic-prost-build`. Only
cache services are exposed by the server; vendoring the complete Remote
Execution protocol does not enable remote execution.
