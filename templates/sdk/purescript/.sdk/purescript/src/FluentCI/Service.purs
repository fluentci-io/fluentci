module FluentCI.Service where

import Prelude

import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Service

foreign import _id :: Service -> EffectFnAff String

id :: Service -> Aff String
id service = fromEffectFnAff $ _id service
