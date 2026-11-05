(ns main.entry (:require [main.plugin :as plugin]))
(set! (.-exports js/module) #js {:hello plugin/hello})
