module Dagger.Socket where

import Prelude
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Socket

foreign import _id :: Socket -> EffectFnAff String

id :: Socket -> Aff String
id socket = fromEffectFnAff $ _id socket
