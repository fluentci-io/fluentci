module FluentCI.Host.Plan
  ( Task
  , Plan
  , Workspace
  , CachePolicy
  , Probe
  , Service
  , PlanError(..)
  , Provider
  , ProviderKind(..)
  , Condition(..)
  , RetryPolicy
  , OutputRef
  , retry
  , when
  , always
  , allowFailure
  , artifact
  , output
  , outputEnv
  , resource
  , task
  , withPrimitive
  , withFileOperation
  , envFile
  , taskId
  , withId
  , after
  , withArgs
  , needs
  , withEnv
  , withResources
  , withTimeout
  , withResourceWaitTimeout
  , withCache
  , withRelocatableCache
  , withToolchainFiles
  , asService
  , asServiceWithHealth
  , service
  , plan
  , withJobs
  , withMaxServices
  , withFailFast
  , withInheritedEnv
  , withCacheDirectory
  , withWorkspace
  , withResourceDirectory
  , withSharedResources
  , provider
  , withProviderExecutable
  , install
  , withPackageEnvironment
  , validate
  , compile
  ) where

import FluentCI.Host.Primitive (Operation)
import Prelude hiding (when)
import Control.Applicative as Applicative
import Data.Argonaut.Core (Json, stringify)
import Data.Argonaut.Encode (class EncodeJson, encodeJson)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Maybe (Maybe(..), isNothing, fromMaybe)
import Data.Tuple (Tuple(..))
import Foreign.Object as Object

type Workspace = { source :: String, inputs :: Array String }
type CachePolicy = { inputs :: Array String, outputs :: Array String, toolchain :: String }
type EncodedCachePolicy = { inputs :: Array String, outputs :: Array String, toolchain :: String, relocatable :: Boolean, toolchain_files :: Array String }
type Probe = { program :: String, args :: Array String, interval_ms :: Int, timeout_ms :: Int }
type Service = { readiness :: Probe, startup_timeout_ms :: Int, shutdown_timeout_ms :: Int, failure_threshold :: Int }
type EncodedService = { readiness :: Probe, health :: Maybe Probe, startup_timeout_ms :: Int, shutdown_timeout_ms :: Int, failure_threshold :: Int }
data ProviderKind = Homebrew | MacPortsNative | MacPortsRust | FreeBSD | NetBSD | OpenBSD
newtype Provider = Provider { manager :: String, backend :: String, executable :: Maybe String }

derive newtype instance encodeProvider :: EncodeJson Provider
type Install = { provider :: Provider, packages :: Array String }

provider :: ProviderKind -> Provider
provider kind = case kind of
  Homebrew -> make "homebrew" "native"
  MacPortsNative -> make "macports" "native"
  MacPortsRust -> make "macports" "rust"
  FreeBSD -> make "freebsd" "native"
  NetBSD -> make "netbsd" "native"
  OpenBSD -> make "openbsd" "native"
  where
  make manager backend = Provider { manager, backend, executable: Nothing }

withProviderExecutable :: String -> Provider -> Provider
withProviderExecutable executable (Provider value) = Provider (value { executable = Just executable })

data Condition = OnSuccess | OnFailure | Always | Never

derive instance eqCondition :: Eq Condition
instance encodeCondition :: EncodeJson Condition where
  encodeJson condition = encodeJson case condition of
    OnSuccess -> "success"
    OnFailure -> "failure"
    Always -> "always"
    Never -> "never"

type RetryPolicy = { max_attempts :: Int, delay_ms :: Int, max_delay_ms :: Int, exit_codes :: Array Int }
type OutputRef = { task :: String, name :: String }
type Policy =
  { when :: Condition
  , retry :: Maybe RetryPolicy
  , allow_failure :: Boolean
  , outputs :: Object.Object String
  , artifacts :: Object.Object String
  , bindings :: Object.Object OutputRef
  }

defaultPolicy :: Policy
defaultPolicy = { when: OnSuccess, retry: Nothing, allow_failure: false, outputs: Object.empty, artifacts: Object.empty, bindings: Object.empty }

type Environment = Array { key :: String, value :: String }
newtype Task = Task
  { id :: String
  , needs :: Array String
  , program :: String
  , args :: Array String
  , primitive :: Maybe Operation
  , file_operation :: Maybe Json
  , env_files :: Array String
  , cwd :: String
  , env :: Environment
  , resources :: Array String
  , shared_resources :: Array String
  , package_install :: Maybe Install
  , package_environment :: Array Provider
  , timeout_ms :: Maybe Int
  , resource_wait_timeout_ms :: Maybe Int
  , cache :: Maybe EncodedCachePolicy
  , service :: Maybe EncodedService
  , policy :: Maybe Policy
  }

newtype Plan = Plan
  { version :: Int
  , tasks :: Array Task
  , jobs :: Int
  , max_services :: Int
  , inherit_env :: Boolean
  , fail_fast :: Boolean
  , cache_dir :: Maybe String
  , resource_dir :: Maybe String
  , workspace :: Maybe Workspace
  }

-- Preserve arbitrary environment keys, including JavaScript prototype names.
foreign import environmentJson :: Environment -> Json
foreign import omitUnusedFields :: Json -> Json

instance encodeTask :: EncodeJson Task where
  encodeJson (Task value) = omitUnusedFields (encodeJson (value { env = environmentJson value.env }))

instance encodePlan :: EncodeJson Plan where
  encodeJson (Plan value) = omitUnusedFields (encodeJson value)

data PlanError = EmptyTaskId | DuplicateTaskIds | MissingDependency String | InvalidCommand String | InvalidLimits

derive instance eqPlanError :: Eq PlanError
instance showPlanError :: Show PlanError where
  show EmptyTaskId = "A task has an empty ID"
  show DuplicateTaskIds = "Task IDs must be unique"
  show (MissingDependency id) = "Missing dependency: " <> id
  show (InvalidCommand id) = "Task requires a program and working directory: " <> id
  show InvalidLimits = "Execution limits must be positive"

task :: String -> String -> String -> Task
task id program cwd = Task
  { id
  , program
  , cwd
  , needs: []
  , args: []
  , env: []
  , resources: []
  , shared_resources: []
  , primitive: Nothing
  , file_operation: Nothing
  , env_files: []
  , package_install: Nothing
  , package_environment: []
  , timeout_ms: Nothing
  , resource_wait_timeout_ms: Nothing
  , cache: Nothing
  , service: Nothing
  , policy: Nothing
  }

withFileOperation :: Json -> Task -> Task
withFileOperation operation (Task value) = Task (value { file_operation = Just operation })

envFile :: String -> Task -> Task
envFile path (Task value) = Task (value { env_files = value.env_files <> [ path ] })

modifyPolicy :: (Policy -> Policy) -> Task -> Task
modifyPolicy update (Task value) = Task (value { policy = Just (update (fromMaybe defaultPolicy value.policy)) })

retry :: Int -> Int -> Task -> Task
retry attempts delay = modifyPolicy (\policy -> policy { retry = Just { max_attempts: attempts, delay_ms: delay, max_delay_ms: 60000, exit_codes: [] } })

when :: Condition -> Task -> Task
when condition original = case modifyPolicy (\policy -> policy { when = condition }) original of
  Task value | condition == Always || condition == OnFailure -> Task (value { timeout_ms = Just (fromMaybe 30000 value.timeout_ms), resource_wait_timeout_ms = Just (fromMaybe 30000 value.resource_wait_timeout_ms) })
  value -> value

always :: Task -> Task
always = when Always

allowFailure :: Boolean -> Task -> Task
allowFailure enabled = modifyPolicy (\policy -> policy { allow_failure = enabled })

artifact :: String -> String -> Task -> Task
artifact name path = modifyPolicy (\policy -> policy { artifacts = Object.insert name path policy.artifacts })

output :: String -> String -> Task -> Task
output name path = modifyPolicy (\policy -> policy { outputs = Object.insert name path policy.outputs })

outputEnv :: String -> Task -> String -> Task -> Task
outputEnv key producer name task = task # after [ producer ] # modifyPolicy (\policy -> policy { bindings = Object.insert key { task: taskId producer, name } policy.bindings })

resource :: String -> Task -> Task
resource name (Task value) = Task (value { resources = Array.nub (value.resources <> [ name ]) })

taskId :: Task -> String
taskId (Task value) = value.id

withId :: String -> Task -> Task
withId id (Task value) = Task (value { id = id })

after :: Array Task -> Task -> Task
after parents (Task value) = Task (value { needs = Array.nub (value.needs <> map taskId parents) })

withArgs :: Array String -> Task -> Task
withArgs args (Task value) = Task (value { args = args })

needs :: Array Task -> Task -> Task
needs dependencies (Task value) = Task (value { needs = map taskId dependencies })

withEnv :: String -> String -> Task -> Task
withEnv key value (Task old) = Task (old { env = Array.filter (\entry -> entry.key /= key) old.env <> [ { key, value } ] })

withResources :: Array String -> Task -> Task
withResources resources (Task value) = Task (value { resources = resources })

withSharedResources :: Array String -> Task -> Task
withSharedResources shared (Task value) = Task (value { shared_resources = shared })

install :: String -> String -> Provider -> Array String -> Task
install id cwd selected packages = case task id "" cwd of
  Task value -> Task (value { package_install = Just { provider: selected, packages } })

withPackageEnvironment :: Array Provider -> Task -> Task
withPackageEnvironment providers (Task value) = Task (value { package_environment = providers })

withTimeout :: Int -> Task -> Task
withTimeout milliseconds (Task value) = Task (value { timeout_ms = Just milliseconds })

withResourceWaitTimeout :: Int -> Task -> Task
withResourceWaitTimeout milliseconds (Task value) = Task (value { resource_wait_timeout_ms = Just milliseconds })

withCache :: CachePolicy -> Task -> Task
withCache cache (Task value) = Task (value { cache = Just { inputs: cache.inputs, outputs: cache.outputs, toolchain: cache.toolchain, relocatable: false, toolchain_files: [] } })

-- Requires outputs and logs to be independent of the physical working directory.
withRelocatableCache :: CachePolicy -> Task -> Task
withRelocatableCache cache (Task value) = Task (value { cache = Just { inputs: cache.inputs, outputs: cache.outputs, toolchain: cache.toolchain, relocatable: true, toolchain_files: [] } })

-- Apply after withCache/withRelocatableCache; retains the task's cache policy.
withToolchainFiles :: Array String -> Task -> Task
withToolchainFiles files (Task value) = Task (value { cache = map (\cache -> cache { toolchain_files = files }) value.cache })

asService :: Service -> Task -> Task
asService config (Task value) = Task (value { service = Just (encodeService Nothing config) })

asServiceWithHealth :: Probe -> Service -> Task -> Task
asServiceWithHealth health config (Task value) = Task (value { service = Just (encodeService (Just health) config) })

encodeService :: Maybe Probe -> Service -> EncodedService
encodeService health config = { readiness: config.readiness, health, startup_timeout_ms: config.startup_timeout_ms, shutdown_timeout_ms: config.shutdown_timeout_ms, failure_threshold: config.failure_threshold }

service :: Probe -> Service
service readiness = { readiness, startup_timeout_ms: 30000, shutdown_timeout_ms: 5000, failure_threshold: 3 }

plan :: Array Task -> Plan
plan tasks = Plan { version: 1, tasks, jobs: 1, max_services: 8, inherit_env: false, fail_fast: true, cache_dir: Nothing, resource_dir: Nothing, workspace: Nothing }

withJobs :: Int -> Plan -> Plan
withJobs jobs (Plan value) = Plan (value { jobs = jobs })

withMaxServices :: Int -> Plan -> Plan
withMaxServices limit (Plan value) = Plan (value { max_services = limit })

withFailFast :: Boolean -> Plan -> Plan
withFailFast enabled (Plan value) = Plan (value { fail_fast = enabled })

-- | Opt into the host environment for uncached native tool orchestration.
-- | Action-cached tasks still require explicit environments.
withInheritedEnv :: Boolean -> Plan -> Plan
withInheritedEnv enabled (Plan value) = Plan (value { inherit_env = enabled })

withCacheDirectory :: String -> Plan -> Plan
withCacheDirectory directory (Plan value) = Plan (value { cache_dir = Just directory })

withWorkspace :: Workspace -> Plan -> Plan
withWorkspace workspace (Plan value) = Plan (value { workspace = Just workspace })

withResourceDirectory :: String -> Plan -> Plan
withResourceDirectory directory (Plan value) = Plan (value { resource_dir = Just directory })

-- Pure structural checks. The engine also validates cycles, filesystem paths,
-- cache contracts, and service/resource constraints before starting commands.
validate :: Plan -> Either PlanError Unit
validate (Plan value) = do
  Applicative.when (value.jobs <= 0 || value.max_services <= 0) (Left InvalidLimits)
  let ids = map taskId value.tasks
  Applicative.when (Array.elem "" ids) (Left EmptyTaskId)
  let index = Object.fromFoldable (map (\id -> Tuple ("$" <> id) unit) ids)
  Applicative.when (Array.length (Object.keys index) /= Array.length ids) (Left DuplicateTaskIds)
  case Array.find (\id -> not (Object.member ("$" <> id) index)) (Array.concatMap (\(Task t) -> t.needs) value.tasks) of
    Just missing -> Left (MissingDependency missing)
    Nothing -> Right unit
  case Array.find (\(Task t) -> (t.program == "" && isNothing t.package_install && isNothing t.file_operation && isNothing t.primitive) || t.cwd == "") value.tasks of
    Just (Task invalid) -> Left (InvalidCommand invalid.id)
    Nothing -> Right unit
  Applicative.when (not (Array.null (Array.filter (\(Task t) -> maybeInvalid t.timeout_ms || maybeInvalid t.resource_wait_timeout_ms) value.tasks))) (Left InvalidLimits)
  where
  maybeInvalid Nothing = false
  maybeInvalid (Just milliseconds) = milliseconds <= 0

compile :: Plan -> Either PlanError String
compile value = do
  validate value
  pure (stringify (encodeJson value))

withPrimitive :: Operation -> Task -> Task
withPrimitive operation (Task value) = Task (value { primitive = Just operation })
