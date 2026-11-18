module CI.Cache.Setup where

import Prelude
import CI.CacheHost as H
import CI.Cache.Connection as C
import CI.Cache.IO as IO
import CI.Cache.Sccache as Sccache
import Control.Promise (toAffE)
import Data.Array as A
import Data.Maybe (Maybe(..))
import Data.String as S
import Data.String.Pattern (Pattern(..))
import Effect.Aff (Aff)
import Effect.Class (liftEffect)

type Variable = { name :: String, value :: String }
type File = { name :: String, text :: String, executable :: Boolean }
type Result = { protocol :: String, url :: String, configDir :: String, files :: Array String, binDir :: String, environment :: Array Variable, secretNames :: Array String }

variable :: String -> String -> Variable
variable name value = { name, value }

file :: String -> String -> File
file name text = { name, text, executable: false }

quote :: String -> String
quote text = "'" <> S.replaceAll (Pattern "'") (S.Replacement "'\\''") text <> "'"

setup :: H.Env -> String -> String -> String -> String -> Aff Result
setup env explicit protocol directory repository = do
  c <- C.connection env explicit
  H.ensureA (A.elem protocol [ "nix", "bazel", "bazel-grpc", "turbo", "nx", "buildkit", "sccache", "go", "gradle", "maven", "generic" ]) "Unknown cache protocol"
  H.ensureA (S.trim directory /= "") "Set a configuration directory"
  destination <- liftEffect (IO.pathAbsolute directory)
  account <- if A.elem protocol [ "bazel-grpc", "turbo", "buildkit" ] then C.ownerDid c else pure ""
  let common = [ variable "FLUENTCI_CACHE_URL" c.base ]
  plan <- case protocol of
    "nix" -> do
      let key = H.envValue env "FLUENTCI_NIX_PUBLIC_KEY"
      H.ensureA (H.matches "^[\\w.-]+:[A-Za-z0-9+/]{43}=$" key) "Set FLUENTCI_NIX_PUBLIC_KEY for Nix"
      pure { variables: [ variable "NIX_CONFIG" ("substitute = true\nalways-allow-substitutes = true\nnarinfo-cache-negative-ttl = 0\nhttp-connections = 16\nextra-substituters = " <> c.base <> "/nix\nextra-trusted-public-keys = " <> key) ], secrets: [], files: [], note: "Nix environment configured. Use cache nix-build for watched signed uploads." }
    "sccache" -> do
      platform <- liftEffect IO.platform
      if Sccache.target platform.os platform.arch == "" then
        pure { variables: [ variable "FLUENTCI_RUST_CACHE_BACKEND" "generic", variable "FLUENTCI_GENERIC_CACHE_URL" (c.base <> "/generic/"), variable "RUSTC_WRAPPER" "" ], secrets: [], files: [], note: "No supported sccache binary for this platform. Use cache restore/save around the build to cache the Cargo target directory over generic HTTP." }
      else do
        installed <- Sccache.install platform.os platform.arch
        pure { variables: Sccache.environment c.base installed.executable, secrets: [ "SCCACHE_WEBDAV_TOKEN" ], files: [], note: "Pinned checksum-verified sccache installed. Stop an old daemon before switching backends; then build normally. Set SCCACHE_WEBDAV_TOKEN from FLUENTCI_CACHE_TOKEN in separate CI processes." }
    "go" -> pure { variables: [ variable "GOCACHEPROG" "fluentci-cache gocache" ], secrets: [], files: [], note: "Requires Go 1.24+ and the fluentci-cache standalone helper on PATH. Run go build ./..." }
    "turbo" -> pure { variables: [ variable "TURBO_API" (c.base <> "/turbo"), variable "TURBO_TEAM" account ], secrets: [ "TURBO_TOKEN" ], files: [], note: "Run turbo run build --cache=remote:rw. Configure a shared signature key separately if your project enables artifact signatures." }
    "nx" -> pure { variables: [ variable "NX_SELF_HOSTED_REMOTE_CACHE_SERVER" (c.base <> "/nx") ], secrets: [ "NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN" ], files: [], note: "Run Nx with a version supporting the self-hosted HTTP remote cache." }
    "gradle" -> pure { variables: [], secrets: [], files: [ file "init.gradle.kts" ("import org.gradle.caching.http.HttpBuildCache\nsettingsEvaluated {\n  buildCache {\n    remote<HttpBuildCache> {\n      url = uri(" <> IO.toJson (c.base <> "/gradle/") <> ")\n      isPush = true\n      credentials { username = \"ci\"; password = System.getenv(\"FLUENTCI_CACHE_TOKEN\") }\n    }\n  }\n}\n") ], note: "Run ./gradlew --init-script " <> quote (destination <> "/init.gradle.kts") <> " --build-cache build" }
    "maven" -> pure { variables: [], secrets: [], files: [ file "extensions.xml" "<extensions><extension><groupId>org.apache.maven.extensions</groupId><artifactId>maven-build-cache-extension</artifactId><version>1.3.0</version></extension></extensions>\n", file "maven-build-cache-config.xml" ("<cache xmlns=\"http://maven.apache.org/BUILD-CACHE-CONFIG/1.4.0\"><configuration><enabled>true</enabled><remote enabled=\"true\" id=\"fluentci-cache\" transport=\"resolver\"><url>" <> c.base <> "/maven/</url></remote></configuration></cache>\n"), file "settings.xml" "<settings><servers><server><id>fluentci-cache</id><username>ci</username><password>${env.FLUENTCI_CACHE_TOKEN}</password></server></servers></settings>\n" ], note: "Merge extensions.xml and maven-build-cache-config.xml into .mvn/. Merge settings.xml into Maven settings. Run mvn verify -Dmaven.build.cache.remote.save.enabled=true. Generated files contain environment references, never token values." }
    "buildkit" -> do
      H.ensureA (H.matches "^[a-z0-9][a-z0-9._/-]*:[A-Za-z0-9_][A-Za-z0-9_.-]*$" repository && not (S.contains (Pattern "..") repository)) "Set a valid BuildKit repository:tag"
      let ref = c.host <> "/accounts/" <> IO.registryAccount account <> "/" <> repository
      pure { variables: [ variable "FLUENTCI_CACHE_REGISTRY" c.host, variable "FLUENTCI_CACHE_REF" ref ], secrets: [], files: [ { name: "buildkit.sh", executable: true, text: "#!/bin/sh\nset -eu\nprintf '%s' \"$FLUENTCI_CACHE_TOKEN\" | docker login " <> quote c.host <> " --username ci --password-stdin\nexec docker buildx build --cache-from " <> quote ("type=registry,ref=" <> ref) <> " --cache-to " <> quote ("type=registry,ref=" <> ref <> ",mode=max") <> " \"$@\"\n" } ], note: "Run buildkit.sh . with a Buildx driver supporting registry cache. Docker stores credentials in its normal credential store." }
    "bazel" -> pure (bazel c destination (c.base <> "/bazel") "")
    "bazel-grpc" -> pure (bazel c destination ("grpcs://" <> c.host) ("build --remote_instance_name=accounts/" <> account <> "\n"))
    _ -> pure { variables: [ variable "FLUENTCI_GENERIC_CACHE_URL" (c.base <> "/generic/") ], secrets: [], files: [], note: "Use cache save and cache restore for compressed files or directories." }
  let variables = common <> plan.variables
  let shell = "# Source this file in your shell outside FluentCI.\n: \"${FLUENTCI_CACHE_TOKEN:?Set FLUENTCI_CACHE_TOKEN}\"\n" <> S.joinWith "\n" (map (\v -> if v.name == "NIX_CONFIG" then "export NIX_CONFIG=\"${NIX_CONFIG:-}\"" <> quote ("\n" <> v.value) else "export " <> v.name <> "=" <> quote v.value) variables) <> "\n" <> S.joinWith "\n" (map (\name -> "export " <> name <> "=\"$FLUENTCI_CACHE_TOKEN\"") plan.secrets) <> "\n"
  paths <- toAffE (IO.writeFiles destination (plan.files <> [ file "env.sh" shell, file "README.txt" (plan.note <> "\n") ]))
  let wrapper = A.find (\v -> v.name == "RUSTC_WRAPPER" && v.value /= "") variables
  let
    binDir = case wrapper of
      Just v -> IO.parentPath v.value
      Nothing -> destination
  pure { protocol, url: c.base, configDir: destination, files: paths, binDir, environment: variables, secretNames: plan.secrets }

bazel :: C.Connection -> String -> String -> String -> { variables :: Array Variable, secrets :: Array String, files :: Array File, note :: String }
bazel c destination remote extra =
  { variables: []
  , secrets: []
  , files:
      [ file "bazelrc" ("build --remote_cache=" <> remote <> "\n" <> extra <> "build --remote_upload_local_results=true\nbuild --credential_helper=" <> c.host <> "=" <> destination <> "/credentials.mjs\n")
      , { name: "credentials.mjs", executable: true, text: "#!/usr/bin/env node\nconst token=process.env.FLUENTCI_CACHE_TOKEN;if(!token)throw Error('Set FLUENTCI_CACHE_TOKEN');if(process.argv[2]==='get')process.stdout.write(JSON.stringify({headers:{Authorization:['Bearer '+token]}}));\n" }
      ]
  , note: "Run bazel --bazelrc=" <> quote (destination <> "/bazelrc") <> " build //... . Requires a Bazel version with credential helpers. The token is supplied through helper stdout, not saved in bazelrc."
  }
