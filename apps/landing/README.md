# FluentCI landing

A minimal React + Vite + Tailwind site with Lexend text, Inconsolata code,
keyboard-accessible SDK tabs, syntax highlighting, and a FluentCI Studio preview.
Fonts and the supplied logo and screenshot are served locally. The site has no account flow or analytics. Registry search uses the public
FluentCI XRPC API; author handles and avatars come from the public Bluesky AppView.
The static home page works independently of those services.

Run from the monorepo root:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run dev:landing
bun run build:landing
```

Development runs at `http://localhost:5173`. Deploy the generated
`apps/landing/dist/` directory to a static host.
`public/llms.txt` is served at `/llms.txt` in development and copied into the
production build. Keep its overview and documentation links in sync with the CLI
and SDKs.

To preview the build or run browser checks:

```sh
cd apps/landing
bun run preview
bun run test:browser
```

Browser checks cover 320px, 390px, and desktop layouts, all seven SDK tabs,
keyboard navigation, syntax highlighting, copy-to-clipboard, links, and assets.
Local checks use installed Google Chrome; CI uses Playwright Chromium.
ClojureScript is the first selected SDK tab. The hero uses a compact PureScript
pipeline that installs Bun dependencies, runs tests, then builds.

The SDK examples replace the generated starter with a native task plan: install
Python CI dependencies, run Ruff and pytest in parallel, then build the package.
Each sample exports `check` and accepts a fresh `--run-dir` for its logs and
report. The scaffold and pipe explanations change with the selected language. The installer command
is shown for the user to copy; the site never executes it.

## Popular registry modules

The landing reuses the search prefetch for the top 20 modules by downloads across
all versions, linking each logo to the latest release page. The looping strip uses
native horizontal scrolling, fades both edges, pauses on hover/focus, includes a
pause control, and stays manual when reduced motion is preferred. Touch interaction
also pauses automatic scrolling. Duplicate loop content is hidden from screen readers.

## CI/CD evolution

The landing timeline follows YAML-based hosted CI, Jenkins pipelines as code,
GitHub Actions, programmable delivery, and the agent era. Dated milestones link
to primary sources. FluentCI's positioning focuses on typed functions, reusable
Wasm modules, and local execution for developers and coding agents.
`PipelineEvolution` has dark/light Storybook stories and responsive browser checks.

## Registry pages

The topbar search opens with `/` and supports arrow keys, Enter, and Escape.
The first results and author profiles preload in the background. Modal opens
share any in-flight request and reuse a one-minute in-memory cache; stale results
stay visible while refreshing. Loading skeletons follow both themes and disable
animation when reduced motion is preferred.
Results navigate with TanStack Router to `/:handle/plugin/:rkey`, where the record
key is `name-version`. Official `fluentci.io` modules display their name without
the handle prefix. Commands always retain the publisher and pinned version.
Module pages show metadata, links, functions, and a README fetched only on HTTP
200 with a readable Markdown content type. Raw HTML is disabled. Daily download
charts are hidden until history exists, and total counts appear only above zero.

Configure the static host to serve `index.html` for unknown paths so deep links
and refreshes work. Existing static files such as `/llms.txt` and `/favicon.ico`
must keep their normal responses. Cloudflare Pages does this automatically when
there is no top-level `404.html`.

Components live in `src/components/<Component>/` with public `index.ts` exports
and adjacent Storybook stories. Run `bun run storybook` for isolated previews or
`bun run build:storybook` to build them. Stories mock registry, profile, and README
requests; browser tests cover module navigation, empty/error states, Markdown,
keyboard focus, downloads, and responsive layouts.

README fenced code loads the full Highlight.js language registry on demand,
including the SDK aliases. GitHub Dark and GitHub Light syntax themes follow the
site theme. Inline code and unknown language labels remain escaped plain text.
