(ns compile-plugin
  (:require [cljs.build.api :as cljs]
            [clojure.edn :as edn]))

(defn -main [& [main config & paths]]
  ;; cljs.build.api avoids the browser REPL preloads of cljs.main's CLI.
  (cljs/build (apply cljs/inputs (or (seq paths) ["src" "demo-plugin/src"]))
              (assoc (edn/read-string (slurp (or config "demo-plugin/build.edn")))
                     :main (symbol (or main "demo.entry")))))
