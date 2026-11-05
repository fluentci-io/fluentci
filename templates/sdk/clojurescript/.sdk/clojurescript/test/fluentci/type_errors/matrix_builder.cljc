(ns ^:typed.clojure fluentci.type-errors.matrix-builder
  (:require [fluentci.host :as h] [fluentci.files :as f]
            [fluentci.matrix :as m] [fluentci.pdk :as pdk]
            [typed.clojure :as t]))
(t/ann broken [-> t/Any])
(defn broken [] (m/matrix "test" (m/axis "node" ["22"]) (fn [value] value)))
