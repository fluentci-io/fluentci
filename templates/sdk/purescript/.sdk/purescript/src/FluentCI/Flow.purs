-- | Typed, deferred component/native pipelines. Only run performs effects.
module FluentCI.Flow (Pipeline, pipeline, workdir, env, exec, map, ensuring, run) where
import Prelude hiding (map)
import Effect (Effect)
foreign import data Pipeline :: Type -> Type
foreign import pipeline :: String -> Pipeline Unit
foreign import workdir :: forall a. String -> Pipeline a -> Pipeline a
foreign import env :: forall a. String -> String -> Pipeline a -> Pipeline a
foreign import exec :: forall a. Array String -> Pipeline a -> Pipeline String
foreign import map :: forall a b. (a -> b) -> Pipeline a -> Pipeline b
foreign import ensuring :: forall a. Effect Unit -> Pipeline a -> Pipeline a
foreign import run :: forall a. Pipeline a -> Effect a
