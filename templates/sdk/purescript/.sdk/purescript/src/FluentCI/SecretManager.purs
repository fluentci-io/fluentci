module FluentCI.SecretManager where

import Prelude

import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data SecretManager

foreign import _id :: SecretManager -> EffectFnAff String

foreign import _getSecret :: SecretManager -> String -> EffectFnAff String

id :: SecretManager -> Aff String
id secretManager = fromEffectFnAff $ _id secretManager

getSecret :: SecretManager -> String -> Aff String
getSecret secretManager secretName = fromEffectFnAff $ _getSecret secretManager secretName
