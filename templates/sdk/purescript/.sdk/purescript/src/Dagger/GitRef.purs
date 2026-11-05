module Dagger.GitRef where

import Prelude

import Dagger.Directory (Directory)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data GitRef

foreign import _id :: GitRef -> EffectFnAff String

id :: GitRef -> Aff String
id gitRef = fromEffectFnAff $ _id gitRef

foreign import _commit :: GitRef -> EffectFnAff String

commit :: GitRef -> Aff String
commit gitRef = fromEffectFnAff $ _commit gitRef

foreign import tree :: GitRef -> Effect Directory
