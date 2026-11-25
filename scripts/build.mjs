// Writes generated asset indexes needed by static hosting. Flare UX is loaded
// from its version-pinned CDN URL in index.html.

import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { coloringDir, coloringPages } from "./coloring-pages.mjs";

// The coloring pages' list, for hosts with no dev server to answer it.
const pages = await coloringPages();
await writeFile(join(coloringDir, "index.json"), JSON.stringify(pages, null, 2) + "\n");
console.log(`Listed ${pages.length} coloring pages in public/assets/coloring-pages/index.json`);
