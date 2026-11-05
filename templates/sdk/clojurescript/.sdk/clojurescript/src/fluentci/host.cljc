(ns ^:typed.clojure fluentci.host
  "Pure native task and plan values. Submit the entire plan with run!."
  (:refer-clojure :exclude [compile run!])
  (:require [fluentci.bridge :as bridge]
            [fluentci.pdk :as pdk]
            #?(:cljs [fluentci.report :as report])
            #?(:clj [typed.clojure :as t])))

#?(:clj
   (do
     (t/defalias FileValue (t/Rec [v] (t/U nil t/Bool t/Num t/Str (t/Vec v) (t/Map t/Str v))))
     (t/defalias Condition (t/U ':success ':failure ':always ':never))
     (t/defalias Retry (t/HMap :mandatory {:max_attempts t/Int :delay_ms t/Int :max_delay_ms t/Int :exit_codes (t/Vec t/Int)}))
     (t/defalias OutputRef (t/HMap :mandatory {:task t/Str :name t/Str}))
     (t/defalias Policy (t/HMap :mandatory {:when t/Str :allow_failure t/Bool :outputs (t/Map t/Str t/Str)
                                          :artifacts (t/Map t/Str t/Str) :bindings (t/Map t/Str OutputRef)}
                               :optional {:retry Retry}))
     (t/defalias Cache (t/HMap :mandatory {:inputs (t/Vec t/Str) :outputs (t/Vec t/Str) :toolchain t/Str
                                         :toolchain_files (t/Vec t/Str) :relocatable t/Bool}))
     (t/defalias Probe (t/HMap :mandatory {:program t/Str :args (t/Vec t/Str) :interval_ms t/Int :timeout_ms t/Int}))
     (t/defalias Service (t/HMap :mandatory {:readiness Probe :startup_timeout_ms t/Int :shutdown_timeout_ms t/Int :failure_threshold t/Int}
                                :optional {:health Probe}))
     (t/defalias Manager (t/U ':homebrew ':macports ':freebsd ':netbsd ':openbsd))
     (t/defalias Backend (t/U ':native ':rust))
     (t/defalias Provider (t/HMap :mandatory {:manager t/Str :backend t/Str} :optional {:executable t/Str}))
     (t/defalias FileOperation
       (t/U
        (t/HMap :mandatory {:op ':read_text :path t/Str :limit_bytes t/Int})
        (t/HMap :mandatory {:op ':read_bytes :path t/Str :limit_bytes t/Int})
        (t/HMap :mandatory {:op ':write_text :path t/Str :text t/Str :overwrite t/Bool})
        (t/HMap :mandatory {:op ':write_bytes :path t/Str :bytes (t/Vec t/Int) :overwrite t/Bool})
        (t/HMap :mandatory {:op ':copy_file :source t/Str :destination t/Str :overwrite t/Bool})
        (t/HMap :mandatory {:op ':copy_tree :source t/Str :destination t/Str :overwrite t/Bool})
        (t/HMap :mandatory {:op ':move :source t/Str :destination t/Str :overwrite t/Bool})
        (t/HMap :mandatory {:op ':mkdir :path t/Str :parents t/Bool})
        (t/HMap :mandatory {:op ':remove :path t/Str :recursive t/Bool :missing_ok t/Bool})
        (t/HMap :mandatory {:op ':stat :path t/Str})
        (t/HMap :mandatory {:op ':exists :path t/Str})
        (t/HMap :mandatory {:op ':list :path t/Str})
        (t/HMap :mandatory {:op ':glob :pattern t/Str})
        (t/HMap :mandatory {:op ':hash :path t/Str})
        (t/HMap :mandatory {:op ':chmod :path t/Str :mode t/Int})
        (t/HMap :mandatory {:op ':symlink :target t/Str :path t/Str})))
     (t/defalias Task
       (t/HMap :mandatory {:id t/Str :program t/Str :args (t/Vec t/Str) :cwd t/Str :env (t/Map t/Str t/Str)
                          :needs (t/Vec t/Str) :resources (t/Vec t/Str) :shared_resources (t/Vec t/Str)
                          :env_files (t/Vec t/Str) :package_environment (t/Vec Provider) :policy Policy}
               :optional {:timeout_ms t/Int :resource_wait_timeout_ms t/Int :cache Cache :service Service
                          :primitive t/Any :file_operation FileOperation
                          :package_install (t/HMap :mandatory {:provider Provider :packages (t/Vec t/Str)})}))
     (t/defalias Plan
       (t/HMap :mandatory {:version (t/Val 1) :tasks (t/Vec Task) :jobs t/Int :max_services t/Int :fail_fast t/Bool :inherit_env t/Bool}
               :optional {:cache_dir t/Str :resource_dir t/Str
                          :workspace (t/HMap :mandatory {:source t/Str :inputs (t/Vec t/Str)})}))
     (t/defalias Artifact (t/HMap :mandatory {:path t/Str :size t/Int :sha256 t/Str}))
     (t/defalias Status (t/U (t/Val "succeeded") (t/Val "failed") (t/Val "skipped") (t/Val "cancelled") (t/Val "timed_out")))
     (t/defalias Outcome (t/U (t/Val "succeeded") (t/Val "failed") (t/Val "cancelled")))
     (t/defalias CacheResult (t/HMap :mandatory {:outcome t/Str :key (t/Option t/Str) :reason t/Str :components (t/Map t/Str t/Str)}))
     (t/defalias Attempt (t/HMap :mandatory {:number t/Int :status Status :exit_code (t/Option t/Int)
                                           :duration_ms t/Int :error (t/Option t/Str)}))
     (t/defalias TaskResult
       (t/HMap :mandatory {:id t/Str :status Status :exit_code (t/Option t/Int) :stdout t/Str :stderr t/Str
                          :error (t/Option t/Str) :outputs (t/Map t/Str t/Str) :artifacts (t/Map t/Str Artifact)
                          :attempts (t/Vec Attempt) :allowed_failure t/Bool :condition_skipped t/Bool
                          :duration_ms t/Int :cache CacheResult :wait_reason (t/Option t/Str)
                          :signal (t/Option t/Int) :file_result FileValue
                          :probe_logs (t/Option (t/HMap :mandatory {:stdout t/Str :stderr t/Str}))}))
     (t/defalias RunResult (t/HMap :mandatory {:outcome Outcome :tasks (t/Vec TaskResult)}))))

#?(:clj (t/ann task [t/Str t/Str t/Str -> Task]))
(defn task [id program cwd]
  {:id id :program program :cwd cwd :args [] :env {} :needs [] :resources [] :shared_resources []
   :env_files [] :package_environment []
   :policy {:when "success" :allow_failure false :outputs {} :artifacts {} :bindings {}}})

#?(:clj (t/ann with-id [Task t/Str -> Task]))
(defn with-id [task id] (assoc task :id id))
#?(:clj (t/ann with-args [Task (t/Vec t/Str) -> Task]))
(defn with-args [task args] (assoc task :args args))
#?(:clj (t/ann with-env [Task t/Str t/Str -> Task]))
(defn with-env [task key value] (assoc task :env (assoc (:env task) key value)))
#?(:clj (t/ann after [Task (t/Vec Task) -> Task]))
(defn after [task parents] (update task :needs #(vec (distinct (into % (map :id parents))))))
#?(:clj (t/ann needs [Task (t/Vec Task) -> Task]))
(defn needs [task parents] (assoc task :needs (mapv :id parents)))
#?(:clj (t/ann resource [Task t/Str -> Task]))
(defn resource [task name] (update task :resources #(vec (distinct (conj % name)))))
#?(:clj (t/ann with-resources [Task (t/Vec t/Str) -> Task]))
(defn with-resources [task names] (assoc task :resources names))
#?(:clj (t/ann with-shared-resources [Task (t/Vec t/Str) -> Task]))
(defn with-shared-resources [task names] (assoc task :shared_resources names))
#?(:clj (t/ann with-timeout [Task t/Int -> Task]))
(defn with-timeout [task milliseconds] (assoc task :timeout_ms milliseconds))
#?(:clj (t/ann with-resource-wait-timeout [Task t/Int -> Task]))
(defn with-resource-wait-timeout [task milliseconds] (assoc task :resource_wait_timeout_ms milliseconds))
#?(:clj (t/ann env-file [Task t/Str -> Task]))
(defn env-file [task path] (update task :env_files conj path))

#?(:clj (t/ann cache [(t/Vec t/Str) (t/Vec t/Str) t/Str -> Cache]))
(defn cache [inputs outputs toolchain]
  {:inputs inputs :outputs outputs :toolchain toolchain :toolchain_files [] :relocatable false})
#?(:clj (t/ann with-toolchain-files [Cache (t/Vec t/Str) -> Cache]))
(defn with-toolchain-files [cache paths] (assoc cache :toolchain_files paths))
#?(:clj (t/ann with-cache [Task Cache -> Task]))
(defn with-cache [task cache] (assoc task :cache cache))
#?(:clj (t/ann with-relocatable-cache [Task Cache -> Task]))
(defn with-relocatable-cache [task cache] (with-cache task (assoc cache :relocatable true)))

#?(:clj (t/ann retry-policy [t/Int t/Int t/Int (t/Vec t/Int) -> Retry]))
(defn retry-policy [attempts delay-ms max-delay-ms exit-codes]
  (if (and (<= 1 attempts 100) (<= 1 delay-ms max-delay-ms 60000))
    {:max_attempts attempts :delay_ms delay-ms :max_delay_ms max-delay-ms :exit_codes exit-codes}
    (throw (ex-info "Invalid retry limits" {:kind :invalid-plan}))))
#?(:clj (t/ann with-retry [Task Retry -> Task]))
(defn with-retry [task policy] (assoc task :policy (assoc (:policy task) :retry policy)))
#?(:clj (t/ann retry [Task t/Int t/Int -> Task]))
(defn retry [task attempts delay-ms] (with-retry task (retry-policy attempts delay-ms 60000 [])))
#?(:clj (t/ann when-task [Task Condition -> Task]))
(defn when-task [task condition]
  (let [configured (assoc task :policy (assoc (:policy task) :when (name condition)))]
    (if (or (= condition :always) (= condition :failure))
      (-> configured
          (with-timeout (or (:timeout_ms task) 30000))
          (with-resource-wait-timeout (or (:resource_wait_timeout_ms task) 30000)))
      configured)))
#?(:clj (t/ann always [Task -> Task]))
(defn always [task] (when-task task :always))
#?(:clj (t/ann allow-failure [Task t/Bool -> Task]))
(defn allow-failure [task enabled] (assoc task :policy (assoc (:policy task) :allow_failure enabled)))
#?(:clj (t/ann artifact [Task t/Str t/Str -> Task]))
(defn artifact [task name path]
  (let [policy (:policy task)] (assoc task :policy (assoc policy :artifacts (assoc (:artifacts policy) name path)))))
#?(:clj (t/ann output [Task t/Str t/Str -> Task]))
(defn output [task name path]
  (let [policy (:policy task)] (assoc task :policy (assoc policy :outputs (assoc (:outputs policy) name path)))))
#?(:clj (t/ann output-env [Task t/Str Task t/Str -> Task]))
(defn output-env [task key producer name]
  (let [policy (:policy task)]
    (assoc (after task [producer]) :policy
           (assoc policy :bindings (assoc (:bindings policy) key {:task (:id producer) :name name})))))

#?(:clj (t/ann probe [t/Str (t/Vec t/Str) t/Int t/Int -> Probe]))
(defn probe [program args interval-ms timeout-ms]
  {:program program :args args :interval_ms interval-ms :timeout_ms timeout-ms})
#?(:clj (t/ann service [Probe -> Service]))
(defn service [readiness]
  {:readiness readiness :startup_timeout_ms 30000 :shutdown_timeout_ms 5000 :failure_threshold 3})
#?(:clj (t/ann with-health [Service Probe -> Service]))
(defn with-health [service health] (assoc service :health health))
#?(:clj (t/ann with-service-limits [Service t/Int t/Int t/Int -> Service]))
(defn with-service-limits [service startup-ms shutdown-ms failures]
  (assoc service :startup_timeout_ms startup-ms :shutdown_timeout_ms shutdown-ms :failure_threshold failures))
#?(:clj (t/ann as-service [Task Service -> Task]))
(defn as-service [task service] (assoc task :service service))

#?(:clj (t/ann provider [Manager Backend -> Provider]))
(defn provider [manager backend]
  (if (or (= manager :macports) (= backend :native))
    {:manager (name manager) :backend (name backend)}
    (throw (ex-info "Only MacPorts supports the rust backend" {:kind :invalid-provider}))))
#?(:clj (t/ann with-provider-executable [Provider t/Str -> Provider]))
(defn with-provider-executable [provider executable] (assoc provider :executable executable))
#?(:clj (t/ann install [t/Str t/Str Provider (t/Vec t/Str) -> Task]))
(defn install [id cwd provider packages]
  (assoc (task id "" cwd) :package_install {:provider provider :packages packages}))
#?(:clj (t/ann with-package-environment [Task (t/Vec Provider) -> Task]))
(defn with-package-environment [task providers] (assoc task :package_environment providers))
#?(:clj (t/ann file-task [t/Str FileOperation t/Str -> Task]))
(defn file-task [id operation cwd]
  (when (and (= (:op operation) :write_bytes) (some #(not (<= 0 % 255)) (:bytes operation)))
    (throw (ex-info "File bytes must be in 0..255" {:kind :invalid-plan})))
  (assoc (task id "" cwd) :file_operation operation))

#?(:clj (t/ann plan [(t/Vec Task) -> Plan]))
(defn plan [tasks] {:version 1 :tasks tasks :jobs 1 :max_services 8 :fail_fast true :inherit_env false})
#?(:clj (t/ann with-jobs [Plan t/Int -> Plan]))
(defn with-jobs [plan jobs] (assoc plan :jobs jobs))
#?(:clj (t/ann with-max-services [Plan t/Int -> Plan]))
(defn with-max-services [plan count] (assoc plan :max_services count))
#?(:clj (t/ann with-fail-fast [Plan t/Bool -> Plan]))
(defn with-fail-fast [plan enabled] (assoc plan :fail_fast enabled))
#?(:clj (t/ann with-cache-directory [Plan t/Str -> Plan]))
(defn with-cache-directory [plan path] (assoc plan :cache_dir path))
#?(:clj (t/ann with-resource-directory [Plan t/Str -> Plan]))
(defn with-resource-directory [plan path] (assoc plan :resource_dir path))
#?(:clj (t/ann with-workspace [Plan t/Str (t/Vec t/Str) -> Plan]))
(defn with-workspace [plan source inputs] (assoc plan :workspace {:source source :inputs inputs}))
#?(:clj (t/ann with-inherit-env [Plan t/Bool -> Plan]))
(defn with-inherit-env [plan enabled] (assoc plan :inherit_env enabled))

#?(:clj (t/ann validate [Plan -> Plan]))
(defn validate [plan]
  (let [ids (mapv :id (:tasks plan))]
    (when (or (< (:jobs plan) 1) (< (:max_services plan) 1)
                          (some empty? ids) (not= (count ids) (count (set ids))))
      (throw (ex-info "Plan requires positive limits and unique nonempty task IDs" {:kind :invalid-plan})))
    (doseq [task (:tasks plan)]
      (when (or (empty? (:cwd task))
                            (and (empty? (:program task)) (nil? (:file_operation task)) (nil? (:package_install task)) (nil? (:primitive task)))
                            (some #(not (contains? (set ids) %)) (:needs task)))
        (throw (ex-info "Invalid task or missing dependency" {:kind :invalid-plan :task (:id task)})))))
  plan)

#?(:clj (t/ann compile [Plan -> t/Str]))
(defn compile [plan] (bridge/json (validate plan)))

#?(:clj (t/ann decode-result [t/Str -> RunResult]))
(defn decode-result [encoded]
  ;; The report decoder validates every declared field and nested value.
  #?(:clj (throw (ex-info "Guest result decoding requires JavaScript" {}))
     :cljs (report/decode encoded)))

#?(:clj (t/ann run! [Plan t/Str -> RunResult]))
(defn run! [plan directory]
  (decode-result (pdk/execute-plan! (bridge/json {:plan (validate plan) :run_dir directory}))))
#?(:clj (t/ann succeeded? [RunResult -> t/Bool]))
(defn succeeded? [result] (= "succeeded" (:outcome result)))
