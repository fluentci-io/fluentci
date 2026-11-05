module FluentCI.Mise where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)

data Mise

foreign import _id :: Mise -> EffectFnAff String

foreign import _stderr :: Mise -> EffectFnAff String

foreign import _stdout :: Mise -> EffectFnAff String

foreign import asService :: Mise -> String -> Effect Service


id :: Mise -> Aff String
id mise = fromEffectFnAff $ _id mise

stderr :: Mise -> Aff String
stderr mise = fromEffectFnAff $ _stderr mise

stdout :: Mise -> Aff String
stdout mise = fromEffectFnAff $ _stdout mise

foreign import trust :: Mise -> Effect Mise

foreign import waitOn :: Mise -> Int -> Int -> Effect Mise

foreign import withCache :: Mise -> Cache -> Effect Mise

foreign import withEnvVariable :: Mise -> String -> String -> Effect Mise

foreign import withExec :: Mise -> Array String -> Effect Mise

foreign import withSecretVariable :: Mise -> String -> Secret -> Effect Mise

foreign import withService :: Mise -> Service -> Effect Mise

foreign import withWorkdir :: Mise -> String -> Effect Mise
