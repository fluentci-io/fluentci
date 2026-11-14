(ns fluentci.flow
  "Deferred typed-component pipelines, compatible with thread-first composition."
  (:refer-clojure :exclude [map run!])
  (:require ["fluentci:pipeline" :as runtime]))
(defn pipeline [name] (runtime/pipeline name))
(defn workdir [pipeline path] (runtime/workdir pipeline path))
(defn env [pipeline key value] (runtime/env pipeline key value))
(defn exec [pipeline argv] (runtime/exec pipeline (clj->js argv)))
(defn map [pipeline project] (runtime/map pipeline (fn [value] (clj->js (project (js->clj value :keywordize-keys true))))))
(defn ensuring [pipeline cleanup] (runtime/ensuring pipeline (fn [_] (cleanup))))
(defn run! [pipeline] (js->clj (runtime/run pipeline) :keywordize-keys true))
