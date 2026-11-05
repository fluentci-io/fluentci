module Dagger.Secret where

import Prelude
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Secret

foreign import _id :: Secret -> EffectFnAff String

id :: Secret -> Aff String
id secret = fromEffectFnAff $ _id secret

foreign import _name :: Secret -> EffectFnAff String

name :: Secret -> Aff String
name secret = fromEffectFnAff $ _name secret

foreign import _plaintext :: Secret -> EffectFnAff String

plaintext :: Secret -> Aff String
plaintext secret = fromEffectFnAff $ _plaintext secret
