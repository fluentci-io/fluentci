//// Thin OTP bindings. Validation and release policy live in Gleam modules.

@external(erlang, "ci_native", "arguments")
pub fn arguments() -> List(String)

@external(erlang, "ci_native", "env")
pub fn env(name: String) -> String

@external(erlang, "ci_native", "set_env")
pub fn set_env(name: String, value: String) -> Nil

@external(erlang, "ci_native", "unset_env")
pub fn unset_env(name: String) -> Nil

@external(erlang, "ci_native", "cwd")
pub fn cwd() -> String

@external(erlang, "ci_native", "absolute")
pub fn absolute(path: String) -> String

@external(erlang, "ci_native", "platform")
pub fn platform() -> String

@external(erlang, "ci_native", "read")
pub fn read(path: String) -> Result(BitArray, String)

@external(erlang, "ci_native", "write")
pub fn write(path: String, data: BitArray) -> Result(Nil, String)

@external(erlang, "ci_native", "append")
pub fn append(path: String, data: String) -> Result(Nil, String)

@external(erlang, "ci_native", "mkdir")
pub fn mkdir(path: String) -> Result(Nil, String)

@external(erlang, "ci_native", "remove")
pub fn remove(path: String) -> Result(Nil, String)

@external(erlang, "ci_native", "rename")
pub fn rename(source: String, destination: String) -> Result(Nil, String)

@external(erlang, "ci_native", "copy")
pub fn copy(source: String, destination: String) -> Result(Nil, String)

@external(erlang, "ci_native", "regular")
pub fn regular(path: String) -> Bool

@external(erlang, "ci_native", "size")
pub fn size(path: String) -> Int

@external(erlang, "ci_native", "chmod")
pub fn chmod(path: String, mode: Int) -> Result(Nil, String)

@external(erlang, "ci_native", "temp")
pub fn temp(prefix: String) -> Result(String, String)

@external(erlang, "ci_native", "nonce")
pub fn nonce() -> String

@external(erlang, "ci_native", "sha256")
pub fn sha256(data: BitArray) -> String

@external(erlang, "ci_native", "read_line")
pub fn read_line() -> Result(String, Nil)

@external(erlang, "ci_native", "stderr")
pub fn stderr(text: String) -> Nil

@external(erlang, "ci_native", "stdout")
pub fn stdout(text: String) -> Nil

@external(erlang, "ci_native", "halt")
pub fn halt(code: Int) -> Nil

@external(erlang, "ci_native", "execute")
pub fn execute(
  program: String,
  args: List(String),
  directory: String,
  stream: Bool,
  merge_stderr: Bool,
) -> #(Int, String)

@external(erlang, "ci_native", "archive_entries")
pub fn archive_entries(
  path: String,
) -> Result(List(#(String, String, Int, Int)), String)

@external(erlang, "ci_native", "archive_member")
pub fn archive_member(path: String, name: String) -> Result(BitArray, String)

@external(erlang, "ci_native", "create_archive")
pub fn create_archive(
  path: String,
  files: List(#(String, BitArray, Int)),
) -> Result(Nil, String)
