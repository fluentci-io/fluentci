(ns ^:typed.clojure fluentci.type-errors.chain
  (:require [fluentci.plugin :as p] [typed.clojure :as t]))
(t/ann broken [-> p/Pipeline])
(defn broken [] (-> (p/pipeline "bad") p/stdout! (p/env "MODE" "release")))
