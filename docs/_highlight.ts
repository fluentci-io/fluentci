import type { LanguageFn } from "highlight.js";

export const gleam: LanguageFn = (h) => ({
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
});
