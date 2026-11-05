-- | Named typed cases expanded into ordinary host tasks. No execution during construction.
module FluentCI.Matrix
  ( Case, MatrixError(..), named, axis, product, include, exclude, matrix, after, parallel ) where

import Prelude
import Data.Array as Array
import Data.Either (Either(..))
import Data.Tuple (Tuple(..))
import FluentCI.Host.Plan as H

type Case a = { key :: String, value :: a }
data MatrixError = InvalidName | TooManyCases | DuplicateOrEmptyCase
derive instance eqMatrixError :: Eq MatrixError
instance showMatrixError :: Show MatrixError where
  show InvalidName = "Matrix name requires 1..64 ASCII letters, digits, '.', '_' or '-'"
  show TooManyCases = "Matrix expansion exceeds 4096 cases"
  show DuplicateOrEmptyCase = "Matrix case keys must be unique and nonempty without NUL"

foreign import component :: String -> String
foreign import validName :: String -> Boolean
foreign import validKey :: String -> Boolean

named :: forall a. String -> a -> Case a
named name value = { key: component name, value }
axis :: String -> Array String -> Array (Case String)
axis name = map (\value -> { key: component name <> "=" <> component value, value })
product :: forall a b. Array (Case a) -> Array (Case b) -> Either MatrixError (Array (Case (Tuple a b)))
product left right
  | Array.null left || Array.null right = Right []
  | Array.length left > 4096 || Array.length right > 4096 || Array.length left * Array.length right > 4096 = Left TooManyCases
  | otherwise = Right $ Array.concatMap (\a -> map (\b -> { key: a.key <> "," <> b.key, value: Tuple a.value b.value }) right) left
include :: forall a. Array (Case a) -> Array (Case a) -> Array (Case a)
include extra cases = cases <> extra
exclude :: forall a. (a -> Boolean) -> Array (Case a) -> Array (Case a)
exclude predicate = Array.filter (\item -> not (predicate item.value))
matrix :: forall a. String -> Array (Case a) -> (a -> H.Task) -> Either MatrixError (Array H.Task)
matrix name cases build
  | not (validName name) = Left InvalidName
  | Array.length cases > 4096 = Left TooManyCases
  | Array.any (\item -> not (validKey item.key)) cases || Array.length (Array.nub (map _.key cases)) /= Array.length cases = Left DuplicateOrEmptyCase
  | otherwise = Right $ map (\item -> H.withId (name <> "[" <> item.key <> "]") (build item.value)) cases
after :: Array H.Task -> H.Task -> H.Task
after = H.after
parallel :: Int -> Array H.Task -> H.Plan
parallel jobs tasks = H.plan tasks # H.withJobs jobs
