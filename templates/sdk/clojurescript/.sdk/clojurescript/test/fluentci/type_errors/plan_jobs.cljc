(ns ^:typed.clojure fluentci.type-errors.plan-jobs
  (:require [fluentci.host :as h] [fluentci.files :as f]
            [fluentci.matrix :as m] [fluentci.pdk :as pdk]
            [typed.clojure :as t]))
(t/ann broken [-> t/Any])
(defn broken [] (h/with-jobs (h/plan []) "two"))
