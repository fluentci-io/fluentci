module Dagger.Service where

import Prelude

import Dagger.Port (Port)
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Service

foreign import _id :: Service -> EffectFnAff String

id :: Service -> Aff String
id service = fromEffectFnAff $ _id service

foreign import _endpoint :: Service -> EffectFnAff String

endpoint :: Service -> Aff String
endpoint service = fromEffectFnAff $ _endpoint service

foreign import _hostname :: Service -> EffectFnAff String

hostname :: Service -> Aff String
hostname service = fromEffectFnAff $ _hostname service

foreign import _ports :: Service -> EffectFnAff (Array Port)

ports :: Service -> Aff (Array Port)
ports service = fromEffectFnAff $ _ports service

foreign import _start :: Service -> EffectFnAff Service

start :: Service -> Aff Service
start service = fromEffectFnAff $ _start service

foreign import _stop :: Service -> EffectFnAff Service

stop :: Service -> Aff Service
stop service = fromEffectFnAff $ _stop service

foreign import _up :: Service -> EffectFnAff Boolean

up :: Service -> Aff Boolean
up service = fromEffectFnAff $ _up service
