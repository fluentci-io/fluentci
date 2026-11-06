// Loaded on demand for README code blocks; includes every bundled Highlight.js language.
import hljs from "highlight.js";
import "./highlight";

export function highlightMarkdown(
  code: string,
  language: string,
): string | undefined {
  if (!hljs.getLanguage(language)) return undefined;
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}
