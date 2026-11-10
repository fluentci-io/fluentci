const milestones = [
  {
    era: "2010–2015",
    symbol: "{ }",
    title: "CI moves into YAML",
    description:
      "Hosted CI makes builds repeatable from a file in the repository. Travis CI launches in 2011, with YAML at the heart of its build configuration.",
    source: { label: "Travis CI", href: "https://www.travis-ci.com/about-us/" },
  },
  {
    era: "2016",
    symbol: "</>",
    title: "Pipelines become code",
    description:
      "Jenkins 2.0 brings first-class pipelines and a Groovy DSL. Delivery logic can be versioned and reviewed alongside the application.",
    source: {
      label: "Jenkins 2.0",
      href: "https://www.jenkins.io/blog/2016/04/26/jenkins-20-is-here/",
    },
  },
  {
    era: "2019",
    symbol: "git",
    title: "Workflows meet the repo",
    description:
      "GitHub Actions reaches general availability. Events, jobs, and reusable actions bring automation into the everyday development workflow.",
    source: {
      label: "GitHub Actions",
      href: "https://github.blog/changelog/2019-11-11-github-actions-is-generally-available/",
    },
  },
  {
    era: "2020s",
    symbol: "λ",
    title: "Pipelines get programmable",
    description:
      "Build logic grows into functions, libraries, and dependency graphs. Types, tests, and familiar language tools help maintain delivery itself.",
  },
  {
    era: "Now",
    symbol: "✦",
    title: "The agent era",
    description:
      "Developers and coding agents need the same fast loop: inspect a plan, run it locally, read the result, and iterate.",
  },
];

export function PipelineEvolution() {
  return (
    <section
      className="pipeline-evolution page-width section-space"
      aria-labelledby="pipeline-evolution-title"
    >
      <div className="grid gap-6 md:grid-cols-2 md:gap-16">
        <div>
          <p className="section-label">The next chapter of CI/CD</p>
          <h2 id="pipeline-evolution-title" className="section-title mt-4">
            From YAML files
            <br />
            <span className="text-accent">to programmable delivery.</span>
          </h2>
        </div>
        <p className="max-w-xl self-end text-sm leading-7 text-muted">
          Software development keeps moving. CI/CD is moving with it—from
          configuring a build server to writing delivery logic as software. Now
          that agents write code too, that logic needs to be easy to understand,
          compose, and run.
        </p>
      </div>

      <ol className="evolution-timeline mt-12" aria-label="CI/CD evolution">
        {milestones.map((milestone, index) => (
          <li
            key={milestone.era}
            className={`evolution-milestone ${index === milestones.length - 1 ? "evolution-now" : ""}`}
          >
            <div className="evolution-marker" aria-hidden="true">
              {milestone.symbol}
            </div>
            <p className="evolution-era">{milestone.era}</p>
            <h3 className="mt-3 text-sm font-medium leading-6">
              {milestone.title}
            </h3>
            <p className="mt-3 text-xs leading-6 text-muted">
              {milestone.description}
            </p>
            {milestone.source && (
              <a
                className="text-link mt-4 inline-block text-[11px] text-muted"
                href={milestone.source.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {milestone.source.label} <span aria-hidden="true">↗</span>
              </a>
            )}
          </li>
        ))}
      </ol>

      <div className="evolution-next mt-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div>
            <p className="section-label text-accent">
              FluentCI · Built for this next chapter
            </p>
            <h3 className="mt-4 text-2xl leading-snug tracking-tight sm:text-3xl">
              Code the pipeline.
              <br />
              Keep the feedback loop close.
            </h3>
            <p className="mt-4 text-sm leading-7 text-muted">
              Write CI/CD as typed functions. Package it as reusable Wasm. Give
              developers and coding agents one workflow they can inspect and
              run, from a local terminal to a CI runner.
            </p>
            <a className="text-link mt-6 inline-block text-sm" href="#sdks">
              Build a programmable pipeline <span aria-hidden="true">→</span>
            </a>
          </div>
          <ul className="space-y-6 self-center">
            {[
              [
                "01",
                "Typed by design",
                "Function signatures and named arguments make pipeline interfaces explicit.",
              ],
              [
                "02",
                "Built to compose",
                "Publish reusable Wasm modules and call them across supported SDKs.",
              ],
              [
                "03",
                "A faster feedback loop",
                "Run locally, inspect execution plans, and reuse the same modules in CI.",
              ],
            ].map(([number, title, description]) => (
              <li key={number} className="flex gap-4">
                <span
                  className="pt-1 font-mono text-xs text-accent"
                  aria-hidden="true"
                >
                  {number}
                </span>
                <div>
                  <h4 className="text-sm font-medium">{title}</h4>
                  <p className="mt-1 text-xs leading-6 text-muted">
                    {description}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
