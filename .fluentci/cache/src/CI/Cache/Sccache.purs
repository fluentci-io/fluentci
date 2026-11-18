module CI.Cache.Sccache where

import Prelude
import CI.Cache.IO as IO
import CI.CacheHost as H
import Control.Promise (toAffE)
import Effect.Aff (Aff)

version :: String
version = "0.19.0"

target :: String -> String -> String
target os arch = case os, arch of
  "linux", "x64" -> "x86_64-unknown-linux-musl"
  "linux", "arm64" -> "aarch64-unknown-linux-musl"
  "darwin", "x64" -> "x86_64-apple-darwin"
  "darwin", "arm64" -> "aarch64-apple-darwin"
  "win32", "x64" -> "x86_64-pc-windows-msvc"
  "win32", "arm64" -> "aarch64-pc-windows-msvc"
  _, _ -> ""

install :: String -> String -> Aff { executable :: String, binDir :: String }
install os arch = do
  let asset = "sccache-v" <> version <> "-" <> target os arch <> ".tar.gz"
  installed <- toAffE (IO.installSccache ("https://github.com/mozilla/sccache/releases/download/v" <> version <> "/" <> asset) asset (if os == "win32" then "sccache.exe" else "sccache"))
  actual <- toAffE (IO.sccacheVersion installed.executable)
  H.ensureA (actual == "sccache " <> version) "Installed sccache version mismatch"
  toAffE (IO.stopSccache installed.executable)
  pure installed
