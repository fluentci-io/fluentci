(ns ^:typed.clojure fluentci.plugin
  "Immutable, thread-first guest pipelines. Only functions ending in ! do I/O."
  (:refer-clojure :exclude [file run!])
  (:require [clojure.string :as str]
            [fluentci.bridge :as bridge]
            [fluentci.pdk :as pdk]
            [fluentci.host :as host]
            #?(:clj [typed.clojure :as t])))

#?(:clj
   (do
     (t/defalias Provider (t/U ':nix ':flox ':devbox ':devenv ':envhub ':hermit ':mise ':pixi ':pkgx ':proto))
     (t/defalias Step
       (t/Rec [s] (t/U (t/HMap :mandatory {:op ':exec :argv (t/Vec t/Str)})
            (t/HMap :mandatory {:op ':shell :command t/Str})
            (t/HMap :mandatory {:op ':workdir :path t/Str})
            (t/HMap :mandatory {:op ':env :key t/Str :value t/Str})
            (t/HMap :mandatory {:op ':cache :key t/Str :path t/Str})
            (t/HMap :mandatory {:op ':secret :key t/Str :name t/Str :value t/Str})
            (t/HMap :mandatory {:op ':provider :provider Provider :impure t/Bool})
            (t/HMap :mandatory {:op ':packages :packages (t/Vec t/Str)})
            (t/HMap :mandatory {:op ':trust})
            (t/HMap :mandatory {:op ':install})
            (t/HMap :mandatory {:op ':wait :port t/Int :timeout t/Int})
            (t/HMap :mandatory {:op ':service :name t/Str :source t/Str :steps (t/Vec s)}))))
     (t/defalias Pipeline
       (t/HMap :mandatory {:kind ':pipeline :name t/Str :steps (t/Vec Step)}))
     (t/defalias File (t/HMap :mandatory {:kind ':file :path t/Str}))
     (t/defalias Directory (t/HMap :mandatory {:kind ':directory :path t/Str}))
     (t/defalias Service (t/HMap :mandatory {:kind ':service :name t/Str :source t/Str :steps (t/Vec Step)}))
     (t/defalias Secret (t/HMap :mandatory {:kind ':secret :name t/Str :value t/Str}))))

#?(:clj (t/ann pipeline [t/Str -> Pipeline]))
(defn pipeline [name] {:kind :pipeline :name name :steps []})

#?(:clj (t/ann exec [Pipeline (t/Vec t/Str) -> Pipeline]))
(defn exec
  "Append a literal argv vector. Shell syntax is never interpreted."
  [pipeline argv]
  (when (or (empty? argv) (empty? (first argv)) (some #(re-find #"\x00" %) argv))
    (throw (ex-info "exec requires a program and NUL-free arguments" {:kind :invalid-argument})))
  (update pipeline :steps conj {:op :exec :argv argv}))

#?(:clj (t/ann shell [Pipeline t/Str -> Pipeline]))
(defn shell
  "Explicitly append shell syntax. Never interpolate untrusted input."
  [pipeline command]
  (update pipeline :steps conj {:op :shell :command command}))

#?(:clj (t/ann workdir [Pipeline t/Str -> Pipeline]))
(defn workdir [pipeline path]
  (update pipeline :steps conj {:op :workdir :path path}))

#?(:clj (t/ann env [Pipeline t/Str t/Str -> Pipeline]))
(defn env [pipeline key value]
  (update pipeline :steps conj {:op :env :key key :value value}))

#?(:clj (t/ann cache [Pipeline t/Str t/Str -> Pipeline]))
(defn cache [pipeline key path]
  (update pipeline :steps conj {:op :cache :key key :path path}))

#?(:clj (t/ann file [t/Str -> File]))
(defn file [path] {:kind :file :path path})

#?(:clj (t/ann secret [t/Str t/Str -> Secret]))
(defn secret [name value] {:kind :secret :name name :value value})

#?(:clj (t/ann with-secret [Pipeline t/Str Secret -> Pipeline]))
(defn with-secret [pipeline key secret]
  (update pipeline :steps conj {:op :secret :key key :name (:name secret) :value (:value secret)}))

#?(:clj (t/ann copy-file [Pipeline File t/Str -> Pipeline]))
(defn copy-file [pipeline source destination]
  (exec pipeline ["/bin/cp" "--" (:path source) destination]))

#?(:clj (t/ann using [Pipeline Provider t/Bool -> Pipeline]))
(defn using [pipeline provider impure?]
  (update pipeline :steps conj {:op :provider :provider provider :impure impure?}))
#?(:clj (t/ann with-packages [Pipeline (t/Vec t/Str) -> Pipeline]))
(defn with-packages [pipeline packages] (update pipeline :steps conj {:op :packages :packages packages}))
#?(:clj (t/ann trust [Pipeline -> Pipeline]))
(defn trust [pipeline] (update pipeline :steps conj {:op :trust}))
#?(:clj (t/ann install [Pipeline -> Pipeline]))
(defn install [pipeline] (update pipeline :steps conj {:op :install}))
#?(:clj (t/ann with-file [Pipeline File t/Str -> Pipeline]))
(defn with-file [pipeline source destination]
  (copy-file pipeline source destination))
#?(:clj (t/ann wait-on [Pipeline t/Int t/Int -> Pipeline]))
(defn wait-on [pipeline port timeout-seconds]
  (when-not (and (<= 1 port 65535) (<= 1 timeout-seconds 4294967295))
    (throw (ex-info "Invalid port or wait timeout" {:kind :invalid-argument})))
  (update pipeline :steps conj {:op :wait :port port :timeout timeout-seconds}))
#?(:clj (t/ann as-service [Pipeline t/Str -> Service]))
(defn as-service [pipeline name]
  {:kind :service :name name :source (:name pipeline) :steps (:steps pipeline)})
#?(:clj (t/ann with-service [Pipeline Service -> Pipeline]))
(defn with-service [pipeline service]
  (update pipeline :steps conj {:op :service :name (:name service) :source (:source service) :steps (:steps service)}))

#?(:clj (t/ann quote-arg [t/Str -> t/Str]))
(defn- quote-arg [value]
  (str "'" (str/replace value "'" "'\\''") "'"))

#?(:clj (t/ann emit-step! [Step -> nil]))
(defn- emit-step! [step]
  (case (:op step)
    :exec (bridge/call! "with_exec" (bridge/json (mapv quote-arg (:argv step))) false)
    :shell (bridge/call! "with_exec" (bridge/json [(:command step)]) false)
    :workdir (bridge/call! "with_workdir" (:path step) false)
    :env (bridge/call! "set_envs" (bridge/json [[(:key step) (:value step)]]) false)
    :cache (let [id (bridge/handle (bridge/call! "cache" (:key step) true))]
             (bridge/call! "with_cache" (bridge/json {:id id :key (:key step) :path (:path step)}) false))
    :secret (let [id (bridge/call! "set_secret" (bridge/json [(:name step) (:value step)]) true)]
              (bridge/call! "with_secret_variable" (bridge/json [(:key step) id]) false))
    :provider (let [provider (name (:provider step))]
                (bridge/call! "set_runner" provider false)
                (bridge/call! provider (if (= provider "nix") (bridge/json {:impure (:impure step)}) nil) true))
    :packages (bridge/call! "with_packages" (bridge/json (:packages step)) false)
    :trust (bridge/call! "trust" nil false)
    :install (bridge/call! "install" nil false)
    :wait (bridge/call! "wait_on" (bridge/json [(:port step) (:timeout step)]) false)
    :service nil)
  nil)

#?(:clj (t/ann emit! [t/Str (t/Vec Step) -> nil]))
(declare emit!)
#?(:clj (t/ann service-ids! [Step -> (t/Vec t/Str)]))
(defn- service-ids! [step]
  (if (= (:op step) :service)
    (do (emit! (:source step) (:steps step))
        [(bridge/handle (bridge/call! "as_service" (:name step) true))])
    []))
(defn- emit! [name steps]
  (let [services (vec (mapcat service-ids! steps))]
    (bridge/call! "set_runner" "default" false)
    (bridge/call! "pipeline" name true)
    (doseq [id services] (bridge/call! "with_service" id false))
    (doseq [step steps] (emit-step! step)))
  nil)

#?(:clj (t/ann run! [Pipeline t/Bool -> t/Str]))
(defn- run! [pipeline stderr?]
  (emit! (:name pipeline) (:steps pipeline))
  (bridge/call! (if stderr? "stderr" "stdout") nil true))

#?(:clj (t/ann stdout! [Pipeline -> t/Str]))
(defn stdout! [pipeline] (run! pipeline false))

#?(:clj (t/ann stderr! [Pipeline -> t/Str]))
(defn stderr! [pipeline] (run! pipeline true))

#?(:clj (t/ann sha256! [File -> t/Str]))
(defn sha256! [file]
  (bridge/call! "file" (:path file) true)
  (bridge/call! "sha256" (:path file) true))

#?(:clj (t/ann md5! [File -> t/Str]))
(defn md5! [file]
  (bridge/call! "file" (:path file) true)
  (bridge/call! "md5" (:path file) true))

#?(:clj (t/ann call-module! [t/Str t/Str t/Str -> t/Str]))
(defn call-module! [url function input]
  (bridge/call! "call" (bridge/json {:url url :function function :args input}) true))

#?(:clj (t/ann input! [-> t/Str]))
(defn input! [] (bridge/input!))

#?(:clj (t/ann output! [t/Str -> nil]))
(defn output! [value] (bridge/output! value))

#?(:clj (t/ann run-plan! [host/Plan t/Str -> host/RunResult]))
(defn run-plan! [plan directory] (host/run! plan directory))

#?(:clj (t/ann directory [t/Str -> Directory]))
(defn directory [path] {:kind :directory :path path})
#?(:clj (t/ann entries! [Directory -> (t/Vec t/Str)]))
(defn entries! [directory] (pdk/entries! (:path directory)))
#?(:clj (t/ann http! [t/Str -> File]))
(defn http! [url] (file (:path (pdk/http! url))))
#?(:clj (t/ann chmod! [File t/Str -> File]))
(defn chmod! [source mode] (file (:path (pdk/chmod! {:path (:path source) :mode mode}))))
#?(:clj (t/ann zip! [(t/U File Directory) -> File]))
(defn zip! [source] (file (:path (pdk/zip! (:path source)))))
#?(:clj (t/ann tar! [(t/U File Directory) -> File]))
(defn tar! [source] (file (:path (pdk/tar-czvf! (:path source)))))
#?(:clj (t/ann unzip! [File -> Directory]))
(defn unzip! [source] (directory (:path (pdk/unzip! (:path source)))))
#?(:clj (t/ann untar! [File -> Directory]))
(defn untar! [source] (directory (:path (pdk/tar-xzvf! (:path source)))))
#?(:clj (t/ann git-tree! [t/Str t/Str -> Directory]))
(defn git-tree! [url branch]
  (pdk/git! url)
  (pdk/branch! branch)
  (directory (:path (pdk/tree!))))
#?(:clj (t/ann git-commit! [t/Str t/Str -> t/Str]))
(defn git-commit! [url branch]
  (pdk/git! url)
  (pdk/branch! branch)
  (pdk/commit!))
#?(:clj (t/ann get-env! [t/Str -> t/Str]))
(defn get-env! [key] (pdk/get-env! key))
#?(:clj (t/ann has-env! [t/Str -> t/Bool]))
(defn has-env! [key] (pdk/has-env! key))
#?(:clj (t/ann set-envs! [(t/Vec (t/HVec [t/Str t/Str])) -> nil]))
(defn set-envs! [values] (pdk/set-envs! values))
#?(:clj (t/ann remove-env! [t/Str -> nil]))
(defn remove-env! [key] (pdk/remove-env! key))
#?(:clj (t/ann os! [-> t/Str]))
(defn os! [] (pdk/get-os!))
#?(:clj (t/ann arch! [-> t/Str]))
(defn arch! [] (pdk/get-arch!))
#?(:clj (t/ann secret-manager! [pdk/Provider -> t/Str]))
(defn secret-manager! [provider] (pdk/add-secretmanager! provider))
#?(:clj (t/ann get-secret! [t/Str t/Str -> (t/Vec pdk/Secret)]))
(defn get-secret! [manager name] (pdk/get-secret! [manager name]))
#?(:clj (t/ann secret-plaintext! [pdk/Secret -> t/Str]))
(defn secret-plaintext! [secret] (pdk/get-secret-plaintext! [(:id secret) (:name secret)]))
