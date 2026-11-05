module FluentCI.Flox where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)

data Flox

foreign import _id :: Flox -> EffectFnAff String

foreign import _stderr :: Flox -> EffectFnAff String

foreign import _stdout :: Flox -> EffectFnAff String

foreign import asService :: Flox -> String -> Effect Service


id :: Flox -> Aff String
id flox = fromEffectFnAff $ _id flox

stderr :: Flox -> Aff String
stderr flox = fromEffectFnAff $ _stderr flox

stdout :: Flox -> Aff String
stdout flox = fromEffectFnAff $ _stdout flox

foreign import waitOn :: Flox -> Int -> Int -> Effect Flox

foreign import withCache :: Flox -> Cache -> Effect Flox

foreign import withEnvVariable :: Flox -> String -> String -> Effect Flox

foreign import withExec :: Flox -> Array String -> Effect Flox

foreign import withSecretVariable :: Flox -> String -> Secret -> Effect Flox

foreign import withService :: Flox -> Service -> Effect Flox

foreign import withWorkdir :: Flox -> String -> Effect Flox
