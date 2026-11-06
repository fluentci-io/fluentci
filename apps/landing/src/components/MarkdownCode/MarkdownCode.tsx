import { useEffect, useState } from "react";

export function MarkdownCode({
  code,
  language,
}: {
  code: string;
  language?: string;
}) {
  const [html, setHtml] = useState<string>();
  useEffect(() => {
    let active = true;
    setHtml(undefined);
    if (language)
      void import("../../markdown-highlight")
        .then(({ highlightMarkdown }) => {
          const value = highlightMarkdown(code, language.toLowerCase());
          if (active) setHtml(value);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [code, language]);
  const className = `hljs${language ? ` language-${language}` : ""}`;
  return (
    <pre tabIndex={0}>
      {html === undefined ? (
        <code className={className}>{code}</code>
      ) : (
        <code
          className={className}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </pre>
  );
}
