import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import test from "node:test";
import data from "../site/_data.ts";

const output = fileURLToPath(new URL("../_site/", import.meta.url));
const base = new URL(process.env.DOCS_URL ?? "https://docs.fluentci.io/");
const navigation = data.navigation.flatMap((group) => group.items);
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(join(directory, entry.name))
          : [join(directory, entry.name)],
      ),
    )
  ).flat();
}
const htmlFiles = (await files(output)).filter((path) =>
  path.endsWith(".html"),
);
const pages = new Map(
  await Promise.all(
    htmlFiles.map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

test("all documented navigation entries have rendered pages and consistent active navigation", async () => {
  assert.ok(navigation.length >= 36);
  assert.equal(
    new Set(navigation.map((page) => page.url)).size,
    navigation.length,
  );
  assert.equal(htmlFiles.length, navigation.length);
  for (const page of navigation) {
    const html = pages.get(join(output, page.url, "index.html"));
    assert.ok(html, `Missing page: ${page.url}`);
    assert.ok(
      html.includes(page.title.replaceAll("&", "&amp;")),
      `Missing title ${page.title}`,
    );
    assert.equal(
      (html.match(/aria-current="page"/g) ?? []).length,
      1,
      page.url,
    );
    assert.match(html, /data-pagefind-body/);
    assert.doesNotMatch(html, /\{\{|undefined|\[object Object\]/);
  }
});

test("internal links, local assets, and heading anchors resolve", async () => {
  const problems = [];
  for (const [path, html] of pages) {
    const current = new URL(relative(output, path), base);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = new URL(match[1].replaceAll("&amp;", "&"), current);
      if (target.origin !== base.origin) continue;
      if (!target.pathname.startsWith(base.pathname)) {
        problems.push(
          `${current.pathname}: escaped deployment path ${target.pathname}`,
        );
        continue;
      }
      let file = join(
        output,
        decodeURIComponent(target.pathname.slice(base.pathname.length)),
      );
      if (target.pathname.endsWith("/")) file = join(file, "index.html");
      try {
        assert.ok((await stat(file)).isFile());
      } catch {
        problems.push(`${current.pathname}: missing ${target.pathname}`);
        continue;
      }
      if (target.hash && file.endsWith(".html")) {
        const content = pages.get(file) ?? (await readFile(file, "utf8"));
        if (
          !content.includes(`id="${decodeURIComponent(target.hash.slice(1))}"`)
        ) {
          problems.push(
            `${current.pathname}: missing anchor ${target.pathname}${target.hash}`,
          );
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("private repository notes and build configuration are not published or listed", async () => {
  const published = (await files(output)).map((path) => relative(output, path));
  assert.ok(
    !published.some((path) =>
      /rust-port|_config|package\.json|deno\./.test(path),
    ),
  );
  const sitemap = await readFile(join(output, "sitemap.xml"), "utf8");
  const llms = await readFile(join(output, "llms.txt"), "utf8");
  assert.doesNotMatch(sitemap + llms, /rust-port/);
  assert.match(llms, /^# FluentCI documentation/m);
  for (const page of navigation) assert.ok(llms.includes(page.title));
});

test("all SDK guides are syntax highlighted and search assets are local", async () => {
  for (const sdk of [
    "rust",
    "clojurescript",
    "purescript",
    "typescript",
    "python",
    "gleam",
    "elixir",
    "rescript",
  ]) {
    const html = pages.get(join(output, "sdks", sdk, "index.html"));
    assert.ok(html.includes(`language-${sdk}`), sdk);
    assert.ok(html.includes('class="hljs-'), `Unhighlighted ${sdk}`);
  }
  for (const asset of [
    "assets/pagefind.js",
    "assets/pagefind.css",
    "pagefind/pagefind.js",
    "pagefind/pagefind-entry.json",
    "assets/lexend.woff2",
    "assets/inconsolata.woff2",
  ]) {
    assert.ok((await stat(join(output, asset))).size > 0, asset);
  }
  assert.ok(
    [...pages.values()].every(
      (html) =>
        html.includes("pagefind-input") && !/https:\/\/fonts\./.test(html),
    ),
  );
});
