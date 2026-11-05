module FluentCI.File where

import Prelude

import Effect (Effect)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)
import FluentCI.Directory (Directory, File)


foreign import _id :: File -> EffectFnAff String

foreign import _chmod :: File -> String -> EffectFnAff File

foreign import _md5 :: File -> EffectFnAff String

foreign import _path :: File -> EffectFnAff String

foreign import _sha256 :: File -> EffectFnAff String

id :: File -> Aff String
id file = fromEffectFnAff $ _id file

chmod :: File -> String -> Aff File
chmod file mode = fromEffectFnAff $ _chmod file mode

md5 :: File -> Aff String
md5 file = fromEffectFnAff $ _md5 file

path :: File -> Aff String
path file = fromEffectFnAff $ _path file

sha256 :: File -> Aff String
sha256 file = fromEffectFnAff $ _sha256 file

foreign import tarCzvf :: File -> Effect File

foreign import tarXzvf :: File -> Effect Directory

foreign import unzip :: File -> Effect Directory

foreign import zip :: File -> Effect File
