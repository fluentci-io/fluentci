# FluentCI landing

A minimal React + Vite + Tailwind site with Lexend text, Inconsolata code,
keyboard-accessible SDK tabs, syntax highlighting, and a FluentCI Studio preview.
Fonts and the supplied logo and screenshot are served locally. The site has no analytics. Registry search uses the public
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

The topbar links to `/modules`, a paginated catalog of latest module releases.
It defaults to downloads across versions and supports search, sorting, official
publishers, topic-based categories, OS, and CPU architecture filters. Filter state
lives in the URL; changing it resets cursor pagination. Categories match any of
their associated topics, with OR within each filter group and AND between groups.
React Query caches each search/filter/sort/cursor combination for 15 minutes,
keeps results fresh for one minute, and refreshes stale cached grids in the
background without replacing them with skeletons. The sidebar collapses on smaller screens. Theme-aware animated skeleton cards
match the grid while loading and respect reduced-motion preferences.

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

## Browser account and module likes

Sign in with an AT Protocol handle using `@atcute/oauth-browser-client`. The public
client metadata is `/oauth-client-metadata.json`, with the production callback at
`https://fluentci.io/oauth/callback`. Permissions are `atproto`,
`repo:io.fluentci.like`, and `repo:io.fluentci.plugin`; no broad repository scope.
Selfhosted.social signup starts OAuth with `prompt=create` and returns through
the same callback to the current page. Account credentials never go to the API.

OAuth uses atcute's shared browser storage and cross-tab locking/broadcasts so newly opened tabs inherit the signed-in account and token refreshes stay coordinated. A session cookie gates restoration: a fresh browser session clears old credentials, while logout clears the account and credentials across open tabs even if revocation fails. Existing tab-local sessions migrate on reload. OAuth return paths stay tab-local in sessionStorage. Credentials never go to the registry API; likes still write directly to the user's PDS.

Like/unlike writes go directly to the authenticated user's PDS using
`com.atproto.repo.createRecord` / `deleteRecord`, collection `io.fluentci.like`.
Each subject is the standard `com.atproto.repo.strongRef` containing the plugin
AT URI and CID. No record key is sent; the PDS generates its default short key.
Viewer records are fetched directly from the PDS and cached per account. Unlike
removes all of that account’s like records for the module across versions. The
indexer counts distinct actors, so multiple records never inflate the count. Public counts come from Jetstream,
with optimistic UI updates rolled back on failed writes.

## Progressive web app

The manifest supports installation on desktop and mobile. The generated service
worker precaches only the app shell and static build assets. It never handles
OAuth callbacks, authorization headers, XRPC, or cross-origin requests. Offline
navigation displays the shell; registry data and account actions need a network.
Updates wait for existing tabs to close rather than forcing a reload. Serve
`sw.js` with no-cache and the OAuth callback with no-store (see `public/_headers`).
