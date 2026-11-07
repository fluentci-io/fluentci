(ns demo.entry (:require [demo.plugin :as plugin]
                         [fluentci.inspection :as inspection]))

;; Explicit CommonJS boundary keeps guest exports stable through compilation.
(set! (.-exports js/module)
      #js {:__fluentci_invoke inspection/invoke!
           :greet plugin/greet :echo plugin/echo :failure plugin/failure
           :hash_file plugin/hash-file :copy_file plugin/copy-file :nested plugin/nested
           :matrix plugin/matrix :workflow plugin/workflow :files plugin/files
           :service plugin/service :cancel plugin/cancel :secret_env plugin/secret-env :action_plan plugin/action-plan
           :native_service plugin/native-service})
