(ns fluentci.codec
  "Validation for generated guest FFI. Never reports payloads (which may be secrets).")

(declare valid?)
(defn valid? [schemas schema value]
  (cond
    (and (nil? value) (get schema "nullable")) true
    (get schema "$ref") (valid? schemas (get schemas (last (.split (get schema "$ref") "/"))) value)
    (get schema "properties")
    (and (map? value)
         (every? #(contains? value (keyword %)) (get schema "required"))
         (every? (fn [[key spec]] (or (not (contains? value (keyword key)))
                                     (valid? schemas spec (get value (keyword key)))))
                 (get schema "properties"))
         (if (= schema (get schemas "Provider"))
           (and (= 1 (count value))
                (every? #(contains? (get schema "properties") (name %)) (keys value))
                (every? some? (vals value)))
           true))
    :else
    (case (get schema "type")
      "string" (string? value)
      "boolean" (boolean? value)
      "integer" (and (int? value) (<= 0 value 4294967295))
      "array" (and (vector? value) (every? #(valid? schemas (get schema "items") %) value))
      "buffer" (and (vector? value)
                    (every? #(and (vector? %) (= 2 (count %)) (every? string? %)) value))
      false)))

(defn validate! [schemas schema value]
  (when-not (valid? schemas schema value)
    (throw (ex-info "Invalid PDK wire value" {:kind :invalid-wire-value})))
  value)

(defn decode! [schemas schema encoded]
  (try
    (validate! schemas schema (js->clj (.parse js/JSON encoded) :keywordize-keys true))
    (catch :default _
      (throw (ex-info "Invalid PDK response" {:kind :invalid-wire-value})))))
