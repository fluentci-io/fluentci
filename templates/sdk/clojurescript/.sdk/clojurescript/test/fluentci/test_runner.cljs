(ns fluentci.test-runner
  (:require [cljs.test :as test :refer-macros [deftest is testing run-tests]]
            [fluentci.plugin :as p]
            [fluentci.pdk :as pdk]
            [fluentci.pdk-contracts :as contracts]
            [fluentci.host :as h]
            [fluentci.files :as f]
            [fluentci.matrix :as m]))

(defn guest []
  (let [values (js/Map.)
        counter (atom 0)
        calls (atom [])
        allocate (fn [value]
                   (let [offset (js/BigInt (swap! counter inc))]
                     (.set values offset value)
                     offset))
        functions #js {}]
    (set! (.-Memory js/globalThis)
          #js {:fromString (fn [value] #js {:offset (allocate value)})
               :find (fn [offset] #js {:readString (fn [] (.get values offset))})})
    (doseq [name ["set_runner" "pipeline" "with_exec" "with_workdir" "set_envs"
                 "cache" "with_cache" "set_secret" "with_secret_variable"
                 "file" "sha256" "stdout" "stderr" "as_service" "with_service"
                 "nix" "set_runner" "with_packages" "wait_on" "trust" "install"]]
      (aset functions name
            (fn [& offsets]
              (when-let [offset (first offsets)]
                (is (= "bigint" (js* "typeof ~{}" offset))))
              (swap! calls conj {:function name :input (.get values (first offsets))})
              (case name
                ("pipeline" "cache" "as_service" "nix") (allocate "{\"id\":\"handle\"}")
                "stdout" (allocate "héllo 世界")
                "set_secret" (allocate "secret-id")
                "sha256" (allocate "digest")
                "stderr" (throw (js/Error. "engine failure"))
                nil))))
    (set! (.-Host js/globalThis) #js {:getFunctions (fn [] functions)})
    calls))

(defn payload [calls function]
  (->> @calls (filter #(= function (:function %))) first :input))

(deftest pure-composable-reusable-pipelines
  (let [calls (guest)
        base (p/pipeline "build")
        release #(p/env % "MODE" "release")
        value "spaces 'quotes'; $(touch injected) 世界"
        configured (-> base release (p/exec ["printf" "%s" value]))]
    (is (= [] (:steps base)))
    (is (= [] @calls))
    (is (= "héllo 世界" (p/stdout! configured)))
    (is (= ["'printf'" "'%s'" "'spaces '\\''quotes'\\''; $(touch injected) 世界'"]
           (js->clj (.parse js/JSON (payload calls "with_exec")))))
    (is (= [["MODE" "release"]] (js->clj (.parse js/JSON (payload calls "set_envs")))))
    (let [first-run @calls]
      (reset! calls [])
      (p/stdout! configured)
      (is (= first-run @calls)))))

(deftest explicit-shell-and-canonical-payloads
  (let [calls (guest)]
    (-> (p/pipeline "build")
        (p/workdir "some directory")
        (p/cache "cargo" "target")
        (p/with-secret "TOKEN" (p/secret "token" "sensitive"))
        (p/shell "printf hello && printf world")
        p/stdout!)
    (is (= "some directory" (payload calls "with_workdir")))
    (is (= {"id" "handle" "key" "cargo" "path" "target"}
           (js->clj (.parse js/JSON (payload calls "with_cache")))))
    (is (= ["TOKEN" "secret-id"] (js->clj (.parse js/JSON (payload calls "with_secret_variable")))))
    (is (= ["printf hello && printf world"] (js->clj (.parse js/JSON (payload calls "with_exec")))))))

(deftest validation-precedes-effects
  (let [calls (guest)]
    (doseq [argv [[] [""] ["printf" "bad\u0000argument"]]]
      (is (thrown? cljs.core/ExceptionInfo (p/exec (p/pipeline "bad") argv))))
    (is (= [] @calls))))

(deftest errors-carry-host-function-context
  (guest)
  (try
    (p/stderr! (p/pipeline "failure"))
    (is false "expected a host error")
    (catch cljs.core/ExceptionInfo e
      (is (= {:kind :host-error :function "stderr"} (ex-data e)))
      (is (re-find #"engine failure" (ex-message e))))))

(deftest file-hashes-use-canonical-abi
  (let [calls (guest)]
    (is (= "digest" (p/sha256! (p/file "a file.txt"))))
    (is (= "a file.txt" (payload calls "sha256"))))
  (let [calls (guest)]
    (set! (.-Host js/globalThis) #js {:getFunctions (fn [] #js {})})
    (is (thrown? cljs.core/ExceptionInfo (p/stdout! (p/pipeline "missing"))))
    (is (empty? @calls))))

(deftest every-canonical-import-obeys-pointer-json-and-void-contracts
  (doseq [[invoke function input output has-input? has-output? json-input? json-output?] contracts/calls]
    (testing function
      (let [values (js/Map.)
            input-pointer (js/BigInt 1)
            output-pointer (js/BigInt 2)
            calls (atom [])
            reads (atom 0)
            imports #js {}
            encoded (if json-output? (.stringify js/JSON (clj->js output)) output)]
        (.set values output-pointer encoded)
        (set! (.-Memory js/globalThis)
              #js {:fromString (fn [text] (.set values input-pointer text) #js {:offset input-pointer})
                   :find (fn [pointer]
                           (swap! reads inc)
                           (is (= output-pointer pointer))
                           #js {:readString (fn [] (.get values pointer))})})
        (aset imports function
              (fn [& args]
                (is (= (if has-input? [input-pointer] []) (vec args)))
                (swap! calls conj (.get values (first args)))
                (if has-output? output-pointer (js/BigInt 999))))
        (set! (.-Host js/globalThis) #js {:getFunctions (fn [] imports)})
        (is (= output (if has-input? (invoke input) (invoke))))
        (is (= 1 (count @calls)))
        (is (= (if has-output? 1 0) @reads))
        (when has-input?
          (is (= input (if json-input? (js->clj (.parse js/JSON (first @calls)) :keywordize-keys true)
                          (first @calls)))))))))

(deftest wire-validation-rejects-invalid-requests-before-host-calls
  (let [calls (guest)]
    (is (thrown? cljs.core/ExceptionInfo (pdk/nix! {:impure "true"})))
    (is (thrown? cljs.core/ExceptionInfo (pdk/wait-on! [-1 60])))
    (is (thrown? cljs.core/ExceptionInfo (pdk/wait-on! [4294967296])))
    (is (thrown? cljs.core/ExceptionInfo (pdk/add-secretmanager! {})))
    (is (thrown? cljs.core/ExceptionInfo (pdk/add-secretmanager! {:Aws {:aws_region "x"} :Google {}})))
    (is (empty? @calls))))

(deftest services-and-provider-steps-are-pure-and-ordered
  (let [calls (guest)
        db (-> (p/pipeline "db") (p/exec ["postgres"]) (p/as-service "db"))
        proxy (-> (p/pipeline "proxy") (p/with-service db) (p/exec ["proxy"]) (p/as-service "proxy"))
        client (-> (p/pipeline "client") (p/with-service proxy)
                   (p/using :nix true) (p/with-packages ["tool"])
                   p/trust p/install (p/wait-on 5432 5) (p/exec ["client"]))]
    (is (empty? @calls))
    (p/stdout! client)
    (is (= ["db" "proxy" "client"] (mapv :input (filter #(= "pipeline" (:function %)) @calls))))
    (is (= 2 (count (filter #(= "as_service" (:function %)) @calls))))
    (is (= {"impure" true} (js->clj (.parse js/JSON (payload calls "nix")))))
    (is (= [5432 5] (js->clj (.parse js/JSON (payload calls "wait_on")))))))

(deftest matrices-preserve-generic-values-stable-identities-and-builder-validation
  (let [calls (guest)
        cases (-> (m/product (m/axis "node" ["22" "24"]) (m/axis "suite" ["unit" "integration"]))
                  (m/exclude #(= ["22" "integration"] %))
                  (m/include [(m/named "experimental" ["26" "unit"])]))
        jobs (m/matrix "test" cases (fn [[node suite]] (h/task "ignored" node suite)))]
    (is (empty? @calls))
    (is (= ["test[node=22,suite=unit]" "test[node=24,suite=unit]" "test[node=24,suite=integration]" "test[experimental]"] (mapv :id jobs)))
    (is (= "x%2Cy%3Dz%21%27%28%29%2A%20%E4%B8%96%E7%95%8C" (:key (m/named "x,y=z!'()* 世界" 42))))
    (is (= [42] (mapv :value [(m/named "answer" 42)])))
    (let [called (atom 0) build (fn [_] (swap! called inc) (h/task "x" "printf" "."))]
      (doseq [[group selected] [["bad\n" cases] ["test" [(m/named "same" 1) (m/named "same" 2)]]
                                ["test" [(m/named "" 1)]] ["test" (vec (repeat 4097 (m/named "x" 1)))]]]
        (is (thrown? cljs.core/ExceptionInfo (m/matrix group selected build))))
      (is (zero? @called)))
    (is (thrown? cljs.core/ExceptionInfo (m/product (m/axis "a" (vec (repeat 65 "x"))) (m/axis "b" (vec (repeat 65 "y"))))))))

(deftest workflow-cache-files-and-package-combinators-compose-without-mutation
  (let [calls (guest)
        base (h/task "build" "cargo" ".")
        cache (-> (h/cache ["src"] ["target"] "rust-v1") (h/with-toolchain-files ["/bin/cat"]))
        producer (-> base (h/with-args ["build"]) (h/with-env "MODE" "release")
                     (h/retry 3 10) (h/output "version" "target/version") (h/artifact "binary" "target/bin")
                     (h/resource "checkout") (h/with-shared-resources ["toolchain"])
                     (h/with-relocatable-cache cache) (h/env-file "build.env"))
        consumer (-> (h/task "consume" "printf" ".") (h/after [producer]) (h/output-env "VALUE" producer "version"))
        cleanup (-> consumer (h/with-id "cleanup") h/always)
        provider (-> (h/provider :macports :rust) (h/with-provider-executable "/tools/port"))
        install (h/install "install" "." provider ["git"])
        compiled (-> (h/plan [producer consumer cleanup install]) (h/with-jobs 2)
                     (h/with-cache-directory "cache") (h/with-resource-directory "leases")
                     (h/with-workspace "." ["src"]) h/compile)]
    (is (empty? @calls))
    (is (= [] (:args base)))
    (is (= ["build"] (:needs consumer)))
    (is (= {:task "build" :name "version"} (get-in consumer [:policy :bindings "VALUE"])))
    (is (= 30000 (:timeout_ms cleanup) (:resource_wait_timeout_ms cleanup)))
    (is (= ["/bin/cat"] (get-in producer [:cache :toolchain_files])))
    (is (true? (get-in producer [:cache :relocatable])))
    (is (= "rust" (get-in install [:package_install :provider :backend])))
    (is (= 4 (count (get (js->clj (.parse js/JSON compiled)) "tasks"))))
    (is (= :write_bytes (get-in (f/write-bytes "write" "data.bin" [0 255] false ".") [:file_operation :op])))
    (is (thrown? cljs.core/ExceptionInfo (h/compile (h/with-jobs (h/plan []) 0))))
    (is (thrown? cljs.core/ExceptionInfo (h/compile (h/plan [base base]))))
    (is (thrown? cljs.core/ExceptionInfo (h/compile (h/plan [consumer]))))
    (is (thrown? cljs.core/ExceptionInfo (h/provider :homebrew :rust)))))

(def terminal-report
  {:outcome "succeeded"
   :tasks [{:id "job" :status "succeeded" :exit_code 0 :signal nil :error nil :duration_ms 1
            :stdout "run/0.stdout" :stderr "run/0.stderr"
            :cache {:outcome "stored" :key "key" :reason "stored" :components {"inputs" "digest"}}
            :wait_reason nil :outputs {"version" "1.0"}
            :artifacts {"binary" {:path "run/artifact" :size 2 :sha256 "digest"}}
            :attempts [{:number 1 :status "succeeded" :exit_code 0 :duration_ms 1 :error nil}]
            :allowed_failure false :condition_skipped false :file_result {"path" "file"}}]})

(deftest typed-results-validate-nested-fields-and-retain-dynamic-string-keys
  (let [encode #(.stringify js/JSON (clj->js %))
        report (h/decode-result (encode terminal-report))
        row (first (:tasks report))]
    (is (h/succeeded? report))
    (is (= "1.0" (get (:outputs row) "version")))
    (is (= 2 (:size (get (:artifacts row) "binary"))))
    (is (= "digest" (get-in row [:cache :components "inputs"])))
    (is (= "file" (get-in row [:file_result "path"])))
    (is (= 1 (:number (first (:attempts row)))))
    (doseq [value [(assoc terminal-report :outcome "pending")
                   (assoc-in terminal-report [:tasks 0 :status] "running")
                   (assoc-in terminal-report [:tasks 0 :exit_code] "0")
                   (assoc-in terminal-report [:tasks 0 :outputs "version"] 1)
                   (assoc-in terminal-report [:tasks 0 :artifacts "binary" :size] "2")
                   (assoc-in terminal-report [:tasks 0 :attempts 0 :number] "1")
                   (assoc-in terminal-report [:tasks 0 :cache :components "inputs"] 1)]]
      (is (thrown? cljs.core/ExceptionInfo (h/decode-result (encode value)))))
    (is (thrown? cljs.core/ExceptionInfo (h/decode-result "invalid JSON")))))

(deftest run-plan-submits-once-and-failed-jobs-return-a-report
  (let [calls (atom [])
        imports #js {:execute_plan (fn [input] (swap! calls conj input) (js/BigInt 2))}
        encoded (.stringify js/JSON (clj->js (assoc terminal-report :outcome "failed")))
        task (h/task "job" "printf" ".")]
    (set! (.-Host js/globalThis) #js {:getFunctions (fn [] imports)})
    (set! (.-Memory js/globalThis)
          #js {:fromString (fn [value]
                             (let [request (js->clj (.parse js/JSON value))]
                               (is (= "fresh run" (get request "run_dir")))
                               (is (= 2 (get-in request ["plan" "jobs"]))))
                             #js {:offset (js/BigInt 1)})
               :find (fn [_] #js {:readString (fn [] encoded)})})
    (is (false? (h/succeeded? (h/run! (m/parallel [task] 2) "fresh run"))))
    (is (= [(js/BigInt 1)] @calls))))

(defmethod test/report [::test/default :end-run-tests] [summary]
  (set! (.-exitCode js/process) (if (test/successful? summary) 0 1)))

(defn -main [] (run-tests 'fluentci.test-runner))
(set! *main-cli-fn* -main)
