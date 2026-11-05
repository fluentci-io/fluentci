(ns ^:typed.clojure fluentci.type-errors.transform
  (:require [fluentci.plugin :as p] [typed.clojure :as t]))
(t/ann broken [p/Pipeline -> p/Pipeline])
(defn broken [pipeline] (p/stdout! pipeline))
