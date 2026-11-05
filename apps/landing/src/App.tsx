import { useEffect, useRef, useState } from "react";
import { examples } from "./examples";
import { highlight } from "./highlight";

const github = "https://github.com/fluentci-io/fluentci";
const docs = `${github}#readme`;
const discord = "https://discord.gg/H7M28d9dRk";
const install = "curl -fsSL https://cli.fluentci.io | sh";
const heroExample = examples[0];

function BrandIcon({ brand }: { brand: "github" | "discord" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[18px] shrink-0 fill-current"
    >
      <path
        d={
          brand === "github"
            ? "M12 .75a11.25 11.25 0 0 0-3.558 21.923c.563.104.768-.244.768-.542 0-.267-.01-.974-.015-1.912-3.13.68-3.79-1.509-3.79-1.509-.512-1.3-1.25-1.646-1.25-1.646-1.022-.699.077-.685.077-.685 1.13.08 1.725 1.16 1.725 1.16 1.004 1.721 2.633 1.224 3.274.936.102-.728.393-1.224.715-1.505-2.498-.284-5.124-1.25-5.124-5.565 0-1.23.44-2.235 1.16-3.022-.116-.285-.503-1.43.11-2.98 0 0 .945-.303 3.094 1.154a10.79 10.79 0 0 1 5.624 0c2.147-1.457 3.09-1.155 3.09-1.155.615 1.55.228 2.696.112 2.98.722.788 1.158 1.794 1.158 3.023 0 4.326-2.63 5.278-5.136 5.556.404.35.763 1.042.763 2.1 0 1.517-.014 2.741-.014 3.114 0 .301.203.652.774.541A11.252 11.252 0 0 0 12 .75Z"
            : "M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515c-.21.375-.445.88-.61 1.28a18.3 18.3 0 0 0-5.416 0c-.165-.4-.407-.905-.618-1.28A19.7 19.7 0 0 0 3.9 4.373C.81 8.94-.028 13.394.391 17.785a19.9 19.9 0 0 0 5.993 3.03c.485-.661.918-1.364 1.29-2.1a12.8 12.8 0 0 1-2.032-.988c.17-.126.337-.257.498-.392 3.917 1.81 8.173 1.81 12.043 0 .163.135.33.266.5.392a13 13 0 0 1-2.036.99c.372.735.803 1.438 1.289 2.098a19.8 19.8 0 0 0 6.002-3.03c.49-5.09-.838-9.503-3.622-13.415ZM8.02 15.1c-1.183 0-2.157-1.085-2.157-2.419s.954-2.42 2.157-2.42 2.177 1.096 2.157 2.42c0 1.334-.955 2.419-2.157 2.419Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.42 2.157-2.42 2.177 1.096 2.157 2.42c0 1.334-.946 2.419-2.157 2.419Z"
        }
      />
    </svg>
  );
}

function ThemeSwitcher() {
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#09090d" : "#ffffff");
    try {
      localStorage.setItem("fluentci-landing-theme", theme);
    } catch {
      // Switching remains available when browser storage is disabled.
    }
  }, [theme]);

  return (
    <button
      type="button"
      className="theme-switch"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}

function Code({
  children,
  language = "bash",
  className = "",
}: {
  children: string;
  language?: string;
  className?: string;
}) {
  return (
    <pre className={`code overflow-x-auto ${className}`} tabIndex={0}>
      <code
        dangerouslySetInnerHTML={{ __html: highlight(children, language) }}
      />
    </pre>
  );
}

function Copy({
  text,
  label = "Copy command",
}: {
  text: string;
  label?: string;
}) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  return (
    <div className="flex shrink-0 items-center gap-3">
      <span role="status" className="max-w-40 text-xs text-muted">
        {status}
      </span>
      <button
        className="copy-button"
        onClick={async () => {
          clearTimeout(timer.current);
          try {
            await navigator.clipboard.writeText(text);
            setStatus("Copied");
          } catch {
            setStatus("Select the command to copy.");
          }
          timer.current = setTimeout(() => setStatus(""), 3000);
        }}
      >
        {label}
      </button>
    </div>
  );
}

function SdkExamples() {
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
              Replace the generated hello example with this sample.
            </p>
            <p className="mt-7 text-sm font-medium">02. Run the exported job</p>
            <Code className="mt-3 text-sm">fluentci run ci hello</Code>
            <p className="mt-3 text-xs leading-6 text-muted">
              FluentCI builds the module into Wasm, then runs the job. Install
              your SDK’s compiler tools first.
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

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="page-width flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-line py-6">
        <a
          href="#"
          aria-label="FluentCI home"
          className="flex items-center gap-2.5"
        >
          <img src="/fluentci-logo.png" alt="" width="36" height="36" />
          <span className="text-lg font-medium tracking-tight">fluentci</span>
        </a>
        <nav
          aria-label="Main navigation"
          className="flex flex-wrap items-center gap-5 text-xs sm:gap-7 sm:text-sm"
        >
          <a className="nav-link" href="#sdks">
            SDKs
          </a>
          <a className="nav-link" href={docs}>
            Docs
          </a>
          <a className="nav-link flex items-center gap-2" href={github}>
            <BrandIcon brand="github" />
            <span>GitHub</span>
          </a>
          <a className="nav-link flex items-center gap-2" href={discord}>
            <BrandIcon brand="discord" />
            <span>Discord</span>
          </a>
          <ThemeSwitcher />
        </nav>
      </header>
      <main id="main">
        <section className="page-width pb-16 pt-16 sm:pb-24 sm:pt-24 lg:pt-28">
          <p className="section-label">
            Open source. Local first. Developer owned.
          </p>
          <div className="mt-6 grid gap-12 lg:grid-cols-[1.18fr_1fr] lg:gap-16">
            <div className="min-w-0 pt-2">
              <h1 className="max-w-2xl text-[clamp(1.875rem,5.6vw,4rem)] font-normal leading-[1.08] tracking-[-0.045em]">
                Strongly typed.
                <br />
                <span className="text-accent">Functional CI/CD.</span>
              </h1>
              <p className="mt-7 max-w-[440px] text-[15px] leading-8 text-muted">
                Build, test, and deploy with a programmable CI/CD tool that
                starts on your machine and goes with you to CI.
              </p>
              <div
                role="region"
                aria-label="Quick install"
                className="mt-7 rounded-lg border border-accent/30 bg-panel p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-muted">Install with curl</span>
                  <Copy text={install} label="Copy install command" />
                </div>
                <Code className="whitespace-pre-wrap break-all text-[15px] leading-7">
                  {install}
                </Code>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-6">
                <a className="button-primary" href="#install">
                  Install FluentCI
                </a>
                <a className="text-link text-sm" href="#sdks">
                  Write your first pipeline
                </a>
              </div>
              <p className="mt-7 text-xs leading-6 text-muted">
                One CLI. Reusable Wasm plugins. No account required.
              </p>
            </div>
            <div role="region" aria-label="PureScript pipeline example" className="min-w-0 self-start overflow-hidden rounded-xl border border-line bg-panel lg:mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5 font-mono text-sm">
                <span>{heroExample.file}</span>
                <span className="text-muted">{heroExample.name}</span>
              </div>
              <Code
                language={heroExample.language}
                className="p-5 text-[15px] leading-[1.7] sm:p-6"
              >
                {heroExample.code}
              </Code>
              <div className="border-t border-line bg-paper px-5 py-4 font-mono text-[15px] text-ink">
                <span className="text-muted">$ </span>fluentci run ci hello
              </div>
            </div>
          </div>
        </section>
        <section
          className="page-width border-y border-line py-8"
          aria-label="How FluentCI works"
        >
          <div className="grid gap-8 sm:grid-cols-3 sm:gap-10">
            {[
              [
                "01",
                "Write it like code",
                "Start with TOML, or use a language SDK for reusable pipeline logic.",
              ],
              [
                "02",
                "Run it where you work",
                "Execute commands with your local tools. Inspect output before pushing to CI.",
              ],
              [
                "03",
                "Keep the same workflow",
                "Reuse plugins on runners. Export CI configuration from your saved actions.",
              ],
            ].map(([number, title, text]) => (
              <div key={number}>
                <span className="font-mono text-xs text-soft">{number} /</span>
                <h2 className="mt-3 text-sm font-medium">{title}</h2>
                <p className="mt-2 text-xs leading-6 text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>
        <section id="sdks" className="page-width section-space scroll-mt-8">
          <div className="grid gap-6 md:grid-cols-2 md:gap-16">
            <div>
              <p className="section-label">A small file. A reusable plugin.</p>
              <h2 className="section-title mt-4">
                Your favorite language.
                <br />
                One Wasm runtime.
              </h2>
            </div>
            <div className="space-y-4 text-sm leading-7 text-muted">
              <p>
                A Wasm plugin is a compiled WebAssembly module that exports
                jobs. Write pipeline logic in an SDK, compile it into a{" "}
                <code>.wasm</code> file, and let the FluentCI engine execute it.
              </p>
              <p>
                Wasm carries the pipeline logic. Commands run on the host, using
                its tools and files. These examples print a greeting, then check
                the current Git workspace.
              </p>
            </div>
          </div>
          <SdkExamples />
          <p className="mt-5 text-xs leading-6 text-muted">
            Also speaks Rust. Elixir’s pipeline DSL generates a Wasm plugin; it
            does not run a BEAM VM inside Wasm.
          </p>
        </section>
        <section
          id="studio"
          className="page-width section-space border-t border-line"
        >
          <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="section-label">
                Same engine. A little more perspective.
              </p>
              <h2 className="section-title mt-4">Meet FluentCI Studio.</h2>
            </div>
            <p className="max-w-[390px] text-sm leading-7 text-muted">
              Your projects, execution history, live logs, and pipeline spans in
              one local workspace. Open it in a browser or the desktop app.
            </p>
          </div>
          <figure className="studio-preview-frame">
            <img
              src="/studio-desktop.png"
              alt="FluentCI Studio desktop showing project history, a successful pipeline, job timings, and live execution logs."
              width="2784"
              height="1864"
              loading="lazy"
              className="studio-preview-image"
            />
          </figure>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
            <code className="text-sm">
              <span className="text-muted">$ </span>fluentci studio
            </code>
            <a
              className="text-link text-xs"
              href="https://github.com/tsirysndr/fluentci/releases/latest"
            >
              Download the desktop app
            </a>
          </div>
        </section>
        <section
          id="install"
          className="page-width section-space scroll-mt-8 border-t border-line"
        >
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
            <div>
              <p className="section-label">Start here</p>
              <h2 className="section-title mt-4">
                Less setup.
                <br />
                More shipping.
              </h2>
              <p className="mt-5 text-sm leading-7 text-muted">
                Install the latest CLI release for your platform. Add it to your
                PATH, then run your first pipeline.
              </p>
            </div>
            <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 text-xs">
                <span>Install with curl</span>
                <Copy text={install} />
              </div>
              <div className="space-y-5 p-5 sm:p-6">
                <Code className="text-[15px] leading-7">{install}</Code>
                <div className="border-t border-line pt-5">
                  <p className="mb-2 text-xs text-muted">
                    Add the CLI to this shell’s PATH, then verify:
                  </p>
                  <Code className="text-[15px] leading-7">
                    {'export PATH="$HOME/.local/bin:$PATH"\nfluentci --version'}
                  </Code>
                </div>
                <p className="text-xs leading-6 text-muted">
                  The pipe sends the installer script to <code>sh</code>.{" "}
                  <a
                    className="text-link"
                    href="https://github.com/tsirysndr/fluentci/blob/main/install.sh"
                  >
                    Read the installer
                  </a>{" "}
                  or{" "}
                  <a className="text-link" href={`${github}#quick-start`}>
                    explore the quick start
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="page-width flex flex-col justify-between gap-6 border-t border-line py-8 text-xs text-muted sm:flex-row sm:items-center">
        <div>
          <p className="font-medium text-ink">Built for the way you build.</p>
          <p className="mt-2">
            Made with <span className="text-red-400">♥</span> in Antananarivo,
            Madagascar
          </p>
        </div>
        <div className="flex flex-wrap gap-6">
          <a className="nav-link flex items-center gap-2" href={github}>
            <BrandIcon brand="github" />
            GitHub
          </a>
          <a className="nav-link flex items-center gap-2" href={discord}>
            <BrandIcon brand="discord" />
            Discord
          </a>
          <a className="nav-link" href={`${github}/blob/main/LICENSE`}>
            Open source
          </a>
        </div>
      </footer>
    </>
  );
}
