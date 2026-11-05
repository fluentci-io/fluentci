module Dagger.Host where

import Prelude

import Dagger.Directory (Directory)
import Dagger.File (File)
import Dagger.Secret (Secret)
import Dagger.Service (Service)
import Dagger.Socket (Socket)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Host

foreign import _id :: Host -> EffectFnAff String

id :: Host -> Aff String
id host = fromEffectFnAff $ _id host

foreign import directory :: Host -> String ->Effect Directory

foreign import file :: Host -> String -> Effect File

foreign import service :: Host -> Effect Service

foreign import setSecretFile :: Host -> String -> Effect Secret

foreign import tunnel :: Host -> Service -> Effect Service

foreign import unixSocket :: Host -> String -> Effect Socket
