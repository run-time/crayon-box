// The coloring pages: every image in public/assets/coloring-pages, as the
// list the app reads from /assets/coloring-pages/index.json. The dev server
// answers that URL live (so a new image shows up at once); `npm run build`
// writes the same list to the file for static hosting.

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const coloringDir = fileURLToPath(new URL("../public/assets/coloring-pages", import.meta.url));

const IMAGE = /\.(png|jpe?g|webp|gif|svg)$/i;

/** "0002_lion.jpg" -> "Lion"; "big-red-truck.png" -> "Big Red Truck". */
function labelOf(file) {
  return file
    .replace(IMAGE, "")
    .replace(/^\d+[_-]*/, "")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export async function coloringPages() {
  const files = (await readdir(coloringDir).catch(() => [])).filter((f) => IMAGE.test(f)).sort();
  return files.map((file) => ({ file, label: labelOf(file) || file }));
}
