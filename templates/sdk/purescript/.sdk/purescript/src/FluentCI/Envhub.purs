module FluentCI.Envhub where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)


data Envhub

foreign import _id :: Envhub -> EffectFnAff String

foreign import _stderr :: Envhub -> EffectFnAff String

foreign import _stdout :: Envhub -> EffectFnAff String

id :: Envhub -> Aff String
id envhub = fromEffectFnAff $ _id envhub

stderr :: Envhub -> Aff String
stderr envhub = fromEffectFnAff $ _stderr envhub

stdout :: Envhub -> Aff String
stdout envhub = fromEffectFnAff $ _stdout envhub

foreign import use :: Envhub -> String -> Aff Envhub

foreign import asService :: Envhub -> String-> Effect Service

foreign import waitOn :: Envhub -> Int -> Int -> Aff Envhub

foreign import withCache :: Envhub -> Cache -> Aff Envhub

foreign import withEnvVariable :: Envhub -> String -> String -> Aff Envhub

foreign import withExec :: Envhub -> Array String -> Aff Envhub

foreign import withSecretVariable :: Envhub -> String -> Secret -> Aff Envhub

foreign import withService :: Envhub -> Service  -> Aff Envhub

foreign import withWorkdir :: Envhub -> String -> Aff Envhub
