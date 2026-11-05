module Dagger.Container where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Container

foreign import _id :: Container -> EffectFnAff String

id :: Container -> Aff String
id container = fromEffectFnAff $ _id container

foreign import from :: Container -> String -> Effect Container

foreign import withExec :: Container -> Array String -> Effect Container

foreign import _stdout :: Container -> EffectFnAff String

stdout :: Container -> Aff String
stdout container = fromEffectFnAff $ _stdout container

foreign import _stderr :: Container -> EffectFnAff String

stderr :: Container -> Aff String
stderr container = fromEffectFnAff $ _stderr container
