-- | Immutable guest values. Only terminal functions invoke FluentCI's exposed PDK.
-- | Use FluentCI.Host.* for applications submitting execution plans outside Wasm.
module FluentCI.Plugin
  ( Pipeline, Cache, File, Secret, Service, SecretManager, Provider(..), SecretProvider(..), Result
  , module Error
  , pipeline, exec, shell, withWorkdir, withEnv, cache, withCache, using, withPackages
  , asService, withService, waitOn, file, copyFile, sha256, md5
  , secret, withSecret, secretManager, getSecrets
  , callModule, getEnv, hasEnv, getOS, getArch, input, output
  , validate, stdout, stderr, runPlan
  ) where

import Prelude
import Data.Either (Either(..))
import Effect (Effect)
import FluentCI.Plugin.Error (PluginError, fromWireError)
import FluentCI.Plugin.Error (PluginError(..), errorMessage) as Error
import FluentCI.Plugin.Internal.Imports as Imports
import FluentCI.Plugin.Plan as Execution
import FluentCI.Host.Plan as Host
import FluentCI.Host.Client (RunResult)

foreign import data Pipeline :: Type
foreign import data Cache :: Type
foreign import data File :: Type
foreign import data Secret :: Type
foreign import data Service :: Type
newtype SecretManager = SecretManager String

data Provider
  = Native
  | Nix { impure :: Boolean }
  | Devbox
  | Devenv
  | Envhub
  | Flox
  | Hermit
  | Mise
  | Pixi
  | Pkgx
  | Proto

-- | Authentication is resolved by the engine's provider from its environment.
data SecretProvider
  = Aws { region :: String }
  | Google { project :: String }
  | Azure { vaultUrl :: String }
  | Hashicorp { address :: String }

type Result a = Either PluginError a
type Invoke = String -> String -> Effect String
type MakeError = String -> String -> String -> PluginError

foreign import pipeline :: String -> Pipeline
-- | Literal argv, including the program as the first element. No shell expansion.
foreign import exec :: Array String -> Pipeline -> Pipeline
-- | Explicit shell syntax. Do not use with untrusted command text.
foreign import shell :: String -> Pipeline -> Pipeline
foreign import withWorkdir :: String -> Pipeline -> Pipeline
foreign import withEnv :: String -> String -> Pipeline -> Pipeline
foreign import cache :: String -> Cache
-- | A legacy cache mount, not an explicit host-plan action-cache policy.
foreign import withCache :: String -> Cache -> Pipeline -> Pipeline
foreign import providerImpl :: String -> Boolean -> Pipeline -> Pipeline
-- | Pkgx package installation; requires using Pkgx. Other provider installs use exec.
foreign import withPackages :: Array String -> Pipeline -> Pipeline
foreign import asService :: String -> Pipeline -> Service
foreign import withService :: Service -> Pipeline -> Pipeline
-- | Legacy TCP wait: port and timeout in seconds. Explicit host plans have probes.
foreign import waitOn :: Int -> Int -> Pipeline -> Pipeline
foreign import file :: String -> File
-- | Schedule a literal-argv file copy in the current task working directory.
foreign import copyFile :: String -> File -> Pipeline -> Pipeline
-- | Secret values remain in guest memory until lowered; never serialize pipelines.
foreign import secret :: String -> String -> Secret
foreign import withSecret :: String -> Secret -> Pipeline -> Pipeline
foreign import filePath :: File -> String

foreign import validateImpl :: MakeError -> (PluginError -> Result Unit) -> (Unit -> Result Unit) -> Pipeline -> Result Unit
foreign import runImpl :: Invoke -> MakeError -> (PluginError -> Result String) -> (String -> Result String) -> Boolean -> Pipeline -> Effect (Result String)
foreign import effectImpl :: Invoke -> MakeError -> (PluginError -> Result String) -> (String -> Result String) -> String -> Array String -> Effect (Result String)
foreign import getSecretsImpl :: Invoke -> MakeError -> (PluginError -> Result (Array Secret)) -> (Array Secret -> Result (Array Secret)) -> String -> String -> Effect (Result (Array Secret))

using :: Provider -> Pipeline -> Pipeline
using provider = case provider of
  Native -> providerImpl "default" false
  Nix config -> providerImpl "nix" config.impure
  Devbox -> providerImpl "devbox" false
  Devenv -> providerImpl "devenv" false
  Envhub -> providerImpl "envhub" false
  Flox -> providerImpl "flox" false
  Hermit -> providerImpl "hermit" false
  Mise -> providerImpl "mise" false
  Pixi -> providerImpl "pixi" false
  Pkgx -> providerImpl "pkgx" false
  Proto -> providerImpl "proto" false

validate :: Pipeline -> Result Unit
validate = validateImpl fromWireError Left Right

stdout :: Pipeline -> Effect (Result String)
stdout = runImpl Imports.invoke fromWireError Left Right false

stderr :: Pipeline -> Effect (Result String)
stderr = runImpl Imports.invoke fromWireError Left Right true

perform :: String -> Array String -> Effect (Result String)
perform = effectImpl Imports.invoke fromWireError Left Right

sha256 :: File -> Effect (Result String)
sha256 value = perform "sha256" [filePath value]

md5 :: File -> Effect (Result String)
md5 value = perform "md5" [filePath value]

-- | A nested plugin shares the compatibility graph. Call at an effect boundary.
callModule :: String -> String -> String -> Effect (Result String)
callModule url function argument = perform "call" [url, function, argument]

secretManager :: SecretProvider -> Effect (Result SecretManager)
secretManager provider = map (map SecretManager) $ case provider of
  Aws config -> perform "secretmanager" ["aws", config.region]
  Google config -> perform "secretmanager" ["google", config.project]
  Azure config -> perform "secretmanager" ["azure", config.vaultUrl]
  Hashicorp config -> perform "secretmanager" ["hashicorp", config.address]

getSecrets :: SecretManager -> String -> Effect (Result (Array Secret))
getSecrets (SecretManager manager) = getSecretsImpl Imports.invoke fromWireError Left Right manager

getEnv :: String -> Effect (Result String)
getEnv name = perform "get_env" [name]

hasEnv :: String -> Effect (Result Boolean)
hasEnv name = map (map (_ == "true")) (perform "has_env" [name])

getOS :: Effect (Result String)
getOS = perform "get_os" []

getArch :: Effect (Result String)
getArch = perform "get_arch" []

input :: Effect (Result String)
input = perform "input" []

output :: String -> Effect (Result Unit)
output value = map (map (const unit)) (perform "output" [value])

runPlan :: String -> Host.Plan -> Effect (Result RunResult)
runPlan = Execution.run
