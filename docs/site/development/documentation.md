---
title: "Build these docs"
description: "A Lume 4 site using Bun workspaces, Node.js 24+, static search, and Markdown source."
section: "Contribute and deploy"
url: "/development/documentation/"
source: "development/documentation.md"
---

## Install and run

From the repository root:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run dev:docs
```

Or work directly in the docs workspace:

```sh
cd docs
bun run dev
bun run build
bun run lint
bun run typecheck
bun run test
bun run test:browser
```

Lume 4 runs on Node.js 24+ and its packages are managed by Bun. This site uses
`@lumeland/lume` and separately installed plugins for syntax highlighting,
Pagefind, table of contents, sitemap, and base-path handling. It does not need
Deno. The monorepo's `bun.lock` pins the package graph.

## Source boundaries

Only `docs/site/` is published. Repository notes outside Lume's source directory
are excluded from pages, search, sitemap, and downloadable assets. Build checks
enforce that boundary.

Pages are Markdown with `title`, `description`, `section`, `url`, and `source`
frontmatter. `_data.ts` defines navigation; `_includes/docs.vto` supplies the
layout. Add a page to both content and navigation when making it discoverable.
Keep examples aligned with current CLI parsing, SDK starters, and API schemas.

## Features and validation

The site has a responsive sidebar, local Pagefind search, an on-page contents
list, copy buttons, dark/light themes, and keyboard shortcuts. Fonts, scripts,
styles and images are served locally. Content remains readable without
JavaScript; search and interaction controls enhance it in the browser.

Build checks cover navigation targets, internal links/anchors, static search
assets, and non-public source exclusions. Browser tests cover mobile navigation,
theme persistence, syntax highlighting, code copy, and real search results.

## Deploy a static build

```sh
DOCS_URL=https://docs.example.com/ bun run build
```

Publish `docs/_site/` using a static host. `DOCS_URL` controls the canonical
location, sitemap and base path; the default is `https://docs.fluentci.io/`.
For a subdirectory deployment, use a URL such as `https://example.com/docs/` and
verify rewritten assets and Pagefind paths under that base.

The build does not publish or configure DNS. Point the landing's documentation
link at the deployed site when that host is available. Generated output and
browser artifacts remain ignored; edit source rather than `_site/`.
