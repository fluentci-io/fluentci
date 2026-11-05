module Dagger.CacheVolume where

import Prelude
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data CacheVolume

foreign import _id :: CacheVolume -> EffectFnAff String

id :: CacheVolume -> Aff String
id cacheVolume = fromEffectFnAff $ _id cacheVolume
