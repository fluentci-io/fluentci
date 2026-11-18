export type CacheInstructions = {
  id: string;
  title: string;
  description: string;
  steps: { title: string; code: string }[];
  note: string;
  reference: string;
};

export function cacheEnvironment(cacheUrl: string) {
  return `export FLUENTCI_CACHE_URL='${cacheUrl.replace(/\/$/, "")}'
export FLUENTCI_CACHE_TOKEN='PASTE_UPLOAD_TOKEN'`;
}

export function cacheUrls(cacheUrl: string, owner: string, handle?: string) {
  const url = new URL(cacheUrl);
  const base =
    url.origin +
    url.pathname.replace(
      /\/(?:accounts\/[^/]+|did:[^/]+|@?[^/]+\.[^/]+)\/?$/,
      "",
    );
  return {
    did: `${base}/${encodeURIComponent(owner).replace(/%3A/g, ":")}`,
    handle: handle ? `${base}/${handle.toLowerCase()}` : undefined,
  };
}

export function cacheInstructions(
  cacheUrl: string,
  canonicalCacheUrl = cacheUrl,
): CacheInstructions[] {
  const base = cacheUrl.replace(/\/$/, "");
  const host = new URL(base).host;
  const candidate = decodeURIComponent(
    new URL(canonicalCacheUrl).pathname.split("/").filter(Boolean).at(-1) ?? "",
  );
  const didCandidate = decodeURIComponent(
    new URL(base).pathname.split("/").filter(Boolean).at(-1) ?? "",
  );
  const account = candidate.startsWith("did:")
    ? candidate
    : didCandidate.startsWith("did:")
      ? didCandidate
      : "OWNER_DID";
  const registryAccount = account.startsWith("did:plc:")
    ? "did-plc-" + account.slice(8)
    : account.startsWith("did:web:")
      ? "did-web-" +
        Array.from(new TextEncoder().encode(account.slice(8)), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("")
      : "REGISTRY_ENCODED_DID";
  return [
    {
      id: "bazel",
      title: "Bazel",
      description: "Use Bazel's HTTP remote cache with a bearer header.",
      steps: [
        {
          title: "Build with remote caching",
          code: `bazel build //... \\
  --remote_cache="$FLUENTCI_CACHE_URL/bazel" \\
  --remote_header="Authorization=Bearer $FLUENTCI_CACHE_TOKEN"`,
        },
      ],
      note: "For read-only builds, omit the header and add --remote_upload_local_results=false. For gRPC, select Bazel gRPC. Remote execution is not supported.",
      reference: "https://bazel.build/remote/caching",
    },
    {
      id: "bazel-grpc",
      title: "Bazel gRPC",
      description:
        "Use Bazel's gRPC cache services with an account-scoped instance.",
      steps: [
        {
          title: "Build with gRPC caching",
          code: `bazel build //... \\
  --remote_cache='grpcs://${host}' \\
  --remote_instance_name='accounts/${account}' \\
  --remote_header="Authorization=Bearer $FLUENTCI_CACHE_TOKEN"`,
        },
      ],
      note: "Supports ActionCache, CAS, Capabilities, and resumable ByteStream with SHA-256. This is caching only; no remote executor is provided. Omit the header and disable uploads for public read-only use. The HTTPS proxy must forward gRPC over HTTP/2.",
      reference: "https://bazel.build/remote/caching",
    },
    {
      id: "turbo",
      title: "Turborepo",
      description: "Share Turborepo artifacts through the HTTP remote cache.",
      steps: [
        {
          title: "Configure the remote cache",
          code: `export TURBO_API="$FLUENTCI_CACHE_URL/turbo"
export TURBO_TOKEN="$FLUENTCI_CACHE_TOKEN"
export TURBO_TEAM='${account}'
bunx turbo run build --cache=remote:rw`,
        },
      ],
      note: "TURBO_TEAM must match the cache owner's DID. Artifact signature headers are preserved; if your project enables signatures, configure the same TURBO_REMOTE_CACHE_SIGNATURE_KEY for every trusted client. Verified with Turborepo 2.11.10.",
      reference: "https://turborepo.dev/docs/core-concepts/remote-caching",
    },
    {
      id: "nx",
      title: "Nx",
      description: "Use Nx's self-hosted HTTP remote cache.",
      steps: [
        {
          title: "Configure Nx caching",
          code: `export NX_SELF_HOSTED_REMOTE_CACHE_SERVER="$FLUENTCI_CACHE_URL/nx"
export NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN="$FLUENTCI_CACHE_TOKEN"
bunx nx run my-project:build`,
        },
      ],
      note: "Replace my-project:build with a cacheable target in your workspace. Artifacts are immutable: an existing key returns 409. Verified with Nx 24.0.0; use a client version supporting the self-hosted remote-cache variables.",
      reference: "https://nx.dev/docs/kb/self-hosted-caching",
    },
    {
      id: "buildkit",
      title: "BuildKit / Docker Buildx",
      description:
        "Export and restore BuildKit cache using the OCI registry interface.",
      steps: [
        {
          title: "Authenticate and build",
          code: `export FLUENTCI_CACHE_REGISTRY='${host}'
export FLUENTCI_CACHE_REF="$FLUENTCI_CACHE_REGISTRY/accounts/${registryAccount}/buildkit/my-project:cache"
printf '%s' "$FLUENTCI_CACHE_TOKEN" | docker login "$FLUENTCI_CACHE_REGISTRY" --username ci --password-stdin
docker buildx build \\
  --cache-from "type=registry,ref=$FLUENTCI_CACHE_REF" \\
  --cache-to "type=registry,ref=$FLUENTCI_CACHE_REF,mode=max" .`,
        },
      ],
      note: "Choose a Buildx driver with registry-cache support, such as docker-container. Replace my-project with a separate repository for each build. Supports cache manifests, indexes, blob upload resume, and public pulls; not a full registry management API. Verified with Buildx 0.36.1 and fresh BuildKit builders.",
      reference: "https://docs.docker.com/build/cache/backends/registry/",
    },
    {
      id: "sccache",
      title: "sccache",
      description: "Use a sccache build with WebDAV support enabled.",
      steps: [
        {
          title: "Configure the WebDAV backend",
          code: `export SCCACHE_WEBDAV_ENDPOINT="$FLUENTCI_CACHE_URL/sccache"
export SCCACHE_WEBDAV_TOKEN="$FLUENTCI_CACHE_TOKEN"
export SCCACHE_WEBDAV_DISABLE_CREATE_DIR=true
export SCCACHE_WEBDAV_KEY_PREFIX='my-project/'
export RUSTC_WRAPPER=sccache
cargo build --release --locked`,
        },
      ],
      note: "Directory creation must be disabled because this service does not implement PROPFIND or MKCOL. Restart an existing sccache daemon after changing its backend settings. For public reads only, omit the token and set SCCACHE_WEBDAV_RW_MODE=READ_ONLY.",
      reference: "https://github.com/mozilla/sccache/blob/main/docs/Webdav.md",
    },
    {
      id: "go",
      title: "Go",
      description:
        "Go 1.24+ uses the fluentci-cache helper through GOCACHEPROG. Install that standalone binary on PATH first.",
      steps: [
        {
          title: "Enable the Go cache helper",
          code: `export GOCACHEPROG='fluentci-cache gocache'
go build ./...`,
        },
      ],
      note: "Keep FLUENTCI_CACHE_URL at the account base URL. The helper appends /gocache automatically; Go cannot use the HTTP URL directly.",
      reference: "https://go.dev/src/cmd/go/internal/cacheprog/cacheprog.go",
    },
    {
      id: "gradle",
      title: "Gradle",
      description:
        "Configure Gradle's HTTP build cache using your token as a Basic-auth password.",
      steps: [
        {
          title: "settings.gradle.kts",
          code: `import org.gradle.caching.http.HttpBuildCache

buildCache {
    local { isEnabled = true }
    remote<HttpBuildCache> {
        url = uri(System.getenv("FLUENTCI_CACHE_URL") + "/gradle/")
        isPush = !System.getenv("FLUENTCI_CACHE_TOKEN").isNullOrBlank()
        credentials {
            username = "ci"
            password = System.getenv("FLUENTCI_CACHE_TOKEN") ?: ""
        }
    }
}`,
        },
        { title: "Run the build", code: "./gradlew --build-cache build" },
      ],
      note: "Alternatively set org.gradle.caching=true in gradle.properties. For public read-only use, omit the token; isPush will be false. The username can be any nonempty value.",
      reference:
        "https://docs.gradle.org/current/userguide/build_cache.html#sec:build_cache_configure_remote",
    },
    {
      id: "maven",
      title: "Maven Build Cache",
      description:
        "Use Maven 3.9+ and the Maven Build Cache Extension. The extension stores build results here; this is not a Maven dependency repository.",
      steps: [
        {
          title: ".mvn/extensions.xml (if not already installed)",
          code: `<extensions>
  <extension>
    <groupId>org.apache.maven.extensions</groupId>
    <artifactId>maven-build-cache-extension</artifactId>
    <version>1.3.0</version>
  </extension>
</extensions>`,
        },
        {
          title: ".mvn/maven-build-cache-config.xml",
          code: `<cache xmlns="http://maven.apache.org/BUILD-CACHE-CONFIG/1.4.0">
  <configuration>
    <enabled>true</enabled>
    <remote enabled="true" id="fluentci-cache" transport="resolver">
      <url>${base}/maven/</url>
    </remote>
  </configuration>
</cache>`,
        },
        {
          title: "~/.m2/settings.xml",
          code: `<settings>
  <servers>
    <server>
      <id>fluentci-cache</id>
      <username>ci</username>
      <password>\${env.FLUENTCI_CACHE_TOKEN}</password>
    </server>
  </servers>
</settings>`,
        },
        {
          title: "Allow remote uploads",
          code: "mvn verify -Dmaven.build.cache.remote.save.enabled=true",
        },
      ],
      note: "Merge these entries into existing XML files. Keep the server id identical in both files. Pin the extension version your project uses. For read-only builds, leave remote saving disabled and omit the credentials entry.",
      reference:
        "https://maven.apache.org/extensions/maven-build-cache-extension/remote-cache.html",
    },
    {
      id: "nix",
      title: "Nix",
      description:
        "Use the token to upload NAR files and signed narinfo. Nix consumers read publicly; Nix signing keys are separate from the FluentCI upload token.",
      steps: [
        {
          title: "Consumer configuration in nix.conf",
          code: `extra-substituters = ${base}/nix
extra-trusted-public-keys = my-cache-1:YOUR_NIX_PUBLIC_KEY`,
        },
        {
          title: "Generate Nix signing keys once on the publishing machine",
          code: "nix-store --generate-binary-cache-key my-cache-1 nix-private.pem nix-public.pem",
        },
        {
          title:
            "Export a signed closure, then upload NAR files before metadata",
          code: `# Set absolute paths to your signing key and store closure.
export NIX_SIGNING_KEY='/absolute/path/nix-private.pem'
export STORE_PATH='/nix/store/your-built-closure'
(
  set -eu
  export_dir="$(mktemp -d)"
  nix copy --to "file://$export_dir?secret-key=$NIX_SIGNING_KEY" "$STORE_PATH"
  cd "$export_dir"
  find nar -type f -print | while IFS= read -r file; do
    curl --fail-with-body \\
      -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \\
      --upload-file "$file" "$FLUENTCI_CACHE_URL/nix/$file" || exit 1
  done
  find . -maxdepth 1 -name '*.narinfo' -print | while IFS= read -r file; do
    curl --fail-with-body \\
      -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \\
      --upload-file "$file" "$FLUENTCI_CACHE_URL/nix/\${file#./}" || exit 1
  done
)`,
        },
      ],
      note: "Replace YOUR_NIX_PUBLIC_KEY with the contents of nix-public.pem after its my-cache-1: prefix. Keep nix-private.pem with the publisher. Do not upload nix-cache-info: the service generates it. Direct nix copy --to https://... uploads and the Cachix service API are not implemented.",
      reference:
        "https://releases.nixos.org/nix/nix-2.34.7/manual/store/types/local-binary-cache-store.html",
    },
    {
      id: "http",
      title: "Generic HTTP",
      description:
        "Store arbitrary files under /generic with a bearer token, or use the token as a Basic-auth password.",
      steps: [
        {
          title: "Upload and read a file",
          code: `curl --fail-with-body \\
  -H "Authorization: Bearer $FLUENTCI_CACHE_TOKEN" \\
  --upload-file ./artifact.tar.zst \\
  "$FLUENTCI_CACHE_URL/generic/my-project/artifact.tar.zst"

# Public read: no token needed.
curl --fail-with-body \\
  "$FLUENTCI_CACHE_URL/generic/my-project/artifact.tar.zst" \\
  --output artifact-copy.tar.zst`,
        },
        {
          title: "Alternative Basic-auth upload",
          code: `curl --fail-with-body --user "ci:$FLUENTCI_CACHE_TOKEN" \\
  --upload-file ./artifact.tar.zst \\
  "$FLUENTCI_CACHE_URL/generic/my-project/artifact.tar.zst"`,
        },
      ],
      note: "Successful uploads return 201; missing objects return 404. Public reads also support HEAD and single byte ranges. Existing keys can be replaced.",
      reference: "https://docs.fluentci.io/guides/build-cache/",
    },
  ];
}
