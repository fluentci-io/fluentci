module FluentCI.Nix where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)

type NixArgs = { impure :: Boolean }

data Nix

foreign import _id :: Nix -> EffectFnAff String

foreign import _stderr :: Nix -> EffectFnAff String

foreign import _stdout :: Nix -> EffectFnAff String

foreign import asService :: Nix -> String -> Effect Service


id :: Nix -> Aff String
id nix = fromEffectFnAff $ _id nix

stderr :: Nix -> Aff String
stderr nix = fromEffectFnAff $ _stderr nix

stdout :: Nix -> Aff String
stdout nix = fromEffectFnAff $ _stdout nix

foreign import waitOn :: Nix -> Int -> Int -> Effect Nix

foreign import withCache :: Nix -> Cache -> Effect Nix

foreign import withEnvVariable :: Nix -> String -> String -> Effect Nix

foreign import withExec :: Nix -> Array String -> Effect Nix

foreign import withSecretVariable :: Nix -> String -> Secret -> Effect Nix

foreign import withService :: Nix -> Service -> Effect Nix

foreign import withWorkdir :: Nix -> String -> Effect Nix
