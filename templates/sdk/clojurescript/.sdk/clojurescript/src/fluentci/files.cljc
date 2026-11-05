(ns ^:typed.clojure fluentci.files
  "Pure native file tasks. Paths stay inside cwd; queries return file_result."
  (:refer-clojure :exclude [read-string read-line remove hash])
  (:require [fluentci.host :as h] #?(:clj [typed.clojure :as t])))

#?(:clj (t/ann read-text [t/Str t/Str t/Int t/Str -> h/Task]))
(defn read-text [id path limit-bytes cwd]
  (h/file-task id {:op :read_text :path path :limit_bytes limit-bytes} cwd))

#?(:clj (t/ann read-bytes [t/Str t/Str t/Int t/Str -> h/Task]))
(defn read-bytes [id path limit-bytes cwd]
  (h/file-task id {:op :read_bytes :path path :limit_bytes limit-bytes} cwd))

#?(:clj (t/ann write-text [t/Str t/Str t/Str t/Bool t/Str -> h/Task]))
(defn write-text [id path text overwrite? cwd]
  (h/file-task id {:op :write_text :path path :text text :overwrite overwrite?} cwd))

#?(:clj (t/ann write-bytes [t/Str t/Str (t/Vec t/Int) t/Bool t/Str -> h/Task]))
(defn write-bytes [id path bytes overwrite? cwd]
  (h/file-task id {:op :write_bytes :path path :bytes bytes :overwrite overwrite?} cwd))

#?(:clj (t/ann copy-file [t/Str t/Str t/Str t/Bool t/Str -> h/Task]))
(defn copy-file [id source destination overwrite? cwd]
  (h/file-task id {:op :copy_file :source source :destination destination :overwrite overwrite?} cwd))

#?(:clj (t/ann copy-tree [t/Str t/Str t/Str t/Bool t/Str -> h/Task]))
(defn copy-tree [id source destination overwrite? cwd]
  (h/file-task id {:op :copy_tree :source source :destination destination :overwrite overwrite?} cwd))

#?(:clj (t/ann move [t/Str t/Str t/Str t/Bool t/Str -> h/Task]))
(defn move [id source destination overwrite? cwd]
  (h/file-task id {:op :move :source source :destination destination :overwrite overwrite?} cwd))

#?(:clj (t/ann mkdir [t/Str t/Str t/Bool t/Str -> h/Task]))
(defn mkdir [id path parents? cwd]
  (h/file-task id {:op :mkdir :path path :parents parents?} cwd))

#?(:clj (t/ann remove [t/Str t/Str t/Bool t/Bool t/Str -> h/Task]))
(defn remove [id path recursive? missing-ok? cwd]
  (h/file-task id {:op :remove :path path :recursive recursive? :missing_ok missing-ok?} cwd))

#?(:clj (t/ann stat [t/Str t/Str t/Str -> h/Task]))
(defn stat [id path cwd]
  (h/file-task id {:op :stat :path path} cwd))

#?(:clj (t/ann exists [t/Str t/Str t/Str -> h/Task]))
(defn exists [id path cwd]
  (h/file-task id {:op :exists :path path} cwd))

#?(:clj (t/ann list-entries [t/Str t/Str t/Str -> h/Task]))
(defn list-entries [id path cwd]
  (h/file-task id {:op :list :path path} cwd))

#?(:clj (t/ann glob [t/Str t/Str t/Str -> h/Task]))
(defn glob [id pattern cwd]
  (h/file-task id {:op :glob :pattern pattern} cwd))

#?(:clj (t/ann hash [t/Str t/Str t/Str -> h/Task]))
(defn hash [id path cwd]
  (h/file-task id {:op :hash :path path} cwd))

#?(:clj (t/ann chmod [t/Str t/Str t/Int t/Str -> h/Task]))
(defn chmod [id path mode cwd]
  (h/file-task id {:op :chmod :path path :mode mode} cwd))

#?(:clj (t/ann symlink [t/Str t/Str t/Str t/Str -> h/Task]))
(defn symlink [id target path cwd]
  (h/file-task id {:op :symlink :target target :path path} cwd))
