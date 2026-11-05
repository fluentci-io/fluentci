(ns fluentci.report
  "Trusted terminal-report decoder. Validate nested values before typed code sees them."
  (:refer-clojure :exclude [object?]))

(def statuses #{"succeeded" "failed" "skipped" "cancelled" "timed_out"})
(defn optional? [predicate value] (or (nil? value) (predicate value)))
(defn string-map? [value]
  (and (map? value) (every? string? (keys value)) (every? string? (vals value))))
(defn object? [value] (and (map? value) (every? string? (keys value))))
(declare json-value?)
(defn json-value? [value]
  (or (nil? value) (boolean? value) (string? value) (number? value)
      (and (vector? value) (every? json-value? value))
      (and (object? value) (every? json-value? (vals value)))))
(defn artifact? [value]
  (and (object? value) (string? (get value "path")) (int? (get value "size"))
       (string? (get value "sha256"))))
(defn attempt? [value]
  (and (object? value) (int? (get value "number")) (contains? statuses (get value "status"))
       (optional? int? (get value "exit_code")) (int? (get value "duration_ms"))
       (optional? string? (get value "error"))))
(defn cache? [value]
  (and (object? value) (string? (get value "outcome")) (optional? string? (get value "key"))
       (string? (get value "reason")) (string-map? (get value "components" {}))))
(defn task? [value]
  (and (object? value) (string? (get value "id")) (contains? statuses (get value "status"))
       (optional? int? (get value "exit_code")) (optional? int? (get value "signal"))
       (optional? string? (get value "error")) (int? (get value "duration_ms"))
       (every? #(string? (get value %)) ["stdout" "stderr"])
       (cache? (get value "cache")) (optional? string? (get value "wait_reason"))
       (string-map? (get value "outputs" {}))
       (object? (get value "artifacts" {})) (every? artifact? (vals (get value "artifacts" {})))
       (vector? (get value "attempts" [])) (every? attempt? (get value "attempts" []))
       (boolean? (get value "allowed_failure" false)) (boolean? (get value "condition_skipped" false))
       (json-value? (get value "file_result"))
       (optional? #(and (object? %) (string? (get % "stdout")) (string? (get % "stderr"))) (get value "probe_logs"))))

(defn fields [value] (into {} (map (fn [[key value]] [(keyword key) value]) value)))
(defn decode [encoded]
  (try
    (let [result (js->clj (.parse js/JSON encoded))
          tasks (get result "tasks")]
      (when-not (and (object? result) (#{"succeeded" "failed" "cancelled"} (get result "outcome"))
                    (vector? tasks) (every? task? tasks))
        (throw (ex-info "Invalid report" {})))
      {:outcome (get result "outcome")
       :tasks (mapv (fn [row]
                      (merge (fields row)
                             {:exit_code (get row "exit_code") :signal (get row "signal") :error (get row "error")
                              :wait_reason (get row "wait_reason") :file_result (get row "file_result")
                              :cache (assoc (fields (get row "cache")) :key (get-in row ["cache" "key"])
                                            :components (get-in row ["cache" "components"] {}))
                              :probe_logs (some-> (get row "probe_logs") fields)
                              :outputs (get row "outputs" {})
                              :artifacts (into {} (map (fn [[key value]] [key (fields value)]) (get row "artifacts" {})))
                              :attempts (mapv #(assoc (fields %) :exit_code (get % "exit_code") :error (get % "error")) (get row "attempts" []))
                              :allowed_failure (get row "allowed_failure" false)
                              :condition_skipped (get row "condition_skipped" false)})) tasks)})
    (catch :default _
      ;; A diagnostic must not include environment values or file contents.
      (throw (ex-info "Invalid terminal plan report" {:kind :invalid-report})))))
