(ns main.entry (:require [main.plugin :as plugin]
                         [fluentci.inspection :as inspection]))
(set! (.-exports js/module) #js {:hello plugin/hello
                               :__fluentci_component_invoke inspection/component-invoke})
