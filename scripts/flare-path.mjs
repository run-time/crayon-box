// Where npm put @run.time/flare-ux, for the dev server and the build.
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);

export const flareDir = dirname(require.resolve("@run.time/flare-ux/package.json"));
