(ns ^:typed.clojure main.plugin
  (:require [fluentci.plugin :as p]
            #?(:clj [typed.clojure :as t])))
#?(:clj (t/ann parity [-> t/Str]))
(defn parity [] (-> (p/pipeline "component-parity") (p/exec ["printf" "capability-parity"]) p/stdout!))

#?(:clj (t/ann hello [(t/HMap :mandatory {:name t/Str} :complete? true) -> t/Str]))
(defn hello [args] (str "Hello, " (:name args) "!"))
