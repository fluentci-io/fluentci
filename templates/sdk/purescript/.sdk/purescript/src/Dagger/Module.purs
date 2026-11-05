module Dagger.Module where

import Prelude

import Dagger.ModuleDependency (ModuleDependency)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Module

foreign import _id :: Module -> EffectFnAff String

id :: Module -> Aff String
id _module = fromEffectFnAff $ _id _module


foreign import _dependencies :: Module -> EffectFnAff (Array Module)

dependencies :: Module -> Aff (Array Module)
dependencies _module = fromEffectFnAff $ _dependencies _module

foreign import _dependencyConfig :: Module -> EffectFnAff (Array ModuleDependency)

dependencyConfig :: Module -> Aff (Array ModuleDependency)
dependencyConfig _module = fromEffectFnAff $ _dependencyConfig _module
