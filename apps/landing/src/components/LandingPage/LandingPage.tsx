import { examples } from "../../examples";
import { github, discord, bluesky, install } from "../../constants";
import { Code } from "../Code";
import { Copy } from "../Copy";
import { BrandIcon } from "../BrandIcon";
import { SdkExamples } from "../SdkExamples";
import { SiteHeader } from "../SiteHeader";
const heroExample =
  examples.find((example) => example.sdk === "purescript") ?? examples[0];

export function LandingPage() {
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <SiteHeader />
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
            <div
              role="region"
              aria-label="PureScript pipeline example"
              className="min-w-0 self-start overflow-hidden rounded-xl border border-line bg-panel lg:mt-4"
            >
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
            <a className="text-link text-xs" href={`${github}/releases/latest`}>
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
                    href={`${github}/blob/main/install.sh`}
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
          <a className="nav-link flex items-center gap-2" href={bluesky}>
            <BrandIcon brand="bluesky" />
            Bluesky
          </a>
          <a className="nav-link" href={`${github}/blob/main/LICENSE`}>
            Open source
          </a>
        </div>
      </footer>
    </>
  );
}
