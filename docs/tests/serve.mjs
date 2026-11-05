// Serve the built site for browser tests without development live reloads.
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, join, resolve, sep } from "node:path";

const root = fileURLToPath(new URL("../_site/", import.meta.url));
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".xml": "application/xml",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    let path = resolve(root, "." + pathname);
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep))
      throw Error("Invalid path");
    if ((await stat(path)).isDirectory()) path = join(path, "index.html");
    if (!(await stat(path)).isFile()) throw Error("Not a file");
    response.setHeader(
      "Content-Type",
      types[extname(path)] ?? "application/octet-stream",
    );
    createReadStream(path).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(4174, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => server.close());
