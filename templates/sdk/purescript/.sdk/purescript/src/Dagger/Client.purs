module Dagger.Client where

import Dagger.CacheVolume (CacheVolume)
import Dagger.Container (Container)
import Dagger.Directory (Directory)
import Dagger.GitRepository (GitRepository)
import Dagger.Host (Host)
import Effect (Effect)

data Client

foreign import dag :: Client

foreign import pipeline :: Client -> String -> Effect Client

foreign import container :: Client -> Effect Container

foreign import cacheVolume :: Client -> Effect CacheVolume

foreign import directory :: Client -> Effect Directory

foreign import git :: Client -> String -> Effect GitRepository

foreign import host :: Client -> Effect Host

foreign import http :: Client -> String -> Effect String
