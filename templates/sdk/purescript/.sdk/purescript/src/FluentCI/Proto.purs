module FluentCI.Proto where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)

data Proto

foreign import _id :: Proto -> EffectFnAff String

foreign import _stderr :: Proto -> EffectFnAff String

foreign import _stdout :: Proto -> EffectFnAff String

foreign import asService :: Proto -> String -> Effect Service


id :: Proto -> Aff String
id proto = fromEffectFnAff $ _id proto

stderr :: Proto -> Aff String
stderr proto = fromEffectFnAff $ _stderr proto

stdout :: Proto -> Aff String
stdout proto = fromEffectFnAff $ _stdout proto

foreign import waitOn :: Proto -> Int -> Int -> Effect Proto

foreign import withCache :: Proto -> Cache -> Effect Proto

foreign import withEnvVariable :: Proto -> String -> String -> Effect Proto

foreign import withExec :: Proto -> Array String -> Effect Proto

foreign import withSecretVariable :: Proto -> String -> Secret -> Effect Proto

foreign import withService :: Proto -> Service -> Effect Proto

foreign import withWorkdir :: Proto -> String -> Effect Proto
