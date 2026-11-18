module CI.Cache.IO where

import Prelude
import CI.CacheHost (Env)
import CI.CacheHost as H
import Control.Promise (Promise)
import Effect (Effect)

foreign import parseUrl :: String -> Effect { base :: String, protocol :: String, host :: String, origin :: String, pathname :: String, username :: String, password :: String, search :: String, hash :: String }
foreign import sha256 :: String -> String
foreign import encode :: String -> String
foreign import cacheOwner :: String -> Effect String
foreign import setValue :: Env -> String -> String -> Env
foreign import toJson :: forall a. a -> String
foreign import pathAbsolute :: String -> Effect String
foreign import remove :: String -> Effect (Promise Unit)
foreign import pack :: String -> String -> Effect (Promise { directory :: String, file :: String, bytes :: String })
foreign import download :: String -> String -> Effect (Promise { status :: Int, directory :: String, file :: String })
foreign import unpack :: String -> String -> Effect (Promise String)
foreign import writeFiles :: String -> Array { name :: String, text :: String, executable :: Boolean } -> Effect (Promise (Array String))
foreign import hooks :: H.Hooks
foreign import platform :: Effect { os :: String, arch :: String }
foreign import installSccache :: String -> String -> String -> Effect (Promise { executable :: String, binDir :: String })

foreign import parentPath :: String -> String
foreign import sccacheVersion :: String -> Effect (Promise String)
foreign import stopSccache :: String -> Effect (Promise Unit)

foreign import registryAccount :: String -> String
