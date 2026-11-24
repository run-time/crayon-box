// Copies Flare UX from node_modules into public/vendor/flare-ux, so a static
// host (Vercel) serves it beside the app. The import map in index.html points
// "@run.time/flare-ux/…" there. Run by `npm run build`; the dev server reads
// node_modules directly and does not need it.

import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { flareDir } from "./flare-path.mjs";
import { coloringDir, coloringPages } from "./coloring-pages.mjs";

const out = fileURLToPath(new URL("../public/vendor/flare-ux", import.meta.url));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(flareDir, "src"), join(out, "src"), { recursive: true });
await cp(join(flareDir, "package.json"), join(out, "package.json"));

const { version } = JSON.parse(await readFile(join(flareDir, "package.json"), "utf8"));
console.log(`Copied @run.time/flare-ux ${version} to public/vendor/flare-ux`);

// The coloring pages' list, for hosts with no dev server to answer it.
const pages = await coloringPages();
await writeFile(join(coloringDir, "index.json"), JSON.stringify(pages, null, 2) + "\n");
console.log(`Listed ${pages.length} coloring pages in public/assets/coloring-pages/index.json`);
