module FluentCI.Host.Client
  ( Client
  , Config
  , Run
  , RunStatus(..)
  , RunState
  , RunPage
  , RunError(..)
  , TaskResult
  , RunResult
  , RunOutcome(..)
  , EventPage
  , LogStream(..)
  , LogPage
  , TaskStatus(..)
  , client
  , runId
  , resumeRun
  , submit
  , submitWithKey
  , status
  , result
  , cancel
  , events
  , logs
  , history
  ) where

import Prelude
import Data.Argonaut.Core (Json)
import Data.Argonaut.Decode (class DecodeJson, decodeJson, JsonDecodeError(..))
import Data.Argonaut.Parser (jsonParser)
import Data.Either (Either(..))
import Data.Maybe (Maybe(..))
import Foreign.Object (Object)
import Effect.Aff (Aff, attempt)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import Effect.Exception (message)
import FluentCI.Host.Plan as Plan

type Config = { baseUrl :: String, token :: String, timeoutMs :: Int }
newtype Client = Client Config
newtype Run = Run String
type RunState = { id :: String, status :: RunStatus, error :: Maybe String, created_at_ms :: Maybe Number }
type RunPage = { runs :: Array RunState, next_cursor :: Maybe String }
data RunStatus = Queued | Running | Succeeded | Failed | Cancelled | Interrupted

derive instance eqRunStatus :: Eq RunStatus
instance showRunStatus :: Show RunStatus where
  show Queued = "queued"
  show Running = "running"
  show Succeeded = "succeeded"
  show Failed = "failed"
  show Cancelled = "cancelled"
  show Interrupted = "interrupted"

instance decodeRunStatus :: DecodeJson RunStatus where
  decodeJson json = do
    value <- decodeJson json
    case value of
      "queued" -> Right Queued
      "running" -> Right Running
      "succeeded" -> Right Succeeded
      "failed" -> Right Failed
      "cancelled" -> Right Cancelled
      "interrupted" -> Right Interrupted
      other -> Left (TypeMismatch ("unknown run status: " <> other))

data TaskStatus = TaskPending | TaskRunning | TaskReady | TaskStopping | TaskSucceeded | TaskFailed | TaskSkipped | TaskCancelled | TaskTimedOut

derive instance eqTaskStatus :: Eq TaskStatus
instance decodeTaskStatus :: DecodeJson TaskStatus where
  decodeJson json = do
    value <- decodeJson json
    case value of
      "pending" -> Right TaskPending
      "running" -> Right TaskRunning
      "ready" -> Right TaskReady
      "stopping" -> Right TaskStopping
      "succeeded" -> Right TaskSucceeded
      "failed" -> Right TaskFailed
      "skipped" -> Right TaskSkipped
      "cancelled" -> Right TaskCancelled
      "timed_out" -> Right TaskTimedOut
      other -> Left (TypeMismatch ("unknown task status: " <> other))

data LogStream = Stdout | Stderr | ProbeStdout | ProbeStderr
type LogPage = { nextCursor :: String, bytes :: Array Int }
type TaskResult =
  { id :: String
  , status :: TaskStatus
  , exit_code :: Maybe Int
  , error :: Maybe String
  , duration_ms :: Number
  , stdout :: String
  , stderr :: String
  , cache :: { outcome :: String, key :: Maybe String, reason :: String }
  , wait_reason :: Maybe String
  , outputs :: Maybe (Object String)
  , artifacts :: Maybe (Object { path :: String, size :: Number, sha256 :: String })
  , attempts :: Maybe (Array { number :: Int, status :: TaskStatus, exit_code :: Maybe Int, duration_ms :: Number, error :: Maybe String })
  , signal :: Maybe Int
  , file_result :: Maybe Json
  , condition_skipped :: Maybe Boolean
  , allowed_failure :: Maybe Boolean
  }

data RunOutcome = RunSucceeded | RunFailed | RunCancelled

derive instance eqRunOutcome :: Eq RunOutcome
instance decodeRunOutcome :: DecodeJson RunOutcome where
  decodeJson json = do
    value <- decodeJson json
    case value of
      "succeeded" -> Right RunSucceeded
      "failed" -> Right RunFailed
      "cancelled" -> Right RunCancelled
      other -> Left (TypeMismatch ("unknown run outcome: " <> other))

type RunResult = { tasks :: Array TaskResult, outcome :: Maybe RunOutcome }
type EventPage = { nextCursor :: String, events :: Array Json }
data RunError = InvalidPlan Plan.PlanError | HttpError Int String | TransportError String | DecodeError String

instance showRunError :: Show RunError where
  show (InvalidPlan error) = show error
  show (HttpError code body) = "HTTP " <> show code <> ": " <> body
  show (TransportError error) = "Transport error: " <> error
  show (DecodeError error) = "Invalid engine response: " <> error

type Response = { status :: Int, body :: String, nextCursor :: String, bytes :: Array Int, idempotencyKey :: String }

foreign import requestWithKeyImpl :: String -> Config -> Boolean -> String -> String -> String -> EffectFnAff Response
foreign import requestImpl :: Config -> Boolean -> String -> String -> String -> EffectFnAff Response
foreign import encodeSegment :: String -> String
foreign import parseEvents :: (String -> Either RunError (Array Json)) -> (Array Json -> Either RunError (Array Json)) -> String -> Either RunError (Array Json)

client :: Config -> Client
client = Client

runId :: Run -> String
runId (Run id) = id

resumeRun :: String -> Run
resumeRun = Run

request :: Boolean -> String -> String -> String -> Client -> Aff (Either RunError Response)
request binary method route body (Client config) = performRequest (requestImpl config binary method route body)

performRequest :: EffectFnAff Response -> Aff (Either RunError Response)
performRequest effect = do
  response <- attempt (fromEffectFnAff effect)
  pure case response of
    Left error -> Left (TransportError (message error))
    Right value | value.status >= 200 && value.status < 300 -> Right value
    Right value -> Left (HttpError value.status value.body)

decode :: forall a. DecodeJson a => String -> Either RunError a
decode body = case jsonParser body of
  Left error -> Left (DecodeError error)
  Right json -> case decodeJson json of
    Left error -> Left (DecodeError (show error))
    Right value -> Right value

submit :: Plan.Plan -> Client -> Aff (Either RunError Run)
submit plan engine = case Plan.compile plan of
  Left error -> pure (Left (InvalidPlan error))
  Right body -> do
    response <- request false "POST" "/v1/runs" body engine
    pure do
      value <- response
      state <- decode value.body :: Either RunError RunState
      pure (Run state.id)

-- Retain the same key and immutable plan when retrying an ambiguous submission.
submitWithKey :: String -> Plan.Plan -> Client -> Aff (Either RunError Run)
submitWithKey key plan (Client config) = case Plan.compile plan of
  Left error -> pure (Left (InvalidPlan error))
  Right body -> do
    response <- performRequest (requestWithKeyImpl key config false "POST" "/v1/runs" body)
    pure do
      value <- response
      if value.idempotencyKey /= key then
        Left (DecodeError "engine did not acknowledge idempotency; submission may have been accepted, do not retry automatically")
      else do
        state <- decode value.body :: Either RunError RunState
        pure (Run state.id)

path :: Run -> String
path (Run id) = "/v1/runs/" <> encodeSegment id

history :: Int -> Maybe String -> Client -> Aff (Either RunError RunPage)
history limit cursor engine = do
  let
    suffix = case cursor of
      Nothing -> ""
      Just value -> "&before=" <> encodeSegment value
  response <- request false "GET" ("/v1/runs?limit=" <> show limit <> suffix) "" engine
  pure (response >>= \value -> decode value.body)

status :: Run -> Client -> Aff (Either RunError RunState)
status run engine = do
  response <- request false "GET" (path run) "" engine
  pure (response >>= \value -> decode value.body)

result :: Run -> Client -> Aff (Either RunError RunResult)
result run engine = do
  response <- request false "GET" (path run <> "/result") "" engine
  pure (response >>= \value -> decode value.body)

cancel :: Run -> Client -> Aff (Either RunError Unit)
cancel run engine = map (map (const unit)) (request false "POST" (path run <> "/cancel") "" engine)

events :: String -> Run -> Client -> Aff (Either RunError EventPage)
events cursor run engine = do
  response <- request false "GET" (path run <> "/events?cursor=" <> encodeSegment cursor) "" engine
  pure do
    value <- response
    decoded <- parseEvents (Left <<< DecodeError) Right value.body
    pure { nextCursor: value.nextCursor, events: decoded }

-- Bytes are lossless, unlike the UTF-8 display text in journal events.
logs :: LogStream -> Int -> String -> Run -> Client -> Aff (Either RunError LogPage)
logs stream index cursor run engine = do
  let
    name = case stream of
      Stdout -> "stdout"
      Stderr -> "stderr"
      ProbeStdout -> "probe_stdout"
      ProbeStderr -> "probe_stderr"
  response <- request true "GET" (path run <> "/logs/" <> show index <> "/" <> name <> "?cursor=" <> encodeSegment cursor) "" engine
  pure (map (\value -> { nextCursor: value.nextCursor, bytes: value.bytes }) response)
