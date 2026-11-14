import ci/common as c
import ci/native
import gleam/bit_array
import gleam/int
import gleam/list
import gleam/result

pub fn unsigned(value: Int) -> BitArray {
  case value > 127 {
    True -> <<
      int.bitwise_or(int.bitwise_and(value, 127), 128):8,
      unsigned(int.bitwise_shift_right(value, 7)):bytes,
    >>
    False -> <<value:8>>
  }
}

pub fn signed(value: Int) -> BitArray {
  let byte = int.bitwise_and(value, 127)
  let remaining = int.bitwise_shift_right(value, 7)
  let done =
    remaining == 0
    && int.bitwise_and(byte, 64) == 0
    || remaining == -1
    && int.bitwise_and(byte, 64) != 0
  case done {
    True -> <<byte:8>>
    False -> <<int.bitwise_or(byte, 128):8, signed(remaining):bytes>>
  }
}

fn name(value: String) -> BitArray {
  let bits = bit_array.from_string(value)
  <<unsigned(bit_array.byte_size(bits)):bytes, bits:bytes>>
}

fn section(kind: Int, bits: BitArray) -> BitArray {
  <<kind:8, unsigned(bit_array.byte_size(bits)):bytes, bits:bytes>>
}

pub fn trap(export: String, memory: Bool, code: BitArray) -> BitArray {
  let header = <<0, 97, 115, 109, 1, 0, 0, 0>>
  let memory_section = case memory {
    True -> section(5, <<1, 0, 1>>)
    False -> <<>>
  }
  let body = <<0, code:bytes, 11>>
  <<
    header:bytes,
    section(1, <<1, 96, 0, 1, 127>>):bytes,
    section(3, <<1, 0>>):bytes,
    memory_section:bytes,
    section(7, <<1, name(export):bytes, 0, 0>>):bytes,
    section(10, <<1, unsigned(bit_array.byte_size(body)):bytes, body:bytes>>):bytes,
  >>
}

pub fn host_import() -> BitArray {
  let types = <<
    4,
    96,
    1,
    126,
    1,
    126,
    96,
    2,
    126,
    127,
    0,
    96,
    2,
    126,
    126,
    0,
    96,
    0,
    1,
    127,
  >>
  let imports = [
    #("extism:host/env", "alloc", 0),
    #("extism:host/env", "store_u8", 1),
    #("extism:host/user", "get_env", 0),
    #("extism:host/env", "length", 0),
    #("extism:host/env", "output_set", 2),
  ]
  let import_data =
    list.map(imports, fn(item) {
      <<name(item.0):bytes, name(item.1):bytes, 0, unsigned(item.2):bytes>>
    })
    |> bit_array.concat
  let key = bit_array.from_string("FLUENTCI_BSD_SMOKE")
  let first = <<
    1,
    2,
    126,
    66,
    signed(bit_array.byte_size(key)):bytes,
    16,
    0,
    33,
    0,
  >>
  let bytes = bytes(key)
  let code =
    list.index_map(bytes, fn(byte, index) {
      <<32, 0, 66, signed(index):bytes, 124, 65, signed(byte):bytes, 16, 1>>
    })
    |> bit_array.concat
  let body = <<
    first:bytes,
    code:bytes,
    32,
    0,
    16,
    2,
    34,
    1,
    32,
    1,
    16,
    3,
    16,
    4,
    65,
    0,
    11,
  >>
  <<
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    section(1, types):bytes,
    section(2, <<5, import_data:bytes>>):bytes,
    section(3, <<1, 3>>):bytes,
    section(7, <<1, name("env_roundtrip"):bytes, 0, 5>>):bytes,
    section(10, <<1, unsigned(bit_array.byte_size(body)):bytes, body:bytes>>):bytes,
  >>
}

pub fn create(directory: String) -> Result(Nil, String) {
  use _ <- result.try(native.mkdir(directory))
  c.all(
    [
      #("unreachable", trap("unreachable", False, <<0>>)),
      #(
        "memory_oob",
        trap("memory_oob", True, <<63, 0, 65, 16, 116, 40, 2, 0>>),
      ),
      #("host_import", host_import()),
    ],
    fn(item) { native.write(directory <> "/" <> item.0 <> ".wasm", item.1) },
  )
}

fn bytes(data: BitArray) -> List(Int) {
  case data {
    <<byte, rest:bytes>> -> [byte, ..bytes(rest)]
    _ -> []
  }
}
