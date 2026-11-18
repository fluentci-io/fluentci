//// Generated from pkl/defs by scripts/lexicons.mjs. DO NOT EDIT.

import gleam/json

import gleam/list

import gleam/option.{type Option, None, Some}

pub const com_atproto_repo_strong_ref = "com.atproto.repo.strongRef"

pub const cache_clear_cache = "io.fluentci.cache.clearCache"

pub const cache_create_credential = "io.fluentci.cache.createCredential"

pub const cache_create_token = "io.fluentci.cache.createToken"

pub const cache_defs = "io.fluentci.cache.defs"

pub const cache_delete_key = "io.fluentci.cache.deleteKey"

pub const cache_exchange_credential = "io.fluentci.cache.exchangeCredential"

pub const cache_get_usage_history = "io.fluentci.cache.getUsageHistory"

pub const cache_invite_user = "io.fluentci.cache.inviteUser"

pub const cache_list_collaborators = "io.fluentci.cache.listCollaborators"

pub const cache_list_credentials = "io.fluentci.cache.listCredentials"

pub const cache_list_keys = "io.fluentci.cache.listKeys"

pub const cache_list_tokens = "io.fluentci.cache.listTokens"

pub const cache_resolve_account = "io.fluentci.cache.resolveAccount"

pub const cache_revoke_credential = "io.fluentci.cache.revokeCredential"

pub const cache_revoke_token = "io.fluentci.cache.revokeToken"

pub const cache_revoke_user = "io.fluentci.cache.revokeUser"

pub const like = "io.fluentci.like"

pub const plugin = "io.fluentci.plugin"

pub const registry_defs = "io.fluentci.registry.defs"

pub const registry_get_actor_likes = "io.fluentci.registry.getActorLikes"

pub const registry_get_actor_packages = "io.fluentci.registry.getActorPackages"

pub const registry_get_package = "io.fluentci.registry.getPackage"

pub const registry_list_packages = "io.fluentci.registry.listPackages"

pub const registry_publish = "io.fluentci.registry.publish"

pub const registry_record_download = "io.fluentci.registry.recordDownload"

pub const registry_search_packages = "io.fluentci.registry.searchPackages"

pub type ComAtprotoRepoStrongRef {
  ComAtprotoRepoStrongRef(uri: String, cid: String)
}

pub fn encode_com_atproto_repo_strong_ref(
  value: ComAtprotoRepoStrongRef,
) -> json.Json {
  let fields = [
    #("uri", json.string(value.uri)),
    #("cid", json.string(value.cid)),
  ]

  json.object(fields)
}

pub type CacheClearCacheInput {
  CacheClearCacheInput(confirm: Bool)
}

pub fn encode_cache_clear_cache_input(
  value: CacheClearCacheInput,
) -> json.Json {
  let fields = [#("confirm", json.bool(value.confirm))]

  json.object(fields)
}

pub type CacheClearCacheOutput {
  CacheClearCacheOutput(deleted: Int)
}

pub fn encode_cache_clear_cache_output(
  value: CacheClearCacheOutput,
) -> json.Json {
  let fields = [#("deleted", json.int(value.deleted))]

  json.object(fields)
}

pub type CacheCreateCredentialInput {
  CacheCreateCredentialInput(label: String)
}

pub fn encode_cache_create_credential_input(
  value: CacheCreateCredentialInput,
) -> json.Json {
  let fields = [#("label", json.string(value.label))]

  json.object(fields)
}

pub type CacheCreateCredentialOutput {
  CacheCreateCredentialOutput(
    id: String,
    label: String,
    created_at: String,
    expires_at: String,
    active: Bool,
    credential: String,
    owner: String,
  )
}

pub fn encode_cache_create_credential_output(
  value: CacheCreateCredentialOutput,
) -> json.Json {
  let fields = [
    #("id", json.string(value.id)),
    #("label", json.string(value.label)),
    #("createdAt", json.string(value.created_at)),
    #("expiresAt", json.string(value.expires_at)),
    #("active", json.bool(value.active)),
    #("credential", json.string(value.credential)),
    #("owner", json.string(value.owner)),
  ]

  json.object(fields)
}

pub type CacheCreateTokenInput {
  CacheCreateTokenInput(owner: Option(String))
}

pub fn encode_cache_create_token_input(
  value: CacheCreateTokenInput,
) -> json.Json {
  let fields = []
  let fields =
    list.append(fields, case value.owner {
      None -> []
      Some(item) -> [#("owner", json.string(item))]
    })
  json.object(fields)
}

pub type CacheCreateTokenOutput {
  CacheCreateTokenOutput(
    id: String,
    token: String,
    expires_at: Option(String),
    cache_url: String,
    canonical_cache_url: Option(String),
    owner: String,
  )
}

pub fn encode_cache_create_token_output(
  value: CacheCreateTokenOutput,
) -> json.Json {
  let fields = [
    #("id", json.string(value.id)),
    #("token", json.string(value.token)),
    #("cacheUrl", json.string(value.cache_url)),
    #("owner", json.string(value.owner)),
  ]
  let fields =
    list.append(fields, case value.expires_at {
      None -> []
      Some(item) -> [#("expiresAt", json.string(item))]
    })
  let fields =
    list.append(fields, case value.canonical_cache_url {
      None -> []
      Some(item) -> [#("canonicalCacheUrl", json.string(item))]
    })
  json.object(fields)
}

pub type CacheCredentialView {
  CacheCredentialView(
    id: String,
    label: String,
    created_at: String,
    expires_at: String,
    active: Bool,
  )
}

pub fn encode_cache_credential_view(value: CacheCredentialView) -> json.Json {
  let fields = [
    #("id", json.string(value.id)),
    #("label", json.string(value.label)),
    #("createdAt", json.string(value.created_at)),
    #("expiresAt", json.string(value.expires_at)),
    #("active", json.bool(value.active)),
  ]

  json.object(fields)
}

pub type CacheKeyView {
  CacheKeyView(key: String, size: Int, last_modified: String)
}

pub fn encode_cache_key_view(value: CacheKeyView) -> json.Json {
  let fields = [
    #("key", json.string(value.key)),
    #("size", json.int(value.size)),
    #("lastModified", json.string(value.last_modified)),
  ]

  json.object(fields)
}

pub type CacheUsageSample {
  CacheUsageSample(
    date: String,
    bytes: Int,
    key_count: Int,
    observed_at: String,
  )
}

pub fn encode_cache_usage_sample(value: CacheUsageSample) -> json.Json {
  let fields = [
    #("date", json.string(value.date)),
    #("bytes", json.int(value.bytes)),
    #("keyCount", json.int(value.key_count)),
    #("observedAt", json.string(value.observed_at)),
  ]

  json.object(fields)
}

pub type CacheUploadTokenView {
  CacheUploadTokenView(
    id: String,
    owner: String,
    actor: String,
    created_at: String,
    expires_at: Option(String),
    active: Bool,
  )
}

pub fn encode_cache_upload_token_view(
  value: CacheUploadTokenView,
) -> json.Json {
  let fields = [
    #("id", json.string(value.id)),
    #("owner", json.string(value.owner)),
    #("actor", json.string(value.actor)),
    #("createdAt", json.string(value.created_at)),
    #("active", json.bool(value.active)),
  ]
  let fields =
    list.append(fields, case value.expires_at {
      None -> []
      Some(item) -> [#("expiresAt", json.string(item))]
    })
  json.object(fields)
}

pub type CacheDeleteKeyInput {
  CacheDeleteKeyInput(key: String)
}

pub fn encode_cache_delete_key_input(value: CacheDeleteKeyInput) -> json.Json {
  let fields = [#("key", json.string(value.key))]

  json.object(fields)
}

pub type CacheDeleteKeyOutput {
  CacheDeleteKeyOutput(deleted: Int)
}

pub fn encode_cache_delete_key_output(
  value: CacheDeleteKeyOutput,
) -> json.Json {
  let fields = [#("deleted", json.int(value.deleted))]

  json.object(fields)
}

pub type CacheExchangeCredentialInput {
  CacheExchangeCredentialInput
}

pub fn encode_cache_exchange_credential_input(
  _value: CacheExchangeCredentialInput,
) -> json.Json {
  let fields = []

  json.object(fields)
}

pub type CacheExchangeCredentialOutput {
  CacheExchangeCredentialOutput(
    id: String,
    token: String,
    expires_at: Option(String),
    cache_url: String,
    canonical_cache_url: Option(String),
    owner: String,
  )
}

pub fn encode_cache_exchange_credential_output(
  value: CacheExchangeCredentialOutput,
) -> json.Json {
  let fields = [
    #("id", json.string(value.id)),
    #("token", json.string(value.token)),
    #("cacheUrl", json.string(value.cache_url)),
    #("owner", json.string(value.owner)),
  ]
  let fields =
    list.append(fields, case value.expires_at {
      None -> []
      Some(item) -> [#("expiresAt", json.string(item))]
    })
  let fields =
    list.append(fields, case value.canonical_cache_url {
      None -> []
      Some(item) -> [#("canonicalCacheUrl", json.string(item))]
    })
  json.object(fields)
}

pub type CacheGetUsageHistoryInput {
  CacheGetUsageHistoryInput
}

pub fn encode_cache_get_usage_history_input(
  _value: CacheGetUsageHistoryInput,
) -> json.Json {
  let fields = []

  json.object(fields)
}

pub type CacheGetUsageHistoryOutput {
  CacheGetUsageHistoryOutput(samples: List(CacheUsageSample))
}

pub fn encode_cache_get_usage_history_output(
  value: CacheGetUsageHistoryOutput,
) -> json.Json {
  let fields = [
    #(
      "samples",
      json.array(value.samples, fn(item) { encode_cache_usage_sample(item) }),
    ),
  ]

  json.object(fields)
}

pub type CacheInviteUserInput {
  CacheInviteUserInput(actor: String)
}

pub fn encode_cache_invite_user_input(
  value: CacheInviteUserInput,
) -> json.Json {
  let fields = [#("actor", json.string(value.actor))]

  json.object(fields)
}

pub type CacheInviteUserOutput {
  CacheInviteUserOutput(owner: String, actor: String, active: Bool)
}

pub fn encode_cache_invite_user_output(
  value: CacheInviteUserOutput,
) -> json.Json {
  let fields = [
    #("owner", json.string(value.owner)),
    #("actor", json.string(value.actor)),
    #("active", json.bool(value.active)),
  ]

  json.object(fields)
}

pub type CacheListCollaboratorsInput {
  CacheListCollaboratorsInput(cursor: Option(String))
}

pub fn encode_cache_list_collaborators_input(
  value: CacheListCollaboratorsInput,
) -> json.Json {
  let fields = []
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}

pub type CacheListCollaboratorsOutput {
  CacheListCollaboratorsOutput(actors: List(String), cursor: Option(String))
}

pub fn encode_cache_list_collaborators_output(
  value: CacheListCollaboratorsOutput,
) -> json.Json {
  let fields = [
    #("actors", json.array(value.actors, fn(item) { json.string(item) })),
  ]
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}

pub type CacheListCredentialsInput {
  CacheListCredentialsInput
}

pub fn encode_cache_list_credentials_input(
  _value: CacheListCredentialsInput,
) -> json.Json {
  let fields = []

  json.object(fields)
}

pub type CacheListCredentialsOutput {
  CacheListCredentialsOutput(credentials: List(CacheCredentialView))
}

pub fn encode_cache_list_credentials_output(
  value: CacheListCredentialsOutput,
) -> json.Json {
  let fields = [
    #(
      "credentials",
      json.array(value.credentials, fn(item) {
        encode_cache_credential_view(item)
      }),
    ),
  ]

  json.object(fields)
}

pub type CacheListKeysInput {
  CacheListKeysInput(
    prefix: Option(String),
    cursor: Option(String),
    limit: Option(Int),
  )
}

pub fn encode_cache_list_keys_input(value: CacheListKeysInput) -> json.Json {
  let fields = []
  let fields =
    list.append(fields, case value.prefix {
      None -> []
      Some(item) -> [#("prefix", json.string(item))]
    })
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  let fields =
    list.append(fields, case value.limit {
      None -> []
      Some(item) -> [#("limit", json.int(item))]
    })
  json.object(fields)
}

pub type CacheListKeysOutput {
  CacheListKeysOutput(
    keys: List(CacheKeyView),
    cursor: Option(String),
    total_bytes: Int,
    total_keys: Int,
  )
}

pub fn encode_cache_list_keys_output(value: CacheListKeysOutput) -> json.Json {
  let fields = [
    #("keys", json.array(value.keys, fn(item) { encode_cache_key_view(item) })),
    #("totalBytes", json.int(value.total_bytes)),
    #("totalKeys", json.int(value.total_keys)),
  ]
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}

pub type CacheListTokensInput {
  CacheListTokensInput(cursor: Option(String))
}

pub fn encode_cache_list_tokens_input(
  value: CacheListTokensInput,
) -> json.Json {
  let fields = []
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}

pub type CacheListTokensOutput {
  CacheListTokensOutput(
    tokens: List(CacheUploadTokenView),
    cursor: Option(String),
  )
}

pub fn encode_cache_list_tokens_output(
  value: CacheListTokensOutput,
) -> json.Json {
  let fields = [
    #(
      "tokens",
      json.array(value.tokens, fn(item) { encode_cache_upload_token_view(item) }),
    ),
  ]
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}

pub type CacheResolveAccountParameters {
  CacheResolveAccountParameters(actor: String)
}

pub fn encode_cache_resolve_account_parameters(
  value: CacheResolveAccountParameters,
) -> json.Json {
  let fields = [#("actor", json.string(value.actor))]

  json.object(fields)
}

pub type CacheResolveAccountOutput {
  CacheResolveAccountOutput(owner: String, cache_id: String)
}

pub fn encode_cache_resolve_account_output(
  value: CacheResolveAccountOutput,
) -> json.Json {
  let fields = [
    #("owner", json.string(value.owner)),
    #("cacheId", json.string(value.cache_id)),
  ]

  json.object(fields)
}

pub type CacheRevokeCredentialInput {
  CacheRevokeCredentialInput(id: String)
}

pub fn encode_cache_revoke_credential_input(
  value: CacheRevokeCredentialInput,
) -> json.Json {
  let fields = [#("id", json.string(value.id))]

  json.object(fields)
}

pub type CacheRevokeCredentialOutput {
  CacheRevokeCredentialOutput(revoked: Bool)
}

pub fn encode_cache_revoke_credential_output(
  value: CacheRevokeCredentialOutput,
) -> json.Json {
  let fields = [#("revoked", json.bool(value.revoked))]

  json.object(fields)
}

pub type CacheRevokeTokenInput {
  CacheRevokeTokenInput(id: String)
}

pub fn encode_cache_revoke_token_input(
  value: CacheRevokeTokenInput,
) -> json.Json {
  let fields = [#("id", json.string(value.id))]

  json.object(fields)
}

pub type CacheRevokeTokenOutput {
  CacheRevokeTokenOutput(revoked: Bool)
}

pub fn encode_cache_revoke_token_output(
  value: CacheRevokeTokenOutput,
) -> json.Json {
  let fields = [#("revoked", json.bool(value.revoked))]

  json.object(fields)
}

pub type CacheRevokeUserInput {
  CacheRevokeUserInput(actor: String)
}

pub fn encode_cache_revoke_user_input(
  value: CacheRevokeUserInput,
) -> json.Json {
  let fields = [#("actor", json.string(value.actor))]

  json.object(fields)
}

pub type CacheRevokeUserOutput {
  CacheRevokeUserOutput(owner: String, actor: String, active: Bool)
}

pub fn encode_cache_revoke_user_output(
  value: CacheRevokeUserOutput,
) -> json.Json {
  let fields = [
    #("owner", json.string(value.owner)),
    #("actor", json.string(value.actor)),
    #("active", json.bool(value.active)),
  ]

  json.object(fields)
}

pub type Like {
  Like(subject: ComAtprotoRepoStrongRef, created_at: String)
}

pub fn encode_like(value: Like) -> json.Json {
  let fields = [
    #("subject", encode_com_atproto_repo_strong_ref(value.subject)),
    #("createdAt", json.string(value.created_at)),
  ]

  json.object(fields)
}

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
    functions: Option(List(PluginFunction)),
    size: Int,
    repository: Option(String),
    logo: Option(String),
    subdir: Option(String),
    topics: Option(List(String)),
    readme_url: Option(String),
    os: Option(List(String)),
    arch: Option(List(String)),
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
  let fields =
    list.append(fields, case value.functions {
      None -> []
      Some(item) -> [
        #(
          "functions",
          json.array(item, fn(item) { encode_plugin_function(item) }),
        ),
      ]
    })
  let fields =
    list.append(fields, case value.repository {
      None -> []
      Some(item) -> [#("repository", json.string(item))]
    })
  let fields =
    list.append(fields, case value.logo {
      None -> []
      Some(item) -> [#("logo", json.string(item))]
    })
  let fields =
    list.append(fields, case value.subdir {
      None -> []
      Some(item) -> [#("subdir", json.string(item))]
    })
  let fields =
    list.append(fields, case value.topics {
      None -> []
      Some(item) -> [
        #("topics", json.array(item, fn(item) { json.string(item) })),
      ]
    })
  let fields =
    list.append(fields, case value.readme_url {
      None -> []
      Some(item) -> [#("readmeUrl", json.string(item))]
    })
  let fields =
    list.append(fields, case value.os {
      None -> []
      Some(item) -> [#("os", json.array(item, fn(item) { json.string(item) }))]
    })
  let fields =
    list.append(fields, case value.arch {
      None -> []
      Some(item) -> [
        #("arch", json.array(item, fn(item) { json.string(item) })),
      ]
    })
  json.object(fields)
}

pub type PluginArgument {
  PluginArgument(
    name: String,
    type_: String,
    description: Option(String),
    required: Option(Bool),
  )
}

pub fn encode_plugin_argument(value: PluginArgument) -> json.Json {
  let fields = [
    #("name", json.string(value.name)),
    #("type", json.string(value.type_)),
  ]
  let fields =
    list.append(fields, case value.description {
      None -> []
      Some(item) -> [#("description", json.string(item))]
    })
  let fields =
    list.append(fields, case value.required {
      None -> []
      Some(item) -> [#("required", json.bool(item))]
    })
  json.object(fields)
}

pub type PluginFunction {
  PluginFunction(
    name: String,
    description: Option(String),
    args: Option(List(PluginArgument)),
    return_type: Option(String),
    wasm_params: List(String),
    wasm_results: List(String),
    input_format: Option(String),
  )
}

pub fn encode_plugin_function(value: PluginFunction) -> json.Json {
  let fields = [
    #("name", json.string(value.name)),
    #(
      "wasmParams",
      json.array(value.wasm_params, fn(item) { json.string(item) }),
    ),
    #(
      "wasmResults",
      json.array(value.wasm_results, fn(item) { json.string(item) }),
    ),
  ]
  let fields =
    list.append(fields, case value.description {
      None -> []
      Some(item) -> [#("description", json.string(item))]
    })
  let fields =
    list.append(fields, case value.args {
      None -> []
      Some(item) -> [
        #("args", json.array(item, fn(item) { encode_plugin_argument(item) })),
      ]
    })
  let fields =
    list.append(fields, case value.return_type {
      None -> []
      Some(item) -> [#("returnType", json.string(item))]
    })
  let fields =
    list.append(fields, case value.input_format {
      None -> []
      Some(item) -> [#("inputFormat", json.string(item))]
    })
  json.object(fields)
}

pub type RegistryDailyDownload {
  RegistryDailyDownload(date: String, downloads: Int)
}

pub fn encode_registry_daily_download(
  value: RegistryDailyDownload,
) -> json.Json {
  let fields = [
    #("date", json.string(value.date)),
    #("downloads", json.int(value.downloads)),
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
    functions: Option(List(PluginFunction)),
    size: Int,
    repository: Option(String),
    logo: Option(String),
    subdir: Option(String),
    topics: Option(List(String)),
    readme_url: Option(String),
    os: Option(List(String)),
    arch: Option(List(String)),
    downloads: Option(Int),
    daily_downloads: Option(List(RegistryDailyDownload)),
    uri: String,
    cid: String,
    likes_count: Option(Int),
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
  let fields =
    list.append(fields, case value.functions {
      None -> []
      Some(item) -> [
        #(
          "functions",
          json.array(item, fn(item) { encode_plugin_function(item) }),
        ),
      ]
    })
  let fields =
    list.append(fields, case value.repository {
      None -> []
      Some(item) -> [#("repository", json.string(item))]
    })
  let fields =
    list.append(fields, case value.logo {
      None -> []
      Some(item) -> [#("logo", json.string(item))]
    })
  let fields =
    list.append(fields, case value.subdir {
      None -> []
      Some(item) -> [#("subdir", json.string(item))]
    })
  let fields =
    list.append(fields, case value.topics {
      None -> []
      Some(item) -> [
        #("topics", json.array(item, fn(item) { json.string(item) })),
      ]
    })
  let fields =
    list.append(fields, case value.readme_url {
      None -> []
      Some(item) -> [#("readmeUrl", json.string(item))]
    })
  let fields =
    list.append(fields, case value.os {
      None -> []
      Some(item) -> [#("os", json.array(item, fn(item) { json.string(item) }))]
    })
  let fields =
    list.append(fields, case value.arch {
      None -> []
      Some(item) -> [
        #("arch", json.array(item, fn(item) { json.string(item) })),
      ]
    })
  let fields =
    list.append(fields, case value.downloads {
      None -> []
      Some(item) -> [#("downloads", json.int(item))]
    })
  let fields =
    list.append(fields, case value.daily_downloads {
      None -> []
      Some(item) -> [
        #(
          "dailyDownloads",
          json.array(item, fn(item) { encode_registry_daily_download(item) }),
        ),
      ]
    })
  let fields =
    list.append(fields, case value.likes_count {
      None -> []
      Some(item) -> [#("likesCount", json.int(item))]
    })
  json.object(fields)
}

pub type RegistryGetActorLikesParameters {
  RegistryGetActorLikesParameters(
    sort: Option(String),
    actor: String,
    q: Option(String),
    latest: Option(Bool),
    limit: Option(Int),
    cursor: Option(String),
  )
}

pub fn encode_registry_get_actor_likes_parameters(
  value: RegistryGetActorLikesParameters,
) -> json.Json {
  let fields = [#("actor", json.string(value.actor))]
  let fields =
    list.append(fields, case value.sort {
      None -> []
      Some(item) -> [#("sort", json.string(item))]
    })
  let fields =
    list.append(fields, case value.q {
      None -> []
      Some(item) -> [#("q", json.string(item))]
    })
  let fields =
    list.append(fields, case value.latest {
      None -> []
      Some(item) -> [#("latest", json.bool(item))]
    })
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
  json.object(fields)
}

pub type RegistryGetActorLikesOutput {
  RegistryGetActorLikesOutput(
    packages: List(RegistryPackageView),
    total: Option(Int),
    total_downloads: Option(Int),
    cursor: Option(String),
  )
}

pub fn encode_registry_get_actor_likes_output(
  value: RegistryGetActorLikesOutput,
) -> json.Json {
  let fields = [
    #(
      "packages",
      json.array(value.packages, fn(item) { encode_registry_package_view(item) }),
    ),
  ]
  let fields =
    list.append(fields, case value.total {
      None -> []
      Some(item) -> [#("total", json.int(item))]
    })
  let fields =
    list.append(fields, case value.total_downloads {
      None -> []
      Some(item) -> [#("totalDownloads", json.int(item))]
    })
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}

pub type RegistryGetActorPackagesParameters {
  RegistryGetActorPackagesParameters(
    sort: Option(String),
    actor: String,
    q: Option(String),
    latest: Option(Bool),
    limit: Option(Int),
    cursor: Option(String),
  )
}

pub fn encode_registry_get_actor_packages_parameters(
  value: RegistryGetActorPackagesParameters,
) -> json.Json {
  let fields = [#("actor", json.string(value.actor))]
  let fields =
    list.append(fields, case value.sort {
      None -> []
      Some(item) -> [#("sort", json.string(item))]
    })
  let fields =
    list.append(fields, case value.q {
      None -> []
      Some(item) -> [#("q", json.string(item))]
    })
  let fields =
    list.append(fields, case value.latest {
      None -> []
      Some(item) -> [#("latest", json.bool(item))]
    })
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
  json.object(fields)
}

pub type RegistryGetActorPackagesOutput {
  RegistryGetActorPackagesOutput(
    packages: List(RegistryPackageView),
    total: Option(Int),
    total_downloads: Option(Int),
    cursor: Option(String),
  )
}

pub fn encode_registry_get_actor_packages_output(
  value: RegistryGetActorPackagesOutput,
) -> json.Json {
  let fields = [
    #(
      "packages",
      json.array(value.packages, fn(item) { encode_registry_package_view(item) }),
    ),
  ]
  let fields =
    list.append(fields, case value.total {
      None -> []
      Some(item) -> [#("total", json.int(item))]
    })
  let fields =
    list.append(fields, case value.total_downloads {
      None -> []
      Some(item) -> [#("totalDownloads", json.int(item))]
    })
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
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
    latest: Option(Bool),
    sort: Option(String),
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
    list.append(fields, case value.latest {
      None -> []
      Some(item) -> [#("latest", json.bool(item))]
    })
  let fields =
    list.append(fields, case value.sort {
      None -> []
      Some(item) -> [#("sort", json.string(item))]
    })
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
    total: Option(Int),
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
    list.append(fields, case value.total {
      None -> []
      Some(item) -> [#("total", json.int(item))]
    })
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

pub type RegistryRecordDownloadInput {
  RegistryRecordDownloadInput(
    event_id: String,
    handle: String,
    name: String,
    version: String,
  )
}

pub fn encode_registry_record_download_input(
  value: RegistryRecordDownloadInput,
) -> json.Json {
  let fields = [
    #("eventId", json.string(value.event_id)),
    #("handle", json.string(value.handle)),
    #("name", json.string(value.name)),
    #("version", json.string(value.version)),
  ]

  json.object(fields)
}

pub type RegistryRecordDownloadOutput {
  RegistryRecordDownloadOutput(recorded: Int, downloads: Int)
}

pub fn encode_registry_record_download_output(
  value: RegistryRecordDownloadOutput,
) -> json.Json {
  let fields = [
    #("recorded", json.int(value.recorded)),
    #("downloads", json.int(value.downloads)),
  ]

  json.object(fields)
}

pub type RegistrySearchPackagesParameters {
  RegistrySearchPackagesParameters(
    latest: Option(Bool),
    sort: Option(String),
    limit: Option(Int),
    cursor: Option(String),
    author: Option(String),
    filter: Option(String),
    q: Option(String),
  )
}

pub fn encode_registry_search_packages_parameters(
  value: RegistrySearchPackagesParameters,
) -> json.Json {
  let fields = []
  let fields =
    list.append(fields, case value.latest {
      None -> []
      Some(item) -> [#("latest", json.bool(item))]
    })
  let fields =
    list.append(fields, case value.sort {
      None -> []
      Some(item) -> [#("sort", json.string(item))]
    })
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
  let fields =
    list.append(fields, case value.filter {
      None -> []
      Some(item) -> [#("filter", json.string(item))]
    })
  let fields =
    list.append(fields, case value.q {
      None -> []
      Some(item) -> [#("q", json.string(item))]
    })
  json.object(fields)
}

pub type RegistrySearchPackagesOutput {
  RegistrySearchPackagesOutput(
    packages: List(RegistryPackageView),
    total: Option(Int),
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
    list.append(fields, case value.total {
      None -> []
      Some(item) -> [#("total", json.int(item))]
    })
  let fields =
    list.append(fields, case value.cursor {
      None -> []
      Some(item) -> [#("cursor", json.string(item))]
    })
  json.object(fields)
}
