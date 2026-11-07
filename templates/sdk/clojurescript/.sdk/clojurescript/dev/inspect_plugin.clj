(ns inspect-plugin
  "Inspect source forms without evaluating plugin code; Typed Clojure validates them before compilation."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]))

(defn forms [file features]
  (with-open [reader (java.io.PushbackReader. (io/reader file))]
    (binding [*data-readers* (assoc *data-readers* 'js identity)]
      (loop [values []]
        (let [value (read {:eof ::eof :read-cond :allow :features features} reader)]
          (if (= value ::eof) values (recur (conj values value))))))))

(defn json [value]
  (cond
    (map? value) (str "{" (str/join "," (map (fn [[key value]] (str (json (name key)) ":" (json value))) value)) "}")
    (sequential? value) (str "[" (str/join "," (map json value)) "]")
    (string? value) (pr-str value)
    (nil? value) "null"
    (boolean? value) (str value)
    :else (throw (ex-info "Unsupported metadata JSON value" {:value value}))))

(defn source [paths namespace]
  (or (some (fn [path]
              (some (fn [extension]
                      (let [file (io/file path (str (str/replace (str namespace) "." "/") extension))]
                        (when (.isFile file) file))) [".cljc" ".cljs"])) paths)
      (throw (ex-info "Cannot find exported namespace source" {:namespace namespace}))))

(defn aliases [forms]
  (let [namespace (first (filter #(and (seq? %) (= 'ns (first %))) forms))]
    (into {} (for [clause (drop 2 namespace) :when (and (seq? clause) (= :require (first clause)))
                   dependency (rest clause) :when (vector? dependency)
                   :let [options (apply hash-map (rest dependency))] :when (:as options)]
               [(:as options) (first dependency)]))))

(defn inspect [main paths]
  (let [entry (forms (source paths main) #{:cljs})
        modules (aliases entry)
        exports (some #(when (and (seq? %) (= 'set! (first %)) (= '(.-exports js/module) (second %))) (nth % 2)) entry)]
    (when-not (map? exports) (throw (ex-info "Export a literal #js map from the guest entrypoint" {})))
    {:functions
     (into {} (for [[export target] exports :when (not (str/starts-with? (name export) "__"))]
       (let [target-ns (get modules (symbol (namespace target)))
             file (source paths target-ns)
             code (forms file #{:clj})
             requirements (aliases code)
             typed? (fn [symbol operation]
                      (and (symbol? symbol) (= operation (name symbol))
                           (= 'typed.clojure (get requirements (some-> (namespace symbol) clojure.core/symbol)))))
             definition (some #(when (and (seq? %) (= 'defn (first %)) (= (symbol (name target)) (second %))) %) code)
             annotation (some #(when (and (seq? %) (typed? (first %) "ann") (= (symbol (name target)) (second %))) (nth % 2)) code)
             type-aliases (into {} (keep #(when (and (seq? %) (typed? (first %) "defalias")) [(second %) (nth % 2)]) code))
             expand (fn expand [value seen]
                      (if-let [alias (get type-aliases value)]
                        (if (contains? seen value) (throw (ex-info "Recursive input aliases unsupported" {})) (expand alias (conj seen value))) value))
             wire (fn wire [type]
                    (let [type (expand type #{})
                          simple (when (symbol? type) (name type))]
                      (or (get {"Str" "string" "Int" "integer" "Num" "number" "Bool" "boolean"} simple)
                          (when (and (seq? type) (= "Vec" (name (first type))) (= 2 (count type)))
                            (let [inner (wire (second type))]
                              (when (str/ends-with? inner "[]") (throw (ex-info "Nested input vectors unsupported" {})))
                              (str inner "[]")))
                          (throw (ex-info "Unsupported concrete CLI input type" {:type type})))))
             body (drop 2 definition)
             description (when (string? (first body)) (first body))
             body (if description (rest body) body)
             body (if (map? (first body)) (rest body) body)
             parameters (first body)]
         (when-not (and (vector? annotation) (vector? parameters)
                        (= '-> (nth annotation (- (count annotation) 2)))
                        (= (count parameters) (- (count annotation) 2)))
           (throw (ex-info "Exports need a single typed defn signature validated by Typed Clojure" {:function target})))
         (let [metadata (cond-> {:name (name export) :returnType (pr-str (last annotation))
                                :componentReturnType (if (nil? (last annotation)) "unit" (try (wire (last annotation)) (catch clojure.lang.ExceptionInfo _ nil)))}
                          description (assoc :description description))]
           [(name export)
            (case (count parameters)
              0 metadata
              1 (let [record (expand (first annotation) #{})]
                  (when-not (and (seq? record) (= "HMap" (name (first record))))
                    (throw (ex-info "Typed exports accept one concrete HMap argument" {:function target})))
                  (let [options (apply hash-map (rest record))]
                    (when (seq (dissoc options :mandatory :optional :complete?))
                      (throw (ex-info "Unsupported HMap input option" {})))
                    (assoc metadata :inputFormat "json" :args
                      (vec (for [[required fields] [[true (:mandatory options)] [false (:optional options)]]
                                 [key type] fields]
                             (do (when-not (and (keyword? key) (nil? (namespace key))) (throw (ex-info "CLI HMap keys must be plain keywords" {})))
                                 (cond-> {:name (name key) :type (wire type)} (not required) (assoc :required false))))))))
              (throw (ex-info "Use one typed argument record" {:function target})))]))))}))
