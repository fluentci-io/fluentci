module FluentCI.Secret where

import Prelude

import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)


data Secret


foreign import _id :: Secret -> EffectFnAff String

foreign import _mount :: Secret -> EffectFnAff String

foreign import _name :: Secret -> EffectFnAff String

foreign import _plaintext :: Secret -> EffectFnAff String


id :: Secret -> Aff String
id secret = fromEffectFnAff $ _id secret

mount :: Secret -> Aff String
mount secret = fromEffectFnAff $ _mount secret

name :: Secret -> Aff String
name secret = fromEffectFnAff $ _name secret

plaintext :: Secret -> Aff String
plaintext secret = fromEffectFnAff $ _plaintext secret
