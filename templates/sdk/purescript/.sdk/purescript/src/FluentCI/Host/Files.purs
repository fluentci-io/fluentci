-- | Native workspace file tasks. Construction performs no IO.
-- | Query values are returned in TaskResult.file_result.
module FluentCI.Host.Files where

import Prelude
import Data.Argonaut.Core (Json, fromObject, toObject)
import Data.Argonaut.Encode (encodeJson)
import Data.Maybe (fromMaybe)
import Foreign.Object as Object
import FluentCI.Host.Plan (Task, task, withFileOperation)

native :: String -> String -> Json -> String -> Task
native id op fields cwd = task id "" cwd # withFileOperation
  (fromObject (Object.insert "op" (encodeJson op) (fromMaybe Object.empty (toObject fields))))

readText :: String -> String -> Int -> String -> Task
readText id path limitBytes cwd = native id "read_text" (encodeJson { path, limit_bytes: limitBytes }) cwd

readBytes :: String -> String -> Int -> String -> Task
readBytes id path limitBytes cwd = native id "read_bytes" (encodeJson { path, limit_bytes: limitBytes }) cwd

writeText :: String -> String -> String -> Boolean -> String -> Task
writeText id path text overwrite cwd = native id "write_text" (encodeJson { path, text, overwrite }) cwd

writeBytes :: String -> String -> Array Int -> Boolean -> String -> Task
writeBytes id path bytes overwrite cwd = native id "write_bytes" (encodeJson { path, bytes, overwrite }) cwd

copyFile :: String -> String -> String -> Boolean -> String -> Task
copyFile id source destination overwrite cwd = native id "copy_file" (encodeJson { source, destination, overwrite }) cwd

copyTree :: String -> String -> String -> Boolean -> String -> Task
copyTree id source destination overwrite cwd = native id "copy_tree" (encodeJson { source, destination, overwrite }) cwd

move :: String -> String -> String -> Boolean -> String -> Task
move id source destination overwrite cwd = native id "move" (encodeJson { source, destination, overwrite }) cwd

mkdir :: String -> String -> Boolean -> String -> Task
mkdir id path parents cwd = native id "mkdir" (encodeJson { path, parents }) cwd

remove :: String -> String -> Boolean -> Boolean -> String -> Task
remove id path recursive missingOk cwd = native id "remove" (encodeJson { path, recursive, missing_ok: missingOk }) cwd

stat :: String -> String -> String -> Task
stat id path cwd = native id "stat" (encodeJson { path }) cwd

exists :: String -> String -> String -> Task
exists id path cwd = native id "exists" (encodeJson { path }) cwd

list :: String -> String -> String -> Task
list id path cwd = native id "list" (encodeJson { path }) cwd

glob :: String -> String -> String -> Task
glob id pattern cwd = native id "glob" (encodeJson { pattern }) cwd

hash :: String -> String -> String -> Task
hash id path cwd = native id "hash" (encodeJson { path }) cwd

chmod :: String -> String -> Int -> String -> Task
chmod id path mode cwd = native id "chmod" (encodeJson { path, mode }) cwd

symlink :: String -> String -> String -> String -> Task
symlink id target path cwd = native id "symlink" (encodeJson { target, path }) cwd
