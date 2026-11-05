# FluentCI landing

A minimal React + Vite + Tailwind site with Lexend text, Inconsolata code,
keyboard-accessible SDK tabs, syntax highlighting, and a FluentCI Studio preview.
Fonts and the supplied logo and screenshot are served locally. The site has no
account flow, API dependency, analytics, or runtime font/CDN requests.

Run from the monorepo root:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run dev:landing
bun run build:landing
```

Development runs at `http://localhost:5173`. Deploy the generated
`apps/landing/dist/` directory to a static host.

To preview the build or run browser checks:

```sh
cd apps/landing
bun run preview
bun run test:browser
```

Browser checks cover 320px, 390px, and desktop layouts, all six SDK tabs,
keyboard navigation, syntax highlighting, copy-to-clipboard, links, and assets.
Local checks use installed Google Chrome; CI uses Playwright Chromium.

The SDK examples follow this repository's generated templates. Each exports the
starter `hello` job, prints a greeting, and runs `git status --short`. The scaffold
and pipe explanations change with the selected language. The installer command
is shown for the user to copy; the site never executes it.
