(ns ^:typed.clojure fluentci.type-errors.raw-pdk
  (:require [fluentci.host :as h] [fluentci.files :as f]
            [fluentci.matrix :as m] [fluentci.pdk :as pdk]
            [typed.clojure :as t]))
(t/ann broken [-> t/Any])
(defn broken [] (pdk/nix! {:impure "true"}))
