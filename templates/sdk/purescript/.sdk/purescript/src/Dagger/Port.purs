module Dagger.Port where

import Prelude
import Effect.Aff (Aff)
import Effect.Aff.Compat (EffectFnAff, fromEffectFnAff)

data Port

foreign import _id :: Port -> EffectFnAff String

id :: Port -> Aff String
id p = fromEffectFnAff $ _id p

foreign import _description :: Port -> EffectFnAff String

description :: Port -> Aff String
description p = fromEffectFnAff $ _description p

foreign import _experimentalSkipHealthCheck :: Port -> EffectFnAff Boolean

experimentalSkipHealthCheck :: Port -> Aff Boolean
experimentalSkipHealthCheck p = fromEffectFnAff $ _experimentalSkipHealthCheck p

foreign import _port :: Port -> EffectFnAff Int

port :: Port -> Aff Int
port p = fromEffectFnAff $ _port p

foreign import _protocol :: Port -> EffectFnAff String

protocol :: Port -> Aff String
protocol p = fromEffectFnAff $ _protocol p
