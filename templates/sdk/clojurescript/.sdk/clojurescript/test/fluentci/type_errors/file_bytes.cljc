(ns ^:typed.clojure fluentci.type-errors.file-bytes
  (:require [fluentci.host :as h] [fluentci.files :as f]
            [fluentci.matrix :as m] [fluentci.pdk :as pdk]
            [typed.clojure :as t]))
(t/ann broken [-> t/Any])
(defn broken [] (f/write-bytes "write" "data" ["not a byte"] false "."))
