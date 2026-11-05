import lume from "@lumeland/lume";
import codeHighlight from "@lumeland/plugin-code-highlight";
import pagefind from "@lumeland/plugin-pagefind";
import toc from "@lumeland/plugin-toc";
import basePath from "@lumeland/plugin-base-path";
import sitemap from "@lumeland/plugin-sitemap";
import clojure from "highlight.js/lib/languages/clojure";
import haskell from "highlight.js/lib/languages/haskell";
import reasonml from "highlight.js/lib/languages/reasonml";
import data from "./site/_data.ts";
import { gleam } from "./_highlight.ts";

const site = lume({
  src: "./site",
  dest: "./_site",
  location: new URL(process.env.DOCS_URL ?? "https://docs.fluentci.io/"),
});

site.use(
  codeHighlight({
    languages: {
      clojurescript: clojure,
      purescript: haskell,
      rescript: reasonml,
      gleam,
    },
  }),
);
site.use(toc({ anchor: false }));
site.use(
  pagefind({
    componentUI: {
      cssFile: "/assets/pagefind.css",
      jsFile: "/assets/pagefind.js",
    },
    indexing: { rootSelector: "[data-pagefind-body]" },
  }),
);
site.use(sitemap());
site.use(basePath());
site.add("assets");

const pages = data.navigation.flatMap((group) => group.items);
site.preprocess([".md"], (documents) => {
  for (const document of documents) {
    const index = pages.findIndex((page) => page.url === document.data.url);
    document.data.previous = index > 0 ? pages[index - 1] : undefined;
    document.data.next = index >= 0 ? pages[index + 1] : undefined;
  }
});

export default site;
