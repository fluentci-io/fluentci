module Dagger.Directory where

import Prelude
import Dagger.Container (Container)
import Dagger.File (File)
import Dagger.Module (Module)
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Directory

foreign import _id :: Directory -> EffectFnAff String

id :: Directory -> Aff String
id dir = fromEffectFnAff $ _id dir

foreign import asModule :: Directory -> Effect Module

foreign import diff :: Directory -> Directory -> Effect Directory

foreign import directory :: Directory -> String -> Effect Directory

foreign import dockerBuild :: Directory -> Effect Container

foreign import _entries :: Directory -> EffectFnAff (Array String)

entries :: Directory -> Aff (Array String)
entries dir = fromEffectFnAff $ _entries dir

foreign import _export ::  Directory -> EffectFnAff String

export :: Directory -> Aff String
export dir = fromEffectFnAff $ _export dir

foreign import file :: Directory -> String -> Effect File

foreign import _glob :: Directory -> String -> EffectFnAff (Array String)

glob :: Directory -> String -> Aff (Array String)
glob dir pattern = fromEffectFnAff $ _glob dir pattern

foreign import pipeline :: Directory ->  String -> Effect Directory

foreign import sync :: Directory -> Effect Directory

foreign import terminal :: Directory -> Effect Directory

foreign import withDirectory :: Directory -> String -> Directory -> Effect Directory

foreign import withFile :: Directory -> File -> Effect Directory

foreign import withFiles :: Directory -> Array File -> Effect Directory

foreign import withNewDirectory :: Directory -> String -> Effect Directory

foreign import withNewFile :: Directory -> String -> String -> Effect File

foreign import withTimestamps :: Directory -> Int -> Effect Directory

foreign import withoutDirectory :: Directory -> String -> Effect Directory

foreign import withoutFile :: Directory -> String -> Effect Directory
