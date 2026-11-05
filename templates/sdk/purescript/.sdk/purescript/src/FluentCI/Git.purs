module FluentCI.Git where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Directory (Directory)

data Git

foreign import _id :: Git -> EffectFnAff String

foreign import _commit :: Git -> EffectFnAff String

id :: Git -> Aff String
id git = fromEffectFnAff $ _id git

commit :: Git -> Aff String
commit git = fromEffectFnAff $ _commit git

foreign import branch :: String -> Git -> Effect Git

foreign import tree :: Git -> Effect Directory
