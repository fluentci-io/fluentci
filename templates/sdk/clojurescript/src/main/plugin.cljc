(ns ^:typed.clojure main.plugin
  (:require [fluentci.plugin :as p]
            #?(:clj [typed.clojure :as t])))

#?(:clj (t/ann hello [-> nil]))
(defn hello []
  (-> (p/pipeline "hello")
      (p/exec ["echo" "Hello from FluentCI"])
      (p/exec ["git" "status" "--short"])
      p/stdout!
      p/output!))
