module FluentCI.Host.Remote (module Primitive, task, os, arch, digestText, digestFile, ssh, scp, sftp, rsync, ftp, ftps, s3) where

import Prelude
import FluentCI.Host.Primitive (Action(..), Algorithm(..), Connection, Direction(..), FtpOptions, Input(..), Method(..), Operation(..), S3Options, connection) as Primitive
import FluentCI.Host.Plan (Task)
import FluentCI.Host.Plan as Plan

task :: String -> Primitive.Operation -> String -> Task
task id operation cwd = Plan.task id "" cwd # Plan.withPrimitive operation
os :: String -> String -> Task
os id = task id Primitive.Os
arch :: String -> String -> Task
arch id = task id Primitive.Arch
digestText :: String -> Primitive.Algorithm -> String -> String -> Task
digestText id algorithm text = task id (Primitive.Digest algorithm (Primitive.Text text))
digestFile :: String -> Primitive.Algorithm -> String -> String -> Task
digestFile id algorithm path = task id (Primitive.Digest algorithm (Primitive.File path))
ssh :: String -> Primitive.Connection -> Array String -> String -> Task
ssh id value command = task id (Primitive.Ssh value command)
scp :: String -> Primitive.Connection -> Primitive.Direction -> String -> String -> String -> Task
scp id value direction source destination = task id (Primitive.Transfer Primitive.Scp value direction source destination)
sftp :: String -> Primitive.Connection -> Primitive.Direction -> String -> String -> String -> Task
sftp id value direction source destination = task id (Primitive.Transfer Primitive.Sftp value direction source destination)
rsync :: String -> Primitive.Connection -> Primitive.Direction -> String -> String -> String -> Task
rsync id value direction source destination = task id (Primitive.Transfer Primitive.Rsync value direction source destination)
ftp :: String -> Primitive.FtpOptions -> String -> Task
ftp id value = task id (Primitive.Ftp value)
ftps :: String -> Primitive.FtpOptions -> String -> Task
ftps id value = task id (Primitive.Ftps value)
s3 :: String -> Primitive.S3Options -> String -> Task
s3 id value = task id (Primitive.S3 value)
