(ns ^:typed.clojure fluentci.type-errors.resource
  (:require [fluentci.plugin :as p] [typed.clojure :as t]))
(t/ann broken [-> t/Str])
(defn broken [] (p/stdout! (p/file "input.txt")))
