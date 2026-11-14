import ci/common as c
import gleam/bit_array
import gleam/result

fn u16(data: BitArray, offset: Int) -> Result(Int, String) {
  case bit_array.slice(data, offset, 2) {
    Ok(<<value:16-little>>) -> Ok(value)
    _ -> Error("Truncated ELF integer")
  }
}

fn u32(data: BitArray, offset: Int) -> Result(Int, String) {
  case bit_array.slice(data, offset, 4) {
    Ok(<<value:32-little>>) -> Ok(value)
    _ -> Error("Truncated ELF integer")
  }
}

fn u64(data: BitArray, offset: Int) -> Result(Int, String) {
  case bit_array.slice(data, offset, 8) {
    Ok(<<value:64-little>>) -> Ok(value)
    _ -> Error("Truncated ELF integer")
  }
}

pub fn header(data: BitArray, machine: Int) -> Result(Nil, String) {
  use _ <- result.try(c.require(
    bit_array.byte_size(data) >= 64,
    "Truncated ELF header",
  ))
  use _ <- result.try(c.require(
    case data {
      <<127, 69, 76, 70, 2, 1, _:bits>> -> True
      _ -> False
    },
    "Expected little-endian ELF64",
  ))
  use actual <- result.try(u16(data, 18))
  c.require(actual == machine, "ELF architecture does not match release target")
}

fn dynamic(data: BitArray, position: Int, end: Int) -> Result(Nil, String) {
  case position >= end {
    True -> Ok(Nil)
    False -> {
      use tag <- result.try(u64(data, position))
      case tag {
        0 -> Ok(Nil)
        1 -> Error("Musl binary requires a shared library")
        _ -> dynamic(data, position + 16, end)
      }
    }
  }
}

pub fn musl(data: BitArray, target: String) -> Result(Nil, String) {
  use machine <- result.try(case target {
    "x86_64-unknown-linux-musl" -> Ok(62)
    "aarch64-unknown-linux-musl" -> Ok(183)
    _ -> Error("Unsupported musl target")
  })
  use _ <- result.try(header(data, machine))
  use offset <- result.try(u64(data, 32))
  use size <- result.try(u16(data, 54))
  use count <- result.try(u16(data, 56))
  use _ <- result.try(c.require(
    size >= 56
      && count > 0
      && offset + size * count <= bit_array.byte_size(data),
    "Invalid ELF program headers",
  ))
  c.all(c.indices(count), fn(index) {
    let position = offset + size * index
    use kind <- result.try(u32(data, position))
    use start <- result.try(u64(data, position + 8))
    use length <- result.try(u64(data, position + 32))
    use _ <- result.try(c.require(
      start + length <= bit_array.byte_size(data),
      "Truncated ELF segment",
    ))
    use _ <- result.try(c.require(
      kind != 3,
      "Musl binary requires a dynamic interpreter",
    ))
    case kind {
      2 -> {
        use _ <- result.try(c.require(
          length % 16 == 0,
          "Invalid ELF dynamic segment",
        ))
        dynamic(data, start, start + length)
      }
      _ -> Ok(Nil)
    }
  })
}
