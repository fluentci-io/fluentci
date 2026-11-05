module Dagger.ModuleDependency where

import Prelude

import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data ModuleDependency

foreign import _id :: ModuleDependency -> EffectFnAff String

id :: ModuleDependency -> Aff String
id moduleDependency = fromEffectFnAff $ _id moduleDependency
