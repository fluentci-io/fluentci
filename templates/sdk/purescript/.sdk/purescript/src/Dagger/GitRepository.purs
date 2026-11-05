module Dagger.GitRepository where

import Prelude

import Dagger.GitRef (GitRef)
import Dagger.Secret (Secret)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data GitRepository


foreign import  _id :: GitRepository ->  EffectFnAff String

id :: GitRepository -> Aff String
id gitRepository = fromEffectFnAff $ _id gitRepository

foreign import branch :: GitRepository -> String -> Effect GitRef

foreign import commit :: GitRepository -> String -> Effect GitRef

foreign import head :: GitRepository -> Effect GitRef

foreign import ref :: GitRepository -> String -> Effect GitRef

foreign import tag :: GitRepository -> String -> Effect GitRef

foreign import tags :: GitRepository -> Effect (Array GitRef)

foreign import withAuthHeader :: GitRepository -> Secret -> Effect GitRepository

foreign import withAuthToken :: GitRepository -> Secret -> Effect GitRepository
