(ns ^:typed.clojure fluentci.bridge
  "Trusted Extism guest ABI. Only this namespace contains JavaScript interop."
  #?(:clj (:require [typed.clojure :as t])))

#?(:clj (t/ann call! [t/Str (t/Option t/Str) t/Bool -> t/Str]))
(defn call! [function input output?]
  #?(:clj (throw (ex-info "The guest ABI is available only inside Extism" {}))
     :cljs
     (try
       (let [functions (.getFunctions js/Host)
             f (aget functions function)]
         (when-not (fn? f)
           (throw (js/Error. (str "FluentCI engine does not expose " function))))
         (let [offset (if (nil? input)
                        (f)
                        (f (.-offset (.fromString js/Memory input))))]
           (if output? (.readString (.find js/Memory offset)) "")))
       (catch :default e
         (throw (ex-info (str "FluentCI " function ": " (.-message e))
                         {:kind :host-error :function function} e))))))

#?(:clj (t/ann json [t/Any -> t/Str]))
(defn json [value]
  #?(:clj (throw (ex-info "Guest JSON encoding requires JavaScript" {}))
     :cljs (.stringify js/JSON (clj->js value))))

#?(:clj (t/ann handle [t/Str -> t/Str]))
(defn handle [encoded]
  #?(:clj (throw (ex-info "Guest JSON decoding requires JavaScript" {}))
     :cljs
     (let [id (.-id (.parse js/JSON encoded))]
       (if (string? id) id
           (throw (ex-info "FluentCI returned an invalid handle" {:kind :invalid-handle}))))))

#?(:clj (t/ann input! [-> t/Str]))
(defn input! []
  #?(:clj (throw (ex-info "Guest input requires Extism" {}))
     :cljs (.inputString js/Host)))

#?(:clj (t/ann output! [t/Str -> nil]))
(defn output! [value]
  #?(:clj (throw (ex-info "Guest output requires Extism" {}))
     :cljs (do (.outputString js/Host value) nil)))

#?(:clj (t/ann component [t/Str -> t/Str]))
(defn component [value]
  #?(:clj (throw (ex-info "Guest URI encoding requires JavaScript" {}))
     :cljs (.replace (js/encodeURIComponent value) (js/RegExp. "[!'()*]" "g")
                     (fn [character] (str "%" (.toUpperCase (.toString (.charCodeAt character 0) 16)))))))
