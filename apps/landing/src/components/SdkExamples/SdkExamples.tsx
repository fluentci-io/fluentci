import { useRef, useState } from "react";
import { examples, runExample } from "../../examples";
import { github } from "../../constants";
import { Copy } from "../Copy";
import { Code } from "../Code";

export function SdkExamples() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const sample = examples[selected];
  return (
    <div className="mt-10 overflow-hidden rounded-xl border border-line bg-panel">
      <div
        role="tablist"
        aria-label="Pipeline SDK language"
        className="flex overflow-x-auto border-b border-line px-3 sm:px-5"
      >
        {examples.map((example, index) => (
          <button
            key={example.sdk}
            ref={(el) => {
              tabs.current[index] = el;
            }}
            role="tab"
            id={`tab-${example.sdk}`}
            aria-controls={`panel-${example.sdk}`}
            aria-selected={selected === index}
            tabIndex={selected === index ? 0 : -1}
            className={`sdk-tab ${selected === index ? "selected" : ""}`}
            onClick={() => setSelected(index)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight")
                next = (index + 1) % examples.length;
              else if (event.key === "ArrowLeft")
                next = (index + examples.length - 1) % examples.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = examples.length - 1;
              else return;
              event.preventDefault();
              setSelected(next);
              tabs.current[next]?.focus();
            }}
          >
            {example.name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${sample.sdk}`}
        aria-labelledby={`tab-${sample.sdk}`}
        tabIndex={0}
      >
        <div className="grid min-w-0 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4 text-xs text-muted">
              <span className="font-mono text-sm">{sample.file}</span>
              <Copy text={sample.code} label="Copy code" />
            </div>
            <Code language={sample.language} className="sdk-code p-6 sm:p-8">
              {sample.code}
            </Code>
          </div>
          <div className="border-t border-line bg-paper p-6 lg:border-l lg:border-t-0">
            <p className="section-label">Follow the pipeline</p>
            <p className="mt-4 text-sm leading-7 text-muted">{sample.pipe}</p>
            <div className="my-6 h-px bg-line" />
            <p className="text-sm font-medium">01. Scaffold a module</p>
            <Code className="mt-3 text-sm">{`fluentci modules add ci \\\n  --sdk ${sample.sdk}`}</Code>
            <p className="mt-3 text-xs leading-6 text-muted">
              Replace the generated source with this sample.
            </p>
            <p className="mt-7 text-sm font-medium">02. Run the exported job</p>
            <Code className="mt-3 text-sm">{runExample}</Code>
            <p className="mt-3 text-xs leading-6 text-muted">
              Run from a Python package with pyproject.toml and
              requirements-ci.txt containing Ruff, pytest, build, and the build
              backend. The examples use /usr/bin/python3 with pip; adjust that
              path if needed.
            </p>
            <a
              className="text-link mt-5 inline-block text-xs"
              href={`${github}#sdk-build-commands`}
            >
              SDK setup instructions
            </a>
          </div>
        </div>
        <div className="border-t border-line bg-paper px-6 py-4 font-mono text-sm text-muted">
          source code <span className="mx-3 text-ink">→</span> plugin.wasm{" "}
          <span className="mx-3 text-ink">→</span> fluentci run
        </div>
      </div>
    </div>
  );
}
