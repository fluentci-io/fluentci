module Dagger.File where

import Prelude
import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data File

foreign import _id :: File -> EffectFnAff String

id :: File -> Aff String
id file  = fromEffectFnAff $ _id file

foreign import _contents :: File -> EffectFnAff String

contents :: File -> Aff String
contents file = fromEffectFnAff $ _contents file

foreign import _digest :: File -> EffectFnAff String

digest :: File -> Aff String
digest file = fromEffectFnAff $ _digest file

foreign import _export :: File -> String -> EffectFnAff String

export :: File -> String -> Aff String
export file str = fromEffectFnAff $ _export file str

foreign import _name :: File -> EffectFnAff String

name :: File -> Aff String
name file = fromEffectFnAff $ _name file

foreign import _size :: File -> EffectFnAff Int

size :: File -> Aff Int
size file = fromEffectFnAff $ _size file

foreign import _sync :: File -> EffectFnAff File

sync :: File -> Aff File
sync file = fromEffectFnAff $ _sync file

foreign import withName :: File -> String -> Effect File

foreign import withTimestamps :: File -> Int-> Effect File
