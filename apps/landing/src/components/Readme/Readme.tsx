import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { httpUrl, readmeUrl, type Plugin } from "../../registry/client";

export function Readme({ plugin }: { plugin: Plugin }) {
  const source = readmeUrl(plugin);
  const [markdown, setMarkdown] = useState("");
  useEffect(() => {
    setMarkdown("");
    if (!source) return;
    const abort = new AbortController();
    void (async () => {
      try {
        const response = await fetch(source, { signal: abort.signal });
        const mime =
          response.headers.get("content-type")?.split(";")[0].trim() ?? "";
        if (
          response.status !== 200 ||
          ![
            "text/plain",
            "text/markdown",
            "text/x-markdown",
            "application/octet-stream",
          ].includes(mime)
        )
          return;
        // Bound untrusted README downloads rather than rendering an unlimited document.
        const reader = response.body?.getReader();
        if (!reader) return;
        const chunks: string[] = [];
        const decoder = new TextDecoder();
        let length = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 1_048_576) {
            await reader.cancel();
            return;
          }
          chunks.push(decoder.decode(value, { stream: true }));
        }
        if (!abort.signal.aborted)
          setMarkdown(chunks.join("") + decoder.decode());
      } catch {
        /* An unavailable README does not hide module metadata. */
      }
    })();
    return () => abort.abort();
  }, [source]);
  if (!markdown || !source) return null;
  return (
    <section
      className="mt-10 rounded-xl border border-line bg-panel p-5 sm:p-7"
      aria-label="Module README"
    >
      <h2 className="mb-6 text-xs uppercase tracking-widest text-muted">
        README
      </h2>
      <div className="module-markdown">
        <Markdown
          skipHtml
          remarkPlugins={[remarkGfm]}
          urlTransform={(value) => {
            if (!value) return value;
            if (value.startsWith("#")) return value;
            try {
              return httpUrl(new URL(value, source).href) ?? "";
            } catch {
              return "";
            }
          }}
          components={{
            a: ({ children, href }) => (
              <a href={href} rel="noopener noreferrer">
                {children}
              </a>
            ),
            img: ({ src, alt }) => (
              <img
                src={src}
                alt={alt ?? ""}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ),
          }}
        >
          {markdown}
        </Markdown>
      </div>
    </section>
  );
}
