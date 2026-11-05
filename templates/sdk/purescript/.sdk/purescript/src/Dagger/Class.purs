module Dagger.Class where

import Dagger.CacheVolume as CacheVolume
import Dagger.Container as Container
import Dagger.Directory as Directory
import Dagger.EnvVariable as EnvVariable
import Dagger.File as File
import Dagger.GitRef as GitRef
import Dagger.GitRepository as GitRepository
import Dagger.Host as Host
import Dagger.Module as Module
import Dagger.ModuleDependency as ModuleDependency
import Dagger.Port as Port
import Dagger.Secret as Secret
import Dagger.Service as Service
import Dagger.Socket as Socket
import Effect.Aff (Aff)

class Id a where
  id :: a -> Aff String

instance Id CacheVolume.CacheVolume where
  id cacheVolume = CacheVolume.id cacheVolume

instance Id Container.Container where
  id container = Container.id container

instance Id Directory.Directory where
  id directory = Directory.id directory

instance Id EnvVariable.EnvVariable where
  id envVariable = EnvVariable.id envVariable

instance Id File.File where
  id file = File.id file

instance Id GitRef.GitRef where
  id gitRef = GitRef.id gitRef

instance Id GitRepository.GitRepository where
  id gitRepository = GitRepository.id gitRepository

instance Id Host.Host where
  id host = Host.id host

instance Id Module.Module where
  id module_ = Module.id module_

instance Id ModuleDependency.ModuleDependency where
  id moduleDependency = ModuleDependency.id moduleDependency

instance Id Port.Port where
  id port = Port.id port

instance Id Secret.Secret where
  id secret = Secret.id secret

instance Id Service.Service where
  id service = Service.id service

instance Id Socket.Socket where
  id socket = Socket.id socket
