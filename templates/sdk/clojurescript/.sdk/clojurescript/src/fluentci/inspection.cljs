(ns fluentci.inspection)

(defn invoke!
  "Convert the standard JSON argument record into a native keyword map."
  [function input]
  (let [result (function (js->clj input :keywordize-keys true))]
    (when-not (nil? result)
      (.outputString js/Host
        (if (string? result) result (js/JSON.stringify (clj->js result)))))))

(defn component-invoke
  "Call a typed component handler without the Extism ABI."
  [function input]
  (clj->js (if (undefined? input)
             (function)
             (function (js->clj input :keywordize-keys true)))))
