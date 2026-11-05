module FluentCI.Devbox where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)


data Devbox

foreign import _id :: Devbox -> EffectFnAff String

foreign import _stderr :: Devbox -> EffectFnAff String

foreign import _stdout :: Devbox -> EffectFnAff String

foreign import asService :: Devbox -> String -> Effect Service


id :: Devbox -> Aff String
id devbox = fromEffectFnAff $ _id devbox

stderr :: Devbox -> Aff String
stderr devbox = fromEffectFnAff $ _stderr devbox

stdout :: Devbox -> Aff String
stdout devbox = fromEffectFnAff $ _stdout devbox

foreign import waitOn :: Devbox -> Int -> Int -> Effect Devbox

foreign import withCache :: Devbox -> Cache -> Effect Devbox

foreign import withEnvVariable :: Devbox -> String -> String -> Effect Devbox

foreign import withExec :: Devbox -> Array String -> Effect Devbox

foreign import withSecretVariable :: Devbox -> String -> Secret -> Effect Devbox

foreign import withService :: Devbox -> Service -> Effect Devbox

foreign import withWorkdir :: Devbox -> String -> Effect Devbox
