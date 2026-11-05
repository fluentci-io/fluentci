import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import haskell from "highlight.js/lib/languages/haskell";
import elixir from "highlight.js/lib/languages/elixir";
import bash from "highlight.js/lib/languages/bash";
import ini from "highlight.js/lib/languages/ini";
import reasonml from "highlight.js/lib/languages/reasonml";

hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("purescript", haskell);
hljs.registerLanguage("elixir", elixir);
hljs.registerLanguage("rescript", reasonml);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("toml", ini);
hljs.registerLanguage("gleam", (h) => ({
  name: "Gleam",
  keywords: {
    keyword:
      "as assert case const fn if import let opaque panic pub todo type use",
    literal: "True False Nil",
    built_in: "Ok Error Some None",
  },
  contains: [
    h.C_LINE_COMMENT_MODE,
    h.QUOTE_STRING_MODE,
    h.C_NUMBER_MODE,
    { className: "type", begin: /\b[A-Z][A-Za-z0-9_]*/ },
    { className: "operator", begin: /\|>/ },
    { className: "title.function", begin: /\b[a-z_][a-z_0-9]*(?=\()/ },
  ],
}));

export function highlight(code: string, language: string) {
  return hljs.highlight(code, { language }).value;
}
