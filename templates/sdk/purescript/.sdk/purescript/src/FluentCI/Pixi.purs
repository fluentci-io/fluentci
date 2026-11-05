module FluentCI.Pixi where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)

data Pixi

foreign import _id :: Pixi -> EffectFnAff String

foreign import _stderr :: Pixi -> EffectFnAff String

foreign import _stdout :: Pixi -> EffectFnAff String

foreign import asService :: Pixi -> String -> Effect Service


id :: Pixi -> Aff String
id pixi = fromEffectFnAff $ _id pixi

stderr :: Pixi -> Aff String
stderr pixi = fromEffectFnAff $ _stderr pixi

stdout :: Pixi -> Aff String
stdout pixi = fromEffectFnAff $ _stdout pixi

foreign import waitOn :: Pixi -> Int -> Int -> Effect Pixi

foreign import withCache :: Pixi -> Cache -> Effect Pixi

foreign import withEnvVariable :: Pixi -> String -> String -> Effect Pixi

foreign import withExec :: Pixi -> Array String -> Effect Pixi

foreign import withSecretVariable :: Pixi -> String -> Secret -> Effect Pixi

foreign import withService :: Pixi -> Service -> Effect Pixi

foreign import withWorkdir :: Pixi -> String -> Effect Pixi
