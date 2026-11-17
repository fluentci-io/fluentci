// Generated from pkl/defs by scripts/lexicons.mjs. DO NOT EDIT.
export const ids = {
  com_atproto_repo_strong_ref: 'com.atproto.repo.strongRef',
  cache_clear_cache: 'io.fluentci.cache.clearCache',
  cache_create_credential: 'io.fluentci.cache.createCredential',
  cache_create_token: 'io.fluentci.cache.createToken',
  cache_defs: 'io.fluentci.cache.defs',
  cache_delete_key: 'io.fluentci.cache.deleteKey',
  cache_exchange_credential: 'io.fluentci.cache.exchangeCredential',
  cache_get_usage_history: 'io.fluentci.cache.getUsageHistory',
  cache_invite_user: 'io.fluentci.cache.inviteUser',
  cache_list_collaborators: 'io.fluentci.cache.listCollaborators',
  cache_list_credentials: 'io.fluentci.cache.listCredentials',
  cache_list_keys: 'io.fluentci.cache.listKeys',
  cache_list_tokens: 'io.fluentci.cache.listTokens',
  cache_revoke_credential: 'io.fluentci.cache.revokeCredential',
  cache_revoke_token: 'io.fluentci.cache.revokeToken',
  cache_revoke_user: 'io.fluentci.cache.revokeUser',
  like: 'io.fluentci.like',
  plugin: 'io.fluentci.plugin',
  registry_defs: 'io.fluentci.registry.defs',
  registry_get_actor_likes: 'io.fluentci.registry.getActorLikes',
  registry_get_actor_packages: 'io.fluentci.registry.getActorPackages',
  registry_get_package: 'io.fluentci.registry.getPackage',
  registry_list_packages: 'io.fluentci.registry.listPackages',
  registry_publish: 'io.fluentci.registry.publish',
  registry_record_download: 'io.fluentci.registry.recordDownload',
  registry_search_packages: 'io.fluentci.registry.searchPackages',
};
export const schemas = [
  {
    lexicon: 1,
    id: 'com.atproto.repo.strongRef',
    description: 'A URI with a content-hash fingerprint.',
    defs: {
      main: {
        type: 'object',
        required: ['uri', 'cid'],
        properties: {
          uri: {
            type: 'string',
            format: 'at-uri',
          },
          cid: {
            type: 'string',
            format: 'cid',
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.clearCache',
    description: 'Owner-only cache management. Requires a method-scoped service-auth token.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['confirm'],
            properties: {
              confirm: {
                type: 'boolean',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['deleted'],
            properties: {
              deleted: {
                type: 'integer',
                minimum: 0,
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
          {
            name: 'InvalidRequest',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.createCredential',
    description:
      'Owner-only: create a 90-day revocable CI credential. The secret is returned once.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['label'],
            properties: {
              label: {
                type: 'string',
                minLength: 1,
                maxLength: 80,
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['id', 'label', 'createdAt', 'expiresAt', 'active', 'credential', 'owner'],
            properties: {
              id: {
                type: 'string',
              },
              label: {
                type: 'string',
              },
              createdAt: {
                type: 'string',
                format: 'datetime',
              },
              expiresAt: {
                type: 'string',
                format: 'datetime',
              },
              active: {
                type: 'boolean',
              },
              credential: {
                type: 'string',
              },
              owner: {
                type: 'string',
                format: 'did',
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.createToken',
    description:
      'Issue a non-expiring upload token for your cache, or a cache whose owner invited you. Requires an account service-auth JWT addressed to this method. Reads remain public.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [],
            properties: {
              owner: {
                type: 'string',
                format: 'at-identifier',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['id', 'token', 'cacheUrl', 'owner'],
            properties: {
              id: {
                type: 'string',
              },
              token: {
                type: 'string',
              },
              expiresAt: {
                type: 'string',
                format: 'datetime',
              },
              cacheUrl: {
                type: 'string',
                format: 'uri',
              },
              owner: {
                type: 'string',
                format: 'did',
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'AccessDenied',
          },
          {
            name: 'CacheUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.defs',
    defs: {
      credentialView: {
        type: 'object',
        required: ['id', 'label', 'createdAt', 'expiresAt', 'active'],
        properties: {
          id: {
            type: 'string',
          },
          label: {
            type: 'string',
          },
          createdAt: {
            type: 'string',
            format: 'datetime',
          },
          expiresAt: {
            type: 'string',
            format: 'datetime',
          },
          active: {
            type: 'boolean',
          },
        },
      },
      keyView: {
        type: 'object',
        required: ['key', 'size', 'lastModified'],
        properties: {
          key: {
            type: 'string',
          },
          size: {
            type: 'integer',
            minimum: 0,
          },
          lastModified: {
            type: 'string',
            format: 'datetime',
          },
        },
      },
      usageSample: {
        type: 'object',
        required: ['date', 'bytes', 'keyCount', 'observedAt'],
        properties: {
          date: {
            type: 'string',
            minLength: 10,
            maxLength: 10,
          },
          bytes: {
            type: 'integer',
            minimum: 0,
          },
          keyCount: {
            type: 'integer',
            minimum: 0,
          },
          observedAt: {
            type: 'string',
            format: 'datetime',
          },
        },
      },
      uploadTokenView: {
        type: 'object',
        required: ['id', 'owner', 'actor', 'createdAt', 'active'],
        properties: {
          id: {
            type: 'string',
          },
          owner: {
            type: 'string',
            format: 'did',
          },
          actor: {
            type: 'string',
            format: 'did',
          },
          createdAt: {
            type: 'string',
            format: 'datetime',
          },
          expiresAt: {
            type: 'string',
            format: 'datetime',
          },
          active: {
            type: 'boolean',
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.deleteKey',
    description: 'Owner-only cache management. Requires a method-scoped service-auth token.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['key'],
            properties: {
              key: {
                type: 'string',
                minLength: 1,
                maxLength: 2048,
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['deleted'],
            properties: {
              deleted: {
                type: 'integer',
                minimum: 0,
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
          {
            name: 'InvalidRequest',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.exchangeCredential',
    description:
      'Exchange a CI credential in the Authorization bearer header for a non-expiring owner-scoped upload token. No PDS login is required.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [],
            properties: {},
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['id', 'token', 'cacheUrl', 'owner'],
            properties: {
              id: {
                type: 'string',
              },
              token: {
                type: 'string',
              },
              expiresAt: {
                type: 'string',
                format: 'datetime',
              },
              cacheUrl: {
                type: 'string',
                format: 'uri',
              },
              owner: {
                type: 'string',
                format: 'did',
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.getUsageHistory',
    description:
      'Owner-only: recorded daily storage snapshots for the last 30 UTC days. Missing days have no sample.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [],
            properties: {},
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['samples'],
            properties: {
              samples: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'io.fluentci.cache.defs#usageSample',
                },
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.inviteUser',
    description:
      'Grant an account upload access to your cache. Requires an account service-auth JWT addressed to this method. Reads remain public.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['actor'],
            properties: {
              actor: {
                type: 'string',
                format: 'at-identifier',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['owner', 'actor', 'active'],
            properties: {
              owner: {
                type: 'string',
                format: 'did',
              },
              actor: {
                type: 'string',
                format: 'did',
              },
              active: {
                type: 'boolean',
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'AccessDenied',
          },
          {
            name: 'CacheUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.listCollaborators',
    description: 'Owner-only cache management. Requires a method-scoped service-auth token.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [],
            properties: {
              cursor: {
                type: 'string',
                maxLength: 2048,
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['actors'],
            properties: {
              actors: {
                type: 'array',
                items: {
                  type: 'string',
                  format: 'did',
                },
              },
              cursor: {
                type: 'string',
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
          {
            name: 'InvalidRequest',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.listCredentials',
    description: 'Owner-only: list up to 100 latest CI credentials without secret values.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [],
            properties: {},
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['credentials'],
            properties: {
              credentials: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'io.fluentci.cache.defs#credentialView',
                },
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.listKeys',
    description: 'Owner-only cache management. Requires a method-scoped service-auth token.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [],
            properties: {
              prefix: {
                type: 'string',
                maxLength: 2048,
              },
              cursor: {
                type: 'string',
                maxLength: 2048,
              },
              limit: {
                type: 'integer',
                minimum: 1,
                maximum: 200,
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['keys', 'totalBytes', 'totalKeys'],
            properties: {
              keys: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'io.fluentci.cache.defs#keyView',
                },
              },
              cursor: {
                type: 'string',
              },
              totalBytes: {
                type: 'integer',
                minimum: 0,
              },
              totalKeys: {
                type: 'integer',
                minimum: 0,
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
          {
            name: 'InvalidRequest',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.listTokens',
    description: 'Owner-only cache management. Requires a method-scoped service-auth token.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: [],
            properties: {
              cursor: {
                type: 'string',
                maxLength: 2048,
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['tokens'],
            properties: {
              tokens: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'io.fluentci.cache.defs#uploadTokenView',
                },
              },
              cursor: {
                type: 'string',
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
          {
            name: 'InvalidRequest',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.revokeCredential',
    description:
      'Owner-only: disable a CI credential. Already-issued upload tokens remain valid until individually revoked.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {
                type: 'string',
                minLength: 36,
                maxLength: 36,
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['revoked'],
            properties: {
              revoked: {
                type: 'boolean',
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.revokeToken',
    description: 'Owner-only: revoke an upload token at the cache server.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['id'],
            properties: {
              id: {
                type: 'string',
                minLength: 36,
                maxLength: 36,
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['revoked'],
            properties: {
              revoked: {
                type: 'boolean',
              },
            },
          },
        },
        errors: [
          {
            name: 'TokenNotFound',
          },
          {
            name: 'AuthRequired',
          },
          {
            name: 'CacheUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.cache.revokeUser',
    description:
      'Revoke an account’s ability to mint new upload tokens for your cache. Requires an account service-auth JWT addressed to this method. Reads remain public.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['actor'],
            properties: {
              actor: {
                type: 'string',
                format: 'at-identifier',
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['owner', 'actor', 'active'],
            properties: {
              owner: {
                type: 'string',
                format: 'did',
              },
              actor: {
                type: 'string',
                format: 'did',
              },
              active: {
                type: 'boolean',
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'AccessDenied',
          },
          {
            name: 'CacheUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.like',
    description:
      "A user's like of a published plugin record. The subject contains the plugin AT URI and CID. Clients use com.atproto.repo.createRecord without a record key, letting the PDS generate its default short key. Delete the like record to unlike.",
    defs: {
      main: {
        type: 'record',
        key: 'any',
        record: {
          type: 'object',
          required: ['subject', 'createdAt'],
          properties: {
            subject: {
              type: 'ref',
              ref: 'com.atproto.repo.strongRef',
            },
            createdAt: {
              type: 'string',
              format: 'datetime',
            },
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.plugin',
    description: 'A FluentCI Wasm plugin published by its AT Protocol author.',
    defs: {
      main: {
        type: 'record',
        description:
          'Published Wasm plugin. Package identity is author DID plus name, stable across handle changes. The record key is name-version; author must equal the repository DID. Authors may update metadata on an existing name-version record.',
        key: 'any',
        record: {
          type: 'object',
          required: [
            'name',
            'description',
            'version',
            'publishedAt',
            'author',
            'license',
            'url',
            'sha256',
            'size',
          ],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 64,
            },
            description: {
              type: 'string',
              maxLength: 2048,
            },
            version: {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            publishedAt: {
              type: 'string',
              format: 'datetime',
            },
            author: {
              type: 'string',
              format: 'did',
            },
            license: {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            url: {
              type: 'string',
              maxLength: 2048,
              format: 'uri',
            },
            sha256: {
              type: 'string',
              minLength: 64,
              maxLength: 64,
            },
            functions: {
              type: 'array',
              description:
                'Exported jobs with optional source-level signatures and their actual Wasm ABI. Missing args or returnType means unknown, not zero arguments or void.',
              items: {
                type: 'ref',
                ref: 'io.fluentci.plugin#function',
              },
            },
            size: {
              type: 'integer',
              minimum: 8,
              maximum: 67108864,
            },
            repository: {
              type: 'string',
              description: 'Optional source Git repository URL.',
              maxLength: 2048,
              format: 'uri',
            },
            logo: {
              type: 'string',
              description: 'Optional HTTP(S) picture URL for the module logo.',
              maxLength: 2048,
              format: 'uri',
            },
            subdir: {
              type: 'string',
              description: 'Relative module source directory inside the Git repository.',
              minLength: 1,
              maxLength: 2048,
            },
            topics: {
              type: 'array',
              description: 'Optional lowercase topic labels describing the module.',
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 50,
              },
              maxLength: 20,
            },
            readmeUrl: {
              type: 'string',
              description: 'Optional public HTTP(S) URL of the module README.',
              maxLength: 2048,
              format: 'uri',
            },
            os: {
              type: 'array',
              description:
                'Optional supported host operating systems, such as linux, macos, freebsd, netbsd, openbsd, or windows. Omitted means unspecified.',
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 32,
              },
              maxLength: 16,
            },
            arch: {
              type: 'array',
              description:
                'Optional supported host CPU architectures, such as x86_64 or aarch64. Omitted means unspecified.',
              items: {
                type: 'string',
                minLength: 1,
                maxLength: 32,
              },
              maxLength: 16,
            },
          },
        },
      },
      argument: {
        type: 'object',
        required: ['name', 'type'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          type: {
            type: 'string',
            minLength: 1,
            maxLength: 1024,
          },
          description: {
            type: 'string',
            maxLength: 2048,
          },
          required: {
            type: 'boolean',
            description: 'Defaults to true. False means the JSON input may omit this field.',
          },
        },
      },
      function: {
        type: 'object',
        required: ['name', 'wasmParams', 'wasmResults'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
          },
          description: {
            type: 'string',
            maxLength: 2048,
          },
          args: {
            type: 'array',
            items: {
              type: 'ref',
              ref: 'io.fluentci.plugin#argument',
            },
          },
          returnType: {
            type: 'string',
            minLength: 1,
            maxLength: 1024,
          },
          wasmParams: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          wasmResults: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
          inputFormat: {
            type: 'string',
            description:
              'Defaults to legacy text. json uses an SDK-neutral named-argument object; wit uses native component interface types.',
            enum: ['text', 'json', 'wit'],
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.defs',
    description: 'Indexed plugin metadata with its repository record URI and CID.',
    defs: {
      dailyDownload: {
        type: 'object',
        required: ['date', 'downloads'],
        properties: {
          date: {
            type: 'string',
            description: 'UTC calendar date, YYYY-MM-DD.',
          },
          downloads: {
            type: 'integer',
            minimum: 0,
          },
        },
      },
      packageView: {
        type: 'object',
        required: [
          'name',
          'description',
          'version',
          'publishedAt',
          'author',
          'license',
          'url',
          'sha256',
          'size',
          'uri',
          'cid',
        ],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
          },
          description: {
            type: 'string',
            maxLength: 2048,
          },
          version: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          publishedAt: {
            type: 'string',
            format: 'datetime',
          },
          author: {
            type: 'string',
            format: 'did',
          },
          license: {
            type: 'string',
            minLength: 1,
            maxLength: 128,
          },
          url: {
            type: 'string',
            maxLength: 2048,
            format: 'uri',
          },
          sha256: {
            type: 'string',
            minLength: 64,
            maxLength: 64,
          },
          functions: {
            type: 'array',
            description:
              'Exported jobs with optional source-level signatures and their actual Wasm ABI. Missing args or returnType means unknown, not zero arguments or void.',
            items: {
              type: 'ref',
              ref: 'io.fluentci.plugin#function',
            },
          },
          size: {
            type: 'integer',
            minimum: 8,
            maximum: 67108864,
          },
          repository: {
            type: 'string',
            description: 'Optional source Git repository URL.',
            maxLength: 2048,
            format: 'uri',
          },
          logo: {
            type: 'string',
            description: 'Optional HTTP(S) picture URL for the module logo.',
            maxLength: 2048,
            format: 'uri',
          },
          subdir: {
            type: 'string',
            description: 'Relative module source directory inside the Git repository.',
            minLength: 1,
            maxLength: 2048,
          },
          topics: {
            type: 'array',
            description: 'Optional lowercase topic labels describing the module.',
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 50,
            },
            maxLength: 20,
          },
          readmeUrl: {
            type: 'string',
            description: 'Optional public HTTP(S) URL of the module README.',
            maxLength: 2048,
            format: 'uri',
          },
          os: {
            type: 'array',
            description:
              'Optional supported host operating systems, such as linux, macos, freebsd, netbsd, openbsd, or windows. Omitted means unspecified.',
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 32,
            },
            maxLength: 16,
          },
          arch: {
            type: 'array',
            description:
              'Optional supported host CPU architectures, such as x86_64 or aarch64. Omitted means unspecified.',
            items: {
              type: 'string',
              minLength: 1,
              maxLength: 32,
            },
            maxLength: 16,
          },
          downloads: {
            type: 'integer',
            description: 'Registry-maintained total downloads for this published version.',
            minimum: 0,
          },
          dailyDownloads: {
            type: 'array',
            description:
              'Last seven UTC calendar days including today, zero-filled only when tracked history exists.',
            items: {
              type: 'ref',
              ref: 'io.fluentci.registry.defs#dailyDownload',
            },
            maxLength: 7,
          },
          uri: {
            type: 'string',
            format: 'at-uri',
          },
          cid: {
            type: 'string',
            format: 'cid',
          },
          likesCount: {
            type: 'integer',
            description:
              'Distinct active actors liking this module across all versions; maintained from io.fluentci.like PDS records.',
            minimum: 0,
          },
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.getActorLikes',
    description:
      "List an actor's liked modules with selectable ordering and cursor pagination; most recently liked first by default.",
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['actor'],
          properties: {
            sort: {
              type: 'string',
              description:
                'Sort by most recently liked (default), downloads, newest publication, oldest publication, or module name A-Z.',
              enum: ['recently-liked', 'downloads', 'newest', 'oldest', 'name'],
            },
            actor: {
              type: 'string',
              format: 'at-identifier',
            },
            q: {
              type: 'string',
              maxLength: 1000,
            },
            latest: {
              type: 'boolean',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
            cursor: {
              type: 'string',
              maxLength: 4096,
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['packages'],
            properties: {
              packages: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'io.fluentci.registry.defs#packageView',
                },
              },
              total: {
                type: 'integer',
                minimum: 0,
              },
              totalDownloads: {
                type: 'integer',
                description:
                  'Downloads across all visible versions of all modules published by this actor, independent of filtering and pagination.',
                minimum: 0,
              },
              cursor: {
                type: 'string',
              },
            },
          },
        },
        errors: [
          {
            name: 'InvalidCursor',
            description: 'The cursor is invalid or belongs to a different query.',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.getActorPackages',
    description:
      "List an actor's indexed plugins with selectable ordering and cursor pagination; most downloaded first by default.",
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['actor'],
          properties: {
            sort: {
              type: 'string',
              description:
                'Sort by downloads (default), newest publication, oldest publication, or module name A-Z.',
              enum: ['downloads', 'newest', 'oldest', 'name'],
            },
            actor: {
              type: 'string',
              format: 'at-identifier',
            },
            q: {
              type: 'string',
              maxLength: 1000,
            },
            latest: {
              type: 'boolean',
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
            cursor: {
              type: 'string',
              maxLength: 4096,
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['packages'],
            properties: {
              packages: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'io.fluentci.registry.defs#packageView',
                },
              },
              total: {
                type: 'integer',
                minimum: 0,
              },
              totalDownloads: {
                type: 'integer',
                description:
                  'Downloads across all visible versions of all modules published by this actor, independent of filtering and pagination.',
                minimum: 0,
              },
              cursor: {
                type: 'string',
              },
            },
          },
        },
        errors: [
          {
            name: 'InvalidCursor',
            description: 'The cursor is invalid or belongs to a different query.',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.getPackage',
    description:
      'Get a package version; omitted version selects the latest SemVer release, excluding prereleases unless no stable release exists.',
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['name'],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 64,
            },
            version: {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
            author: {
              type: 'string',
              format: 'at-identifier',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['package'],
            properties: {
              package: {
                type: 'ref',
                ref: 'io.fluentci.registry.defs#packageView',
              },
            },
          },
        },
        errors: [
          {
            name: 'PackageNotFound',
          },
          {
            name: 'AmbiguousPackage',
            description: 'Specify an author to disambiguate publishers.',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.listPackages',
    description: 'List indexed package versions using cursor pagination.',
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: [],
          properties: {
            latest: {
              type: 'boolean',
              description:
                'Return only the highest stable SemVer release per author and name, or highest prerelease when no stable release exists. Applied before filtering, sorting and pagination.',
            },
            sort: {
              type: 'string',
              description:
                'Sort by downloads (default), newest publication, oldest publication, or module name A-Z.',
              enum: ['downloads', 'newest', 'oldest', 'name'],
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
            cursor: {
              type: 'string',
              maxLength: 4096,
            },
            author: {
              type: 'string',
              format: 'at-identifier',
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['packages'],
            properties: {
              packages: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'io.fluentci.registry.defs#packageView',
                },
              },
              total: {
                type: 'integer',
                description:
                  'Number of matching visible modules before cursor pagination; counts latest releases only when latest is true.',
                minimum: 0,
              },
              cursor: {
                type: 'string',
              },
            },
          },
        },
        errors: [
          {
            name: 'InvalidCursor',
            description: 'The cursor is invalid or belongs to a different query.',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.publish',
    description:
      'Upload a Wasm plugin to public S3 storage using a scoped AT Protocol service-auth token. The publisher then creates io.fluentci.plugin in their own PDS.',
    defs: {
      main: {
        type: 'procedure',
        parameters: {
          type: 'params',
          required: [],
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              maxLength: 64,
            },
            version: {
              type: 'string',
              minLength: 1,
              maxLength: 128,
            },
          },
        },
        input: {
          encoding: 'application/wasm',
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['url', 'sha256', 'size'],
            properties: {
              url: {
                type: 'string',
                maxLength: 2048,
                format: 'uri',
              },
              sha256: {
                type: 'string',
                minLength: 64,
                maxLength: 64,
              },
              size: {
                type: 'integer',
                minimum: 8,
                maximum: 67108864,
              },
            },
          },
        },
        errors: [
          {
            name: 'InvalidWasm',
          },
          {
            name: 'InvalidPackageMetadata',
          },
          {
            name: 'PublisherHandleUnavailable',
          },
          {
            name: 'PackageVersionExists',
          },
          {
            name: 'AuthRequired',
          },
          {
            name: 'StorageUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.recordDownload',
    description:
      'Record a successful Wasm download from the trusted proxy. Requires the private download-tracking bearer token. eventId makes retries idempotent.',
    defs: {
      main: {
        type: 'procedure',
        input: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['eventId', 'handle', 'name', 'version'],
            properties: {
              eventId: {
                type: 'string',
                minLength: 36,
                maxLength: 36,
              },
              handle: {
                type: 'string',
                format: 'at-identifier',
              },
              name: {
                type: 'string',
                minLength: 1,
                maxLength: 64,
              },
              version: {
                type: 'string',
                minLength: 1,
                maxLength: 128,
              },
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['recorded', 'downloads'],
            properties: {
              recorded: {
                type: 'integer',
                minimum: 0,
                maximum: 1,
              },
              downloads: {
                type: 'integer',
                minimum: 0,
              },
            },
          },
        },
        errors: [
          {
            name: 'AuthRequired',
          },
          {
            name: 'InvalidDownloadMetadata',
          },
          {
            name: 'PackageNotFound',
          },
          {
            name: 'TrackingUnavailable',
          },
        ],
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.searchPackages',
    description: 'Full-text search plugin names and descriptions, with token prefix matching.',
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: [],
          properties: {
            latest: {
              type: 'boolean',
              description:
                'Return only the highest stable SemVer release per author and name, or highest prerelease when no stable release exists. Applied before filtering, sorting and pagination.',
            },
            sort: {
              type: 'string',
              description:
                'Sort by downloads (default), newest publication, oldest publication, or module name A-Z.',
              enum: ['downloads', 'newest', 'oldest', 'name'],
            },
            limit: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              default: 20,
            },
            cursor: {
              type: 'string',
              maxLength: 4096,
            },
            author: {
              type: 'string',
              format: 'at-identifier',
            },
            filter: {
              type: 'string',
              description:
                'RSQL filter: os==linux;arch=in=(aarch64,x86_64). Fields: name, version, license, author (DID), os, arch, topics. Operators: ==, !=, =in=, =out=; AND (;), OR (,), grouping.',
              maxLength: 2048,
            },
            q: {
              type: 'string',
              maxLength: 200,
            },
          },
        },
        output: {
          encoding: 'application/json',
          schema: {
            type: 'object',
            required: ['packages'],
            properties: {
              packages: {
                type: 'array',
                items: {
                  type: 'ref',
                  ref: 'io.fluentci.registry.defs#packageView',
                },
              },
              total: {
                type: 'integer',
                description:
                  'Number of matching visible modules before cursor pagination; counts latest releases only when latest is true.',
                minimum: 0,
              },
              cursor: {
                type: 'string',
              },
            },
          },
        },
        errors: [
          {
            name: 'InvalidFilter',
          },
          {
            name: 'InvalidCursor',
            description: 'The cursor is invalid or belongs to a different query.',
          },
        ],
      },
    },
  },
];
