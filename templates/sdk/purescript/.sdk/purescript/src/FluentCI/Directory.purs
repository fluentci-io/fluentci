module FluentCI.Directory where

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


data Directory

data File

foreign import _id :: Directory -> EffectFnAff String

foreign import _stderr :: Directory -> EffectFnAff String

foreign import _stdout :: Directory -> EffectFnAff String

foreign import _entries :: Directory -> EffectFnAff (Array String)

id :: Directory -> Aff String
id dir = fromEffectFnAff $ _id dir

stderr :: Directory -> Aff String
stderr dir = fromEffectFnAff $ _stderr dir

stdout :: Directory -> Aff String
stdout dir = fromEffectFnAff $ _stdout dir

entries :: Directory -> Aff (Array String)
entries dir = fromEffectFnAff $ _entries dir

foreign import devbox :: Directory -> Effect Devbox

foreign import devenv :: Directory -> Effect Devenv

foreign import flox :: Directory -> Effect Flox

foreign import mise :: Directory -> Effect Mise

foreign import nix :: Directory -> NixArgs -> Effect Nix

foreign import pixi :: Directory -> Effect Pixi

foreign import pkgx :: Directory -> Effect Pkgx

foreign import proto :: Directory -> Effect Proto

foreign import hermit :: Directory -> Effect Hermit

foreign import envhub :: Directory -> Effect Envhub

foreign import directory :: Directory -> String -> Aff Directory

foreign import tarCzvf :: Directory  -> Aff File

foreign import waitOn :: Directory -> Int -> Int -> Aff Directory

foreign import withCache :: Directory -> Cache -> Aff Directory

foreign import withEnvVariable :: Directory -> String -> String -> Aff Directory

foreign import withExec :: Directory -> Array String -> Effect Directory

foreign import withFile :: Directory -> String -> Aff Directory

foreign import withSecretVariable :: Directory -> String -> Secret -> Aff Directory

foreign import withService :: Directory -> Service -> Aff Directory

foreign import withWorkdir :: Directory -> String -> Aff Directory

foreign import zip :: Directory -> Aff File
