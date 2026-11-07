// Generated from pkl/defs by scripts/lexicons.mjs. DO NOT EDIT.
export const ids = {
  plugin: 'io.fluentci.plugin',
  registry_defs: 'io.fluentci.registry.defs',
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
        },
      },
    },
  },
  {
    lexicon: 1,
    id: 'io.fluentci.registry.getActorPackages',
    description:
      "List an actor's indexed published plugin versions, newest first, using cursor pagination.",
    defs: {
      main: {
        type: 'query',
        parameters: {
          type: 'params',
          required: ['actor'],
          properties: {
            actor: {
              type: 'string',
              format: 'at-identifier',
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
