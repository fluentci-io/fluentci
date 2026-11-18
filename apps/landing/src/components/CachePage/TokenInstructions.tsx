import { useState } from "react";
import { cacheEnvironment, cacheInstructions } from "../../cache/instructions";
import { Code } from "../Code";
import { Copy } from "../Copy";

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div className="mt-4 min-w-0 rounded-lg border border-line bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">{title}</p>
        <Copy text={code} label={`Copy ${title}`} iconOnly />
      </div>
      <Code
        className="mt-2 max-w-full text-sm leading-6"
        language={
          title.includes(".xml")
            ? "xml"
            : title.includes("gradle.kts")
              ? "kotlin"
              : title.includes("nix.conf")
                ? "ini"
                : "bash"
        }
      >
        {code}
      </Code>
    </div>
  );
}
export function TokenInstructions({
  cacheUrl,
  canonicalCacheUrl,
}: {
  cacheUrl: string;
  canonicalCacheUrl?: string;
}) {
  const [client, setClient] = useState("bazel");
  const choices = cacheInstructions(cacheUrl, canonicalCacheUrl);
  const selected = choices.find((item) => item.id === client)!;
  return (
    <div
      className="mt-6 min-w-0 border-t border-line pt-5"
      role="region"
      aria-label="Token setup instructions"
    >
      <h3 className="text-lg">Use your token</h3>
      <p className="mt-3 text-sm leading-6 text-muted">
        Set these variables in your terminal or CI environment. Replace
        PASTE_UPLOAD_TOKEN with the token above. Upload tokens remain valid
        until revoked. Keep the token in your terminal or CI secret store.
      </p>
      <Snippet
        title="Environment variables"
        code={cacheEnvironment(cacheUrl)}
      />
      <label htmlFor="cache-client" className="mt-5 block text-sm">
        Cache client
      </label>
      <select
        id="cache-client"
        className="mt-2 w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm"
        value={client}
        onChange={(event) => setClient(event.target.value)}
      >
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.title}
          </option>
        ))}
      </select>
      <p className="mt-4 text-sm leading-6 text-muted">
        {selected.description}
      </p>
      {selected.steps.map((step) => (
        <Snippet key={step.title} {...step} />
      ))}
      <p className="mt-4 text-xs leading-6 text-muted">{selected.note}</p>
      <a
        className="text-link mt-3 inline-block text-sm"
        href={selected.reference}
        target="_blank"
        rel="noreferrer"
      >
        {selected.title} reference
      </a>
      <p className="mt-3 text-xs leading-6 text-muted">
        Use the account URL shown above. Public reads need no token. Upload
        tokens cannot clear storage or manage collaborators.
      </p>
      <a
        className="text-link mt-2 inline-block text-sm"
        href="https://docs.fluentci.io/guides/build-cache/"
        target="_blank"
        rel="noreferrer"
      >
        All cache client instructions
      </a>
    </div>
  );
}
