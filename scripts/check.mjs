// `npm run check`: every script parses, Flare UX is installed for validation, and every
// fx-* element and flare-ux module the app names exists in the installed
// package. Run before a deploy (Vercel runs it before the build).

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const flareDir = dirname(require.resolve("@run.time/flare-ux/package.json"));
const flareVersion = JSON.parse(await readFile(join(flareDir, "package.json"), "utf8")).version;
const problems = [];

async function files(dir, ext) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === "vendor" || entry.name === "node_modules") continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path, ext)));
    else if (entry.name.endsWith(ext)) out.push(path);
  }
  return out;
}

const scripts = [...(await files(join(root, "public"), ".js")), ...(await files(join(root, "scripts"), ".mjs"))];
for (const file of scripts) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (error) {
    problems.push(`${file}: ${error.stderr}`);
  }
}

// Only the app's own files name components and modules.
const appFiles = [...(await files(join(root, "public"), ".js")), ...(await files(join(root, "public"), ".html"))];
const sources = await Promise.all(appFiles.map((f) => readFile(f, "utf8")));
const text = sources.join("\n");

if (!text.includes(`@run.time/flare-ux@${flareVersion}/`)) {
  problems.push(`CDN URL must be pinned to installed Flare UX ${flareVersion}`);
}

for (const tag of new Set(text.match(/<fx-[a-z-]+/g) ?? [])) {
  const name = tag.slice(1);
  if (!existsSync(join(flareDir, "src/components", `${name}.js`))) problems.push(`<${name}> is not a Flare UX component`);
}
for (const [, sub] of text.matchAll(/["']@run\.time\/flare-ux\/([^"']+)["']/g)) {
  if (sub.endsWith("/")) continue; // the import map's prefix entry
  if (!existsSync(join(flareDir, "src", sub))) problems.push(`@run.time/flare-ux/${sub} does not exist`);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`check: ${scripts.length} scripts parse; Flare UX references resolve.`);
