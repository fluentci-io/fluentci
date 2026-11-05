module Dagger.EnvVariable where

import Prelude

import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data EnvVariable

foreign import _id :: EnvVariable -> EffectFnAff String

id :: EnvVariable -> Aff String
id envVariable = fromEffectFnAff $ _id envVariable

foreign import _name :: EnvVariable -> EffectFnAff String

name :: EnvVariable -> Aff String
name envVariable = fromEffectFnAff $ _name envVariable

foreign import _value :: EnvVariable -> EffectFnAff String

value :: EnvVariable -> Aff String
value envVariable = fromEffectFnAff $ _value envVariable
