//// Generated from pkl/defs by scripts/lexicons.mjs. DO NOT EDIT.

import gleam/json

import gleam/list

import gleam/option.{type Option, None, Some}

pub const plugin = "io.fluentci.plugin"

pub const registry_defs = "io.fluentci.registry.defs"

pub const registry_get_package = "io.fluentci.registry.getPackage"

pub const registry_list_packages = "io.fluentci.registry.listPackages"

pub const registry_publish = "io.fluentci.registry.publish"

pub const registry_search_packages = "io.fluentci.registry.searchPackages"

pub type Plugin {
  Plugin(
    name: String,
    description: String,
    version: String,
    published_at: String,
    author: String,
    license: String,
    url: String,
    sha256: String,
    size: Int,
  )
}

pub fn encode_plugin(value: Plugin) -> json.Json {
  let fields = [
    #("name", json.string(value.name)),
    #("description", json.string(value.description)),
    #("version", json.string(value.version)),
    #("publishedAt", json.string(value.published_at)),
    #("author", json.string(value.author)),
    #("license", json.string(value.license)),
    #("url", json.string(value.url)),
    #("sha256", json.string(value.sha256)),
    #("size", json.int(value.size)),
  ]

  json.object(fields)
}

pub type RegistryPackageView {
  RegistryPackageView(
    name: String,
    description: String,
    version: String,
    published_at: String,
    author: String,
    license: String,
    url: String,
    sha256: String,
    size: Int,
    uri: String,
    cid: String,
  )
}

pub fn encode_registry_package_view(value: RegistryPackageView) -> json.Json {
  let fields = [
    #("name", json.string(value.name)),
    #("description", json.string(value.description)),
    #("version", json.string(value.version)),
    #("publishedAt", json.string(value.published_at)),
    #("author", json.string(value.author)),
    #("license", json.string(value.license)),
    #("url", json.string(value.url)),
    #("sha256", json.string(value.sha256)),
    #("size", json.int(value.size)),
    #("uri", json.string(value.uri)),
    #("cid", json.string(value.cid)),
  ]

  json.object(fields)
}

pub type RegistryGetPackageParameters {
  RegistryGetPackageParameters(
    name: String,
    version: Option(String),
    author: Option(String),
  )
}

pub fn encode_registry_get_package_parameters(
  value: RegistryGetPackageParameters,
) -> json.Json {
  let fields = [#("name", json.string(value.name))]
  let fields =
    list.append(fields, case value.version {
      None -> []
      Some(item) -> [#("version", json.string(item))]
    })
  let fields =
    list.append(fields, case value.author {
      None -> []
      Some(item) -> [#("author", json.string(item))]
    })
  json.object(fields)
}

pub type RegistryGetPackageOutput {
  RegistryGetPackageOutput(package: RegistryPackageView)
}

pub fn encode_registry_get_package_output(
  value: RegistryGetPackageOutput,
) -> json.Json {
  let fields = [#("package", encode_registry_package_view(value.package))]

  json.object(fields)
}

pub type RegistryListPackagesParameters {
  RegistryListPackagesParameters(
    limit: Option(Int),
    cursor: Option(String),
    author: Option(String),
  )
}

pub fn encode_registry_list_packages_parameters(
  value: RegistryListPackagesParameters,
) -> json.Json {
  let fields = []
  let fields =
    list.append(fields, case value.limit {
      None -> []
      Some(item) -> [#("limit", json.int(item))]
    })
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  let fields =
    list.append(fields, case value.author {
      None -> []
      Some(item) -> [#("author", json.string(item))]
    })
  json.object(fields)
}

pub type RegistryListPackagesOutput {
  RegistryListPackagesOutput(
    packages: List(RegistryPackageView),
    cursor: Option(String),
  )
}

pub fn encode_registry_list_packages_output(
  value: RegistryListPackagesOutput,
) -> json.Json {
  let fields = [
    #(
      "packages",
      json.array(value.packages, fn(item) { encode_registry_package_view(item) }),
    ),
  ]
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}

pub type RegistryPublishParameters {
  RegistryPublishParameters(name: Option(String), version: Option(String))
}

pub fn encode_registry_publish_parameters(
  value: RegistryPublishParameters,
) -> json.Json {
  let fields = []
  let fields =
    list.append(fields, case value.name {
      None -> []
      Some(item) -> [#("name", json.string(item))]
    })
  let fields =
    list.append(fields, case value.version {
      None -> []
      Some(item) -> [#("version", json.string(item))]
    })
  json.object(fields)
}

pub type RegistryPublishOutput {
  RegistryPublishOutput(url: String, sha256: String, size: Int)
}

pub fn encode_registry_publish_output(
  value: RegistryPublishOutput,
) -> json.Json {
  let fields = [
    #("url", json.string(value.url)),
    #("sha256", json.string(value.sha256)),
    #("size", json.int(value.size)),
  ]

  json.object(fields)
}

pub type RegistrySearchPackagesParameters {
  RegistrySearchPackagesParameters(
    limit: Option(Int),
    cursor: Option(String),
    author: Option(String),
    q: String,
  )
}

pub fn encode_registry_search_packages_parameters(
  value: RegistrySearchPackagesParameters,
) -> json.Json {
  let fields = [#("q", json.string(value.q))]
  let fields =
    list.append(fields, case value.limit {
      None -> []
      Some(item) -> [#("limit", json.int(item))]
    })
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  let fields =
    list.append(fields, case value.author {
      None -> []
      Some(item) -> [#("author", json.string(item))]
    })
  json.object(fields)
}

pub type RegistrySearchPackagesOutput {
  RegistrySearchPackagesOutput(
    packages: List(RegistryPackageView),
    cursor: Option(String),
  )
}

pub fn encode_registry_search_packages_output(
  value: RegistrySearchPackagesOutput,
) -> json.Json {
  let fields = [
    #(
      "packages",
      json.array(value.packages, fn(item) { encode_registry_package_view(item) }),
    ),
  ]
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}
