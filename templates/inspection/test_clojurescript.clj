(require '[clojure.test :refer [deftest is run-tests]])
(require '[clojure.java.io :as io])

(let [base (.getParentFile (.getCanonicalFile (io/file *file*)))
      template (io/file base "../sdk/clojurescript/.sdk/clojurescript/dev/inspect_plugin.clj")
      sibling (io/file base "../clojurescript/dev/inspect_plugin.clj")]
  (load-file (str (if (.isFile template) template sibling))))

(deftest native-reader-keeps-types-docs-and-fields-in-sync
  (let [directory (.toFile (java.nio.file.Files/createTempDirectory "fluentci-inspection-cljs" (make-array java.nio.file.attribute.FileAttribute 0)))
        entry (io/file directory "entry.cljs")
        plugin (io/file directory "plugin.cljc")
        source "(ns plugin (:require #?(:clj [typed.clojure :as t])))
#?(:clj (t/ann build [(t/HMap :mandatory {:src t/Str :jobs t/Int} :optional {:verbose t/Bool}) -> t/Str]))
(defn build \"Build source files.\" [args] (:src args))"]
    (try
      (spit entry "(ns entry (:require [plugin :as p])) (set! (.-exports js/module) #js {:build p/build})")
      (spit plugin source)
      (let [function (get-in (inspect-plugin/inspect 'entry [(str directory)]) [:functions "build"])]
        (is (= "Build source files." (:description function)))
        (is (= "t/Str" (:returnType function)))
        (is (= "integer" (:type (first (filter #(= "jobs" (:name %)) (:args function))))))
        (is (= false (:required (first (filter #(= "verbose" (:name %)) (:args function)))))))
      (spit plugin (.replace source ":jobs t/Int" ":jobs t/Num"))
      (let [function (get-in (inspect-plugin/inspect 'entry [(str directory)]) [:functions "build"])]
        (is (= "number" (:type (first (filter #(= "jobs" (:name %)) (:args function)))))))
      (finally (.delete entry) (.delete plugin) (.delete directory)))))

(let [result (run-tests)]
  (when (pos? (+ (:fail result) (:error result))) (System/exit 1)))
