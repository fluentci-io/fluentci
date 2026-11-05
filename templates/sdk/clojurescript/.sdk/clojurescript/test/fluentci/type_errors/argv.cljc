(ns ^:typed.clojure fluentci.type-errors.argv
  (:require [fluentci.plugin :as p] [typed.clojure :as t]))
(t/ann broken [-> p/Pipeline])
(defn broken [] (p/exec (p/pipeline "bad") [42]))
