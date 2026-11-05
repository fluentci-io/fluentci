module FluentCI.Hermit where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)

data Hermit

foreign import _id :: Hermit -> EffectFnAff String

foreign import _stderr :: Hermit -> EffectFnAff String

foreign import _stdout :: Hermit -> EffectFnAff String

foreign import asService :: Hermit -> String -> Effect Service


id :: Hermit -> Aff String
id hermit = fromEffectFnAff $ _id hermit

stderr :: Hermit -> Aff String
stderr hermit = fromEffectFnAff $ _stderr hermit

stdout :: Hermit -> Aff String
stdout hermit = fromEffectFnAff $ _stdout hermit

foreign import waitOn :: Hermit -> Int -> Int -> Effect Hermit

foreign import withCache :: Hermit -> Cache -> Effect Hermit

foreign import withEnvVariable :: Hermit -> String -> String -> Effect Hermit

foreign import withExec :: Hermit -> Array String -> Effect Hermit

foreign import withSecretVariable :: Hermit -> String -> Secret -> Effect Hermit

foreign import withService :: Hermit -> Service -> Effect Hermit

foreign import withWorkdir :: Hermit -> String -> Effect Hermit

foreign import withPackages :: Hermit -> Array String -> Effect Hermit

foreign import install :: Hermit -> Effect Hermit
