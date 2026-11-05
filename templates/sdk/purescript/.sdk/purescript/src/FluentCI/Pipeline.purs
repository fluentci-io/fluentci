module FluentCI.Pipeline where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Devbox (Devbox)
import FluentCI.Devenv (Devenv)
import FluentCI.Envhub (Envhub)
import FluentCI.Flox (Flox)
import FluentCI.Hermit (Hermit)
import FluentCI.Mise (Mise)
import FluentCI.Nix (Nix, NixArgs)
import FluentCI.Pixi (Pixi)
import FluentCI.Pkgx (Pkgx)
import FluentCI.Proto (Proto)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)

data Pipeline

foreign import _id :: Pipeline -> EffectFnAff String

foreign import _stderr :: Pipeline -> EffectFnAff String

foreign import _stdout :: Pipeline -> EffectFnAff String

id :: Pipeline -> Aff String
id pipeline = fromEffectFnAff $ _id pipeline

stderr :: Pipeline -> Aff String
stderr pipeline = fromEffectFnAff $ _stderr pipeline

stdout :: Pipeline -> Aff String
stdout pipeline = fromEffectFnAff $ _stdout pipeline

foreign import asService :: String -> Pipeline -> Effect Service

foreign import waitOn :: Int -> Int -> Pipeline -> Effect Pipeline

foreign import devbox :: Pipeline -> Effect Devbox

foreign import devenv :: Pipeline -> Effect Devenv

foreign import envhub :: Pipeline -> Effect Envhub

foreign import mise :: Pipeline -> Effect Mise

foreign import nix :: NixArgs -> Pipeline -> Effect Nix

foreign import pixi :: Pipeline -> Effect Pixi

foreign import pkgx :: Pipeline -> Effect Pkgx

foreign import proto :: Pipeline -> Effect Proto

foreign import hermit :: Pipeline -> Effect Hermit

foreign import flox :: Pipeline -> Effect Flox


foreign import withCache :: Cache -> Pipeline -> Effect Pipeline

foreign import withEnvVariable :: String -> String -> Pipeline -> Effect Pipeline

foreign import withSecretVariable :: String -> Secret -> Pipeline -> Effect Pipeline

foreign import withExec :: Array String -> Pipeline -> Effect Pipeline

foreign import withService :: Service -> Pipeline -> Effect Pipeline

foreign import withWorkdir :: String -> Pipeline -> Effect Pipeline
