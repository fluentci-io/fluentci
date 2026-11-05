module FluentCI.Cache where

import Prelude
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Cache

foreign import _id :: Cache -> EffectFnAff String

foreign import _key :: Cache -> EffectFnAff String

-- | Get the cache id.
-- |
-- | ```purescript
-- | c <- liftEffect $ cache dag "cache-demo"
-- | cacheId <- id c
-- | ```
id :: Cache -> Aff String
id cache = fromEffectFnAff $ _id cache

-- | Get the cache key.
-- |
-- | ```purescript
-- | c <- liftEffect $ cache dag "cache-demo"
-- | cacheKey <- key c
-- | ```
key :: Cache -> Aff String
key cache = fromEffectFnAff $ _key cache
