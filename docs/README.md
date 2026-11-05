# FluentCI documentation

The comprehensive documentation site uses **Lume 4**, Node.js 24+, and Bun as its
package manager. Dependencies live in the monorepo's `bun.lock`; Deno is not
required.
The npm packages and web-component search UI follow the
[Lume 4 migration guide](https://lume.land/docs/advanced/migrate-to-lume4/).

```sh
# From the repository root:
bun install --frozen-lockfile --ignore-scripts
bun run dev:docs
bun run build:docs
```

Or work from `docs/`:

```sh
bun run dev        # http://localhost:4174
bun run build     # output: _site/
bun run lint
bun run typecheck
bun run test      # builds and checks links/source boundaries
bun run test:browser
```

Only `site/` is public source. **`rust-port.md` is not exposed by Lume**, copied
into output, indexed by Pagefind, or included in navigation/sitemaps. Keep
repository-only notes outside `site/`.

Add Markdown pages under `site/` and update navigation in `site/_data.ts`. Each
page declares its title, description, section, URL, and source path. Prefer
examples verified against the CLI, SDK templates, and API implementation.

The site includes static Pagefind search with Lume 4's web-component UI, a mobile
sidebar, table of contents, copy buttons, dark/light themes, local fonts, and a
generated `/llms.txt` index. No application server is required in production.

`DOCS_URL` configures the deployment location and base path:

```sh
DOCS_URL=https://example.com/docs/ bun run build
```

Publish `_site/` to a static host. The default canonical location is
`https://docs.fluentci.io/`; building does not deploy or configure that host.
Run the link checks against the same `DOCS_URL` when testing a subpath build.
