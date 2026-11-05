module FluentCI.Pkgx where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Cache (Cache)
import FluentCI.Secret (Secret)
import FluentCI.Service (Service)

data Pkgx

foreign import _id :: Pkgx -> EffectFnAff String

foreign import _stderr :: Pkgx -> EffectFnAff String

foreign import _stdout :: Pkgx -> EffectFnAff String

foreign import asService :: Pkgx -> String -> Effect Service


id :: Pkgx -> Aff String
id pkgx = fromEffectFnAff $ _id pkgx

stderr :: Pkgx -> Aff String
stderr pkgx = fromEffectFnAff $ _stderr pkgx

stdout :: Pkgx -> Aff String
stdout pkgx = fromEffectFnAff $ _stdout pkgx

foreign import waitOn :: Pkgx -> Int -> Int -> Effect Pkgx

foreign import withCache :: Pkgx -> Cache -> Effect Pkgx

foreign import withEnvVariable :: Pkgx -> String -> String -> Effect Pkgx

foreign import withExec :: Pkgx -> Array String -> Effect Pkgx

foreign import withSecretVariable :: Pkgx -> String -> Secret -> Effect Pkgx

foreign import withService :: Pkgx -> Service -> Effect Pkgx

foreign import withWorkdir :: Pkgx -> String -> Effect Pkgx

foreign import withPackages :: Pkgx -> Array String -> Effect Pkgx
