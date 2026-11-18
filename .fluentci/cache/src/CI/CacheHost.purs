module CI.CacheHost where

import Prelude
import Control.Promise (Promise, toAffE)
import Data.Array as A
import Data.Either (Either(..), either)
import Data.Foldable (for_)
import Data.Int as Int
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Set (Set)
import Data.Set as Set
import Data.String as S
import Data.String.Pattern (Pattern(..))
import Data.Traversable (traverse)
import Effect (Effect)
import Effect.Aff (Aff, attempt, bracket, forkAff, joinFiber, throwError, catchError)
import Effect.Class (liftEffect)
import Effect.Exception (Error, error, throw)
import Effect.Ref as Ref

foreign import data Env :: Type
foreign import data Hooks :: Type
foreign import data Controller :: Type
foreign import data Response :: Type

type Config = { cache :: String, publicKey :: String, token :: String, signingKey :: String, nixEnv :: Env }
type UrlParts = { protocol :: String, username :: String, password :: String, pathname :: String, search :: String, hash :: String }
type PathInfo = { path :: String, signatures :: Array String }
type Timings = { lookup :: Number, export :: Number, upload :: Number }
type State = { published :: Set String, reused :: Set String, known :: Set String, outcome :: Maybe (Either Error String), timings :: Timings }

foreign import envValue :: Env -> String -> String
foreign import envForNix :: Env -> String -> Env
foreign import matches :: String -> String -> Boolean
foreign import urlParts :: String -> Effect UrlParts
foreign import decodePart :: String -> Effect String
foreign import deriveKey :: String -> Effect { publicKey :: String, embeddedMatches :: Boolean }
foreign import log :: String -> Effect Unit
foreign import clock :: Effect Number
foreign import temporaryRoot :: String
foreign import pathJoin :: Array String -> String
foreign import fileUrl :: String -> Array { key :: String, value :: String } -> String
foreign import tempDir :: String -> Effect (Promise String)
foreign import makeDir :: String -> Effect (Promise Unit)
foreign import removeDir :: String -> Effect (Promise Unit)
foreign import writeText :: String -> String -> Boolean -> Effect (Promise Unit)
foreign import readText :: String -> Effect (Promise String)
foreign import listDir :: String -> Effect (Promise (Array String))
foreign import fileSize :: String -> Effect (Promise Number)
foreign import controller :: Effect Controller
foreign import noController :: Controller
foreign import abort :: Controller -> Effect Unit
foreign import errorName :: Error -> String
foreign import errorCode :: Error -> String
foreign import wait :: Hooks -> Number -> Effect (Promise Unit)
foreign import run :: Hooks -> String -> Array String -> Env -> Boolean -> Controller -> Effect (Promise String)
foreign import hasLookup :: Hooks -> Boolean
foreign import invokeLookup :: Hooks -> String -> Array String -> String -> Effect (Promise (Array String))
foreign import invokeUpload :: Hooks -> String -> String -> String -> Array String -> Effect (Promise Unit)
foreign import fetchGet :: Hooks -> String -> Number -> Effect (Promise Response)
foreign import responseStatus :: Response -> Int
foreign import responseHeader :: Response -> String -> String
foreign import responseText :: Response -> Number -> Effect (Promise String)
foreign import cancelBody :: Response -> Effect (Promise Unit)
foreign import putStream :: Hooks -> String -> String -> String -> Number -> Effect (Promise { status :: Int, retryAfter :: String })
foreign import headerDelay :: String -> Number -> Number
foreign import pathInfos :: String -> Effect (Array PathInfo)
foreign import buildRoots :: String -> Effect (Array String)

ensure :: Boolean -> String -> Effect Unit
ensure valid reason = unless valid (throw reason)

ensureA :: Boolean -> String -> Aff Unit
ensureA valid reason = liftEffect (ensure valid reason)

trimSlash :: String -> String
trimSlash value = fromMaybe value (S.stripSuffix (Pattern "/") value)

part :: Int -> Array String -> String
part index values = fromMaybe "" (A.index values index)

configuration :: Env -> Effect Config
configuration env = do
  let base = envValue env "FLUENTCI_CACHE_URL"
  let publicKey = envValue env "FLUENTCI_NIX_PUBLIC_KEY"
  let token = envValue env "FLUENTCI_CACHE_TOKEN"
  let signingKey = envValue env "FLUENTCI_NIX_SIGNING_KEY"
  ensure ((base == "") == (publicKey == "")) "Set both FLUENTCI_CACHE_URL and FLUENTCI_NIX_PUBLIC_KEY"
  ensure ((token == "") == (signingKey == "")) "Signed uploads require both FLUENTCI_CACHE_TOKEN and FLUENTCI_NIX_SIGNING_KEY"
  ensure (token == "" || base /= "") "Upload credentials require cache URL and public key"
  when (base /= "") do
    url <- urlParts base
    let segments = A.drop 1 (S.split (Pattern "/") (trimSlash url.pathname))
    actor <- decodePart (part 0 segments)
    let
      validAccount = (A.length segments == 2 && part 0 segments == "accounts" && matches "^[a-f0-9]{64}$" (part 1 segments)) ||
        (A.length segments == 1 && (matches "^did:plc:[a-z2-7]{24}$" actor || matches "^did:web:[A-Za-z0-9._:%-]+$" actor || matches "^@?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$" actor))
    ensure (url.protocol == "https:" && url.username == "" && url.password == "" && url.search == "" && url.hash == "" && validAccount) "FLUENTCI_CACHE_URL must be an HTTPS account URL without /nix"
    ensure (matches "^[\\w.-]+:[A-Za-z0-9+/]{43}=$" publicKey) "FLUENTCI_NIX_PUBLIC_KEY must contain the full Nix public key"
  when (signingKey /= "") do
    ensure (matches "^[\\w.-]+:[A-Za-z0-9+/]{86}==$" signingKey) "FLUENTCI_NIX_SIGNING_KEY must contain a Nix private key, not a path"
    let pieces = S.split (Pattern ":") signingKey
    derived <- deriveKey (part 1 pieces)
    ensure (part 0 pieces <> ":" <> derived.publicKey == publicKey && derived.embeddedMatches) "Nix signing key does not match FLUENTCI_NIX_PUBLIC_KEY"
    ensure (not (matches "[\\r\\n]" token)) "Invalid upload token"
  let cache = if base == "" then "" else trimSlash base <> "/nix"
  let nixConfig = if cache == "" then "" else envValue env "NIX_CONFIG" <> "\nhttp-connections = 16\nsubstitute = true\nnarinfo-cache-negative-ttl = 0\nalways-allow-substitutes = true\nextra-substituters = " <> cache <> "\nextra-trusted-public-keys = " <> publicKey
  pure { cache, publicKey, token, signingKey, nixEnv: envForNix env nixConfig }

chunks :: forall a. Int -> Array a -> Array (Array a)
chunks size values = if A.null values then [] else [ A.take size values ] <> chunks size (A.drop size values)

unique :: Array String -> Array String
unique = Set.toUnfoldable <<< Set.fromFoldable

parallelAll :: forall a. Array (Aff a) -> Aff (Array a)
parallelAll actions = do
  fibers <- traverse (forkAff <<< attempt) actions
  results <- traverse joinFiber fibers
  case A.findMap (either Just (const Nothing)) results of
    Just failure -> throwError failure
    Nothing -> pure (A.mapMaybe (either (const Nothing) Just) results)

basename :: String -> String
basename value = fromMaybe value (A.last (S.split (Pattern "/") value))

narinfoName :: String -> String
narinfoName path = part 0 (S.split (Pattern "-") (basename path)) <> ".narinfo"

field :: String -> String -> String
field key text = S.trim $ fromMaybe "" $ A.findMap (S.stripPrefix (Pattern (key <> ": "))) (S.split (Pattern "\n") text)

success :: Int -> Boolean
success status = status >= 200 && status < 300

retryableStatus :: Int -> Boolean
retryableStatus status = A.elem status [ 408, 425, 429, 500, 502, 503, 504 ]

transportError :: Error -> Boolean
transportError failure = A.elem (errorName failure) [ "TypeError", "TimeoutError", "AbortError" ] || A.elem (errorCode failure) [ "ECONNRESET", "ETIMEDOUT", "EPIPE" ]

uploadFile :: Hooks -> String -> String -> String -> Int -> Number -> Aff Unit
uploadFile hooks path url token maxAttempts timeoutMs = loop 1 1000.0
  where
  loop index backoff = do
    result <- attempt (toAffE (putStream hooks path url token timeoutMs))
    now <- liftEffect clock
    let
      outcome = case result of
        Right response -> { ok: success response.status, retry: retryableStatus response.status, after: headerDelay response.retryAfter now, reason: "HTTP " <> show response.status }
        Left failure -> { ok: false, retry: transportError failure, after: 0.0, reason: errorName failure }
    unless outcome.ok do
      let reason = "Cache upload failed for " <> basename path <> ": " <> outcome.reason
      if outcome.retry && index < maxAttempts then do
        let pause = min 30000.0 (max backoff outcome.after)
        liftEffect (log (reason <> "; retrying (" <> show index <> "/" <> show (maxAttempts - 1) <> ")"))
        toAffE (wait hooks pause)
        loop (index + 1) (backoff * 2.0)
      else throwError (error reason)

uploadFiles :: Hooks -> String -> String -> String -> Array String -> Int -> Number -> Aff Unit
uploadFiles hooks directory cache token metadata maxAttempts timeoutMs = do
  payloads <- map (map ("nar/" <> _)) (toAffE (listDir (pathJoin [ directory, "nar" ])))
  allFiles <- toAffE (listDir directory)
  let infos = if A.null metadata then A.filter (matches "\\.narinfo$") allFiles else metadata
  for_ [ payloads, infos ] \files -> for_ (chunks 16 files) \group -> do
    void $ parallelAll $ map (\file -> uploadFile hooks (pathJoin [ directory, file ]) (cache <> "/" <> file) token maxAttempts timeoutMs) group

requireSignatures :: String -> String -> Array String -> Aff Unit
requireSignatures directory publicKey metadata = do
  allFiles <- if A.null metadata then toAffE (listDir directory) else pure metadata
  let files = A.filter (matches "\\.narinfo$") allFiles
  let key = part 0 (S.split (Pattern ":") publicKey)
  ensureA (not (A.null files)) "Nix export contains no signed metadata"
  for_ files \file -> do
    text <- toAffE (readText (pathJoin [ directory, file ]))
    let signatures = A.mapMaybe (S.stripPrefix (Pattern ("Sig: " <> key <> ":"))) (S.split (Pattern "\n") text)
    ensureA (A.any (matches "^[A-Za-z0-9+/]{86}==$" <<< S.trim) signatures) ("Refusing unsigned Nix metadata: " <> file)

lookupResponse :: Hooks -> String -> Aff Response
lookupResponse hooks url = loop 0
  where
  loop index = do
    result <- attempt (toAffE (fetchGet hooks url 15000.0))
    case result of
      Right response | retryableStatus (responseStatus response) && index < 2 -> do
        toAffE (cancelBody response)
        toAffE (wait hooks (250.0 * Int.toNumber (index + 1)))
        loop (index + 1)
      Right response -> pure response
      Left _ | index < 2 -> do
        toAffE (wait hooks 250.0)
        loop (index + 1)
      Left _ -> throwError (error "Cache availability lookup failed")

seedAvailablePaths :: Hooks -> String -> Array String -> String -> Aff (Array String)
seedAvailablePaths hooks directory paths cache = do
  groups <- traverse (parallelAll <<< map lookupPath) (chunks 24 (unique paths))
  pure (A.catMaybes (A.concat groups))
  where
  lookupPath path = do
    let name = narinfoName path
    ensureA (matches "^[0-9a-z]{32}\\.narinfo$" name) "Invalid Nix store path"
    findRemote path name [ "https://cache.nixos.org", cache ]
  findRemote path name bases = case A.uncons bases of
    Nothing -> pure Nothing
    Just { head: base, tail: rest } -> do
      response <- lookupResponse hooks (base <> "/" <> name)
      if responseStatus response == 404 then do
        toAffE (cancelBody response)
        findRemote path name rest
      else do
        ensureA (success (responseStatus response)) ("Cache availability lookup failed: HTTP " <> show (responseStatus response))
        text <- toAffE (responseText response 4194304.0)
        ensureA (S.length text <= 4194304 && field "StorePath" text == path) "Cache returned invalid store metadata"
        toAffE (writeText (pathJoin [ directory, name ]) text false)
        pure (Just path)

seconds :: Number -> String
seconds value = show (Int.round (value / 1000.0))

storePaths :: String -> Array String
storePaths text = A.filter (_ /= "") (S.split (Pattern "\n") (S.trim text))

build :: Hooks -> Env -> String -> Number -> Aff Unit
build hooks env target pollIntervalMs = do
  ensureA (S.trim target /= "" && not (matches "[\\r\\n\\x00]" target)) "Set a valid Nix installable"
  ensureA (envValue env "FLUENTCI_CACHE_TOKEN" /= "") "Set FLUENTCI_CACHE_TOKEN"
  ensureA (envValue env "FLUENTCI_CACHE_URL" /= "") "Set FLUENTCI_CACHE_URL"
  config <- liftEffect (configuration env)
  liftEffect (log (if config.cache == "" then "No FluentCI cache configured; using default Nix substituters" else "Nix cache: " <> config.cache))
  let execute program args capture = toAffE (run hooks program args config.nixEnv capture noController)
  let buildArgs = [ "build", "--no-write-lock-file", "--json", "--", target ]
  if config.token == "" then do
    void (execute "nix" buildArgs true)
    liftEffect (log "No upload credentials; cache is read-only")
  else do
    let root = envValue env "RUNNER_TEMP"
    bracket (toAffE (tempDir (if root == "" then temporaryRoot else root))) (toAffE <<< removeDir) \directory -> do
      let keyPath = pathJoin [ directory, "signing.key" ]
      let exportDir = pathJoin [ directory, "cache" ]
      toAffE (writeText keyPath (config.signingKey <> "\n") true)
      toAffE (makeDir exportDir)
      state <- liftEffect $ Ref.new { published: Set.empty, reused: Set.empty, known: Set.empty, outcome: Nothing, timings: { lookup: 0.0, export: 0.0, upload: 0.0 } }
      let verify trusted paths = for_ (chunks 100 paths) \batch -> void $ execute "nix" ([ "store", "verify", "--store", fileUrl exportDir [], "--no-contents", "--sigs-needed", "1" ] <> trusted <> batch) false
      let
        publish candidates = for_ (chunks 100 (unique (A.filter (not <<< matches "\\.drv$") candidates))) \batch -> do
          current <- liftEffect (Ref.read state)
          let fresh = A.filter (\path -> not (Set.member path current.published || Set.member path current.reused)) batch
          unless (A.null fresh) do
            infos <- execute "nix" ([ "path-info", "--json" ] <> fresh) true >>= liftEffect <<< pathInfos
            let paths = map _.path (A.filter (A.null <<< _.signatures) infos)
            unless (A.null paths) do
              closure <- map storePaths (execute "nix-store" ([ "--query", "--requisites" ] <> paths) true)
              lookupStart <- liftEffect clock
              present <-
                if hasLookup hooks then toAffE (invokeLookup hooks exportDir closure config.cache)
                else seedAvailablePaths hooks exportDir (A.filter (\path -> not (Set.member (narinfoName path) current.known) && not (matches "\\.drv$" path)) closure) config.cache
              unless (A.null present) do
                verify [] present
                liftEffect $ Ref.modify_ (\s -> s { reused = Set.union s.reused (Set.fromFoldable present), known = Set.union s.known (Set.fromFoldable (map narinfoName present)) }) state
                liftEffect (log ("Reused " <> show (A.length present) <> " paths already in an upstream or FluentCI cache"))
              lookupEnd <- liftEffect clock
              liftEffect $ Ref.modify_ (\s -> s { timings = s.timings { lookup = s.timings.lookup + lookupEnd - lookupStart } }) state
              updated <- liftEffect (Ref.read state)
              let pending = A.filter (\path -> not (Set.member path updated.reused)) paths
              unless (A.null pending) do
                exportStart <- liftEffect clock
                let destination = fileUrl exportDir [ { key: "secret-key", value: keyPath }, { key: "compression", value: "zstd" }, { key: "compression-level", value: "3" }, { key: "parallel-compression", value: "false" } ]
                void $ execute "nix" ([ "copy", "--to", destination ] <> pending) false
                files <- toAffE (listDir exportDir)
                let metadata = A.filter (\file -> matches "\\.narinfo$" file && not (Set.member file updated.known)) files
                unless (A.null metadata) do
                  texts <- traverse (toAffE <<< readText <<< pathJoin <<< (\file -> [ exportDir, file ])) metadata
                  let exported = map (field "StorePath") texts
                  ensureA (A.all (_ /= "") exported) "Invalid exported Nix metadata"
                  requireSignatures exportDir config.publicKey metadata
                  verify [ "--trusted-public-keys", config.publicKey ] exported
                  uploadStart <- liftEffect clock
                  toAffE (invokeUpload hooks exportDir config.cache config.token metadata)
                  uploadEnd <- liftEffect clock
                  liftEffect $ Ref.modify_ (\s -> s { published = Set.union s.published (Set.fromFoldable exported), known = Set.union s.known (Set.fromFoldable metadata), timings = s.timings { export = s.timings.export + uploadStart - exportStart, upload = s.timings.upload + uploadEnd - uploadStart } }) state
                  toAffE (removeDir (pathJoin [ exportDir, "nar" ]))
                  toAffE (makeDir (pathJoin [ exportDir, "nar" ]))
                  liftEffect (log ("Published " <> show (A.length exported) <> " signed paths"))
      seen <- execute "nix" [ "path-info", "--all" ] true >>= liftEffect <<< Ref.new <<< Set.fromFoldable <<< storePaths
      control <- liftEffect controller
      started <- liftEffect clock
      fiber <- forkAff do
        outcome <- attempt (toAffE (run hooks "nix" buildArgs config.nixEnv true control))
        liftEffect $ Ref.modify_ (_ { outcome = Just outcome }) state
        now <- liftEffect clock
        liftEffect (log ("Nix build finished after " <> seconds (now - started) <> "s; draining cache uploads"))
      let
        scan = do
          current <- map storePaths (execute "nix" [ "path-info", "--all" ] true)
          before <- liftEffect (Ref.read seen)
          liftEffect (Ref.write (Set.union before (Set.fromFoldable current)) seen)
          publish (A.filter (\path -> not (Set.member path before)) current)
      let
        watch = do
          scan
          current <- liftEffect (Ref.read state)
          case current.outcome of
            Nothing -> toAffE (wait hooks pollIntervalMs) *> watch
            Just _ -> pure unit
      liftEffect (log "Watching Nix store; publishing new paths during the build")
      let
        finish = do
          watch
          joinFiber fiber
          scan
          current <- liftEffect (Ref.read state)
          case current.outcome of
            Just (Left failure) -> throwError failure
            Just (Right output) -> do
              roots <- liftEffect (buildRoots output)
              unless (A.null roots) do
                closure <- map storePaths (execute "nix-store" ([ "--query", "--requisites", "--include-outputs" ] <> roots) true)
                publish closure
            Nothing -> throwError (error "Missing Nix build result")
          summary <- liftEffect (Ref.read state)
          liftEffect $ log ("Nix cache uploads complete: " <> show (Set.size summary.published) <> " published, " <> show (Set.size summary.reused) <> " reused; lookup " <> seconds summary.timings.lookup <> "s, export/verify " <> seconds summary.timings.export <> "s, upload " <> seconds summary.timings.upload <> "s")
      catchError finish \failure -> do
        liftEffect (abort control)
        joinFiber fiber
        throwError failure
