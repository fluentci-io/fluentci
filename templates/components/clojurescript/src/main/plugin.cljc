(ns ^:typed.clojure main.plugin
  #?(:clj (:require [typed.clojure :as t])))

#?(:clj (t/ann hello [(t/HMap :mandatory {:name t/Str} :complete? true) -> t/Str]))
(defn hello
  "Greet someone from a native Wasm component."
  [args]
  (str "Hello, " (:name args) "!"))
