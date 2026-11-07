(ns compile-plugin
  (:require [cljs.build.api :as cljs]
            [clojure.edn :as edn]
            [clojure.java.io :as io]
            [inspect-plugin :as inspection]))

(defn -main [& [main config & paths]]
  ;; cljs.build.api avoids the browser REPL preloads of cljs.main's CLI.
  (cljs/build (apply cljs/inputs (or (seq paths) ["src" "demo-plugin/src"]))
              (assoc (edn/read-string (slurp (or config "demo-plugin/build.edn")))
                     :main (symbol (or main "demo.entry"))))
  (let [output (io/file "dist/clojurescript-interface.json")]
    (io/make-parents output)
    (spit output (inspection/json (inspection/inspect (symbol (or main "demo.entry")) (or (seq paths) ["src" "demo-plugin/src"]))))))
