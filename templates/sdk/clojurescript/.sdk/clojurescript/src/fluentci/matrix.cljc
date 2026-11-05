(ns ^:typed.clojure fluentci.matrix
  "Pure, polymorphic matrix cases. Values retain their types through expansion."
  (:require [fluentci.host :as h] [fluentci.bridge :as bridge]
            #?(:clj [typed.clojure :as t])))

#?(:clj (t/defalias Case (t/TFn [[a :variance :covariant]]
                        (t/HMap :mandatory {:key t/Str :value a}))))

#?(:clj (t/ann named (t/All [a] [t/Str a -> (Case a)])))
(defn named [name value] {:key (bridge/component name) :value value})

#?(:clj (t/ann axis [t/Str (t/Vec t/Str) -> (t/Vec (Case t/Str))]))
(defn axis [name values]
  (mapv (fn [value] {:key (str (bridge/component name) "=" (bridge/component value)) :value value}) values))

#?(:clj (t/ann pair-case (t/All [a b] [(Case a) (Case b) -> (Case (t/HVec [a b]))])))
(defn- pair-case [left right]
  {:key (str (:key left) "," (:key right)) :value [(:value left) (:value right)]})

#?(:clj (t/ann product (t/All [a b] [(t/Vec (Case a)) (t/Vec (Case b)) -> (t/Vec (Case (t/HVec [a b])))])))
(defn product [left right]
  (when (> (* (count left) (count right)) 4096)
    (throw (ex-info "Matrix expansion exceeds 4096 cases" {:kind :invalid-matrix})))
  (vec (for [l left r right] (pair-case l r))))

#?(:clj (t/ann include (t/All [a] [(t/Vec (Case a)) (t/Vec (Case a)) -> (t/Vec (Case a))])))
(defn include [cases extra] (into cases extra))
#?(:clj (t/ann exclude (t/All [a] [(t/Vec (Case a)) [a -> t/Bool] -> (t/Vec (Case a))])))
(defn exclude [cases predicate] (filterv #(not (predicate (:value %))) cases))

#?(:clj (t/ann matrix (t/All [a] [t/Str (t/Vec (Case a)) [a -> h/Task] -> (t/Vec h/Task)])))
(defn matrix [group cases build]
  (let [keys (mapv :key cases)]
    (when (or (not (<= 1 (count group) 64)) (re-find #"[^A-Za-z0-9_.-]" group)
              (> (count cases) 4096) (not= (count keys) (count (set keys)))
              (some #(or (empty? %) (re-find #"\x00" %)) keys))
      (throw (ex-info "Matrix requires a valid group and unique nonempty case keys" {:kind :invalid-matrix})))
    (mapv (fn [case] (h/with-id (build (:value case)) (str group "[" (:key case) "]"))) cases)))

#?(:clj (t/ann after [h/Task (t/Vec h/Task) -> h/Task]))
(defn after [task parents] (h/after task parents))
#?(:clj (t/ann parallel [(t/Vec h/Task) t/Int -> h/Plan]))
(defn parallel [tasks jobs] (h/with-jobs (h/plan tasks) jobs))
