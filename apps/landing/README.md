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
ClojureScript is the first selected SDK tab; the hero features PureScript.

The SDK examples follow this repository's generated templates. Each exports the
starter `hello` job, prints a greeting, and runs `git status --short`. The scaffold
and pipe explanations change with the selected language. The installer command
is shown for the user to copy; the site never executes it.

## Registry pages

The topbar search opens with `/` and supports arrow keys, Enter, and Escape.
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
