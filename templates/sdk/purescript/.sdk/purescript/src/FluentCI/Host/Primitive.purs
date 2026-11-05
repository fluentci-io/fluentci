module FluentCI.Host.Primitive where

import Prelude
import Data.Argonaut.Core (Json)
import Data.Argonaut.Encode (class EncodeJson, encodeJson)
import Data.Maybe (Maybe(..))

type Connection = { host :: String, user :: Maybe String, port :: Int, identity :: Maybe String, install :: Boolean }
data Direction = Upload | Download
data Action = Get | Put | List | Delete
data Algorithm = Sha256 | Sha512
data Input = Text String | File String
data Method = Scp | Sftp | Rsync
type FtpOptions = { url :: String, action :: Action, path :: Maybe String, username_env :: Maybe String, password_env :: Maybe String, install :: Boolean }
type S3Options = { bucket :: String, key :: String, action :: Action, path :: Maybe String, endpoint :: Maybe String, region :: Maybe String, install :: Boolean }
data Operation = Os | Arch | Digest Algorithm Input | Ssh Connection (Array String) | Transfer Method Connection Direction String String | Ftp FtpOptions | Ftps FtpOptions | S3 S3Options

connection :: String -> Connection
connection host = { host, user: Nothing, port: 22, identity: Nothing, install: true }

directionName :: Direction -> String
directionName Upload = "upload"
directionName Download = "download"
actionName :: Action -> String
actionName Get = "get"
actionName Put = "put"
actionName List = "list"
actionName Delete = "delete"
algorithmName :: Algorithm -> String
algorithmName Sha256 = "sha256"
algorithmName Sha512 = "sha512"
methodName :: Method -> String
methodName Scp = "scp"
methodName Sftp = "sftp"
methodName Rsync = "rsync"

instance encodeOperation :: EncodeJson Operation where
  encodeJson Os = encodeJson { kind: "os" }
  encodeJson Arch = encodeJson { kind: "arch" }
  encodeJson (Digest algorithm input) = encodeJson { kind: "digest", algorithm: algorithmName algorithm, input: case input of
    Text value -> { source: "text", value }
    File value -> { source: "file", value }
  }
  encodeJson (Ssh value command) = encodeJson { kind: "ssh", connection: value, command }
  encodeJson (Transfer method value direction source destination) = encodeJson { kind: methodName method, connection: value, direction: directionName direction, source, destination }
  encodeJson (Ftp options) = encodeFtp "ftp" options
  encodeJson (Ftps options) = encodeFtp "ftps" options
  encodeJson (S3 options) = encodeJson { kind: "s3", bucket: options.bucket, key: options.key, action: actionName options.action, path: options.path, endpoint: options.endpoint, region: options.region, install: options.install }

encodeFtp :: String -> FtpOptions -> Json
encodeFtp kind options = encodeJson { kind, url: options.url, action: actionName options.action, path: options.path, username_env: options.username_env, password_env: options.password_env, install: options.install }
