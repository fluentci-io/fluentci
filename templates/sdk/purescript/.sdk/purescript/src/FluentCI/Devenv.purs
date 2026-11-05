module FluentCI.Devenv where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)


data Devenv

foreign import _id :: Devenv -> EffectFnAff String

foreign import _stderr :: Devenv -> EffectFnAff String

foreign import _stdout :: Devenv -> EffectFnAff String

foreign import asService :: Devenv -> String -> Effect Service

foreign import waitOn :: Devenv -> Int -> Int -> Effect Devenv

foreign import withCache :: Devenv -> Cache -> Effect Devenv

foreign import withEnvVariable :: Devenv -> String -> String -> Effect Devenv

foreign import withExec :: Devenv -> Array String -> Effect Devenv

foreign import withSecretVariable :: Devenv -> String -> Secret -> Effect Devenv

foreign import withService :: Devenv -> Service -> Effect Devenv

foreign import withWorkdir :: Devenv -> String -> Effect Devenv

id :: Devenv -> Aff String
id devenv = fromEffectFnAff $ _id devenv

stderr :: Devenv -> Aff String
stderr devenv = fromEffectFnAff $ _stderr devenv

stdout :: Devenv -> Aff String
stdout devenv = fromEffectFnAff $ _stdout devenv
