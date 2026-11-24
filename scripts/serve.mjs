// The app, served from public/ with nothing to build first:
//   npm run dev            -> http://127.0.0.1:3000
//   PORT=4000 npm run dev
// /vendor/flare-ux/* is read straight from node_modules/@run.time/flare-ux,
// so the page loads the same files here as it does on Vercel, where
// `npm run build` copies them into public/vendor/.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { flareDir } from "./flare-path.mjs";
import { coloringPages } from "./coloring-pages.mjs";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/** `path` under `root`, or null when it would climb out of it. */
function inside(root, path) {
  const full = normalize(join(root, path));
  return full === root || full.startsWith(root + sep) ? full : null;
}

createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, "http://localhost");
    const path = decodeURIComponent(pathname);
    if (path === "/assets/coloring-pages/index.json") {
      res.writeHead(200, { "Content-Type": TYPES[".json"], "Cache-Control": "no-cache" });
      res.end(JSON.stringify(await coloringPages()));
      return;
    }
    let file = path.startsWith("/vendor/flare-ux/")
      ? inside(flareDir, path.slice("/vendor/flare-ux/".length))
      : inside(publicDir, path);
    if (!file) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(file).catch(() => null);
    if (info?.isDirectory()) file = join(file, "index.html");
    else if (!info && !extname(file)) file += ".html"; // clean URLs, as on Vercel
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
  }
}).listen(port, host, () => {
  console.log(`Crayon Box: http://${host}:${port}/`);
});
