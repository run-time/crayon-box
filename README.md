# Crayon Box

A drawing app for kids: crayons, markers, paint, sparkle spray, fill,
eraser, smudge (smears what is drawn) and move (box part of the picture, then
move, resize or turn it), in 18 colors plus Rainbow (every brush cycles through the hues) and
any color from a color wheel, six sizes (Tiny 1px to Gianormous 64px) and six tip shapes
(round, square, triangle, star, heart, flower — a shaped tip stamps along the
stroke; non-round tips have a subtle gray edge so white shapes show on white),
on 20 papers to match the 20 colors: 15 plain ones (White, Cream, Sunshine,
Pink, Purple, Sky, Water, Grass, Silver, Ocean, Evergreen, Plum, Cherry,
Cardboard, Chalkboard), Wood (public/assets/papers/wood.png), Sunset (a sunset
down to a middle horizon, mirrored below it), Coloring Page (line art to color
in, from public/assets/coloring-pages), Picture (a photo you upload, filling
the paper; kept in the browser) and Custom (any color from a color wheel).

Coloring pages are just images in `public/assets/coloring-pages`: add one and
it shows in the chooser. The dev server lists the folder live at
`/assets/coloring-pages/index.json`; `npm run build` writes that list for
static hosting. The page's lines sit on top of the coloring (multiplied, so
white shows the coloring through), Fill stops at them, and Save keeps them. Save saves
what is on screen, on its paper. The menus
have their own light/dark toggle; the paper keeps its color either way.

Built like [Flare UX](https://flare-ux.vercel.app): native web components,
plain ES modules, no framework and no bundler. The UI loads the
version-pinned [`@run.time/flare-ux`](https://www.npmjs.com/package/@run.time/flare-ux)
package from jsDelivr (buttons, icons, the confirm dialog, toasts, and its
color/type/spacing tokens).

## Run it

```sh
npm install
npm run dev      # http://127.0.0.1:3000  (PORT=4000 npm run dev)
npm run check    # scripts parse; every fx-* element and flare-ux import exists
npm run build    # writes the coloring-page index for static hosting
```

## Deploy (Vercel)

`vercel.json` runs `npm run check && npm run build` and serves `public/`.
Flare UX is loaded from jsDelivr at version 0.1.0, so visitors need an internet
connection to load the UI library. Import it as a new Vercel project
(framework: Other) or run `vercel` here.

## How it fits together

| Path | What it is |
|---|---|
| `public/index.html` | The page; an import map points `@run.time/flare-ux/…` at jsDelivr |
| `public/app.css` | Layout and look, drawn with Flare UX tokens |
| `public/js/app.js` | The toolbox: sidebar ⇄ strip of icon menus, choices, ☰ menu, undo/redo, save, autosave |
| `public/js/painter.js` | The drawing engine (strokes, stamps, sparkle spray, smudge, flood fill) |
| `public/js/shapes.js` | Tip shapes, shared by the stamps and their buttons |
| `public/js/icons.js` | Brush and shape icons, registered as Flare UX icon sets (`crayon:*`, `shape:*`) |
| `public/js/history.js` | Undo/redo as PNG snapshots |
| `scripts/serve.mjs` | Node dev server for the app and live coloring-page list |
| `scripts/build.mjs` | Writes the coloring-page index for static hosting |
| `scripts/coloring-pages.mjs` | Lists the coloring pages (dev server and build) |
| `public/assets/` | Paper images (`papers/`) and coloring pages (`coloring-pages/`) |

The toolbox has two layouts, remembered per browser: a **sidebar** with every
choice laid out, or a narrow **strip** down the left of round icon menus
(brush, color, size, shape) that open popovers beside them, like the pickers in
Star Jars — nearly the whole screen is paper, and the tools are still one tap
away. Narrow screens start in the strip. Clicking the logo in Detail View
enters Compact View; clicking the crayons in Compact View opens Settings,
where Detail View returns to the sidebar.

The ☰ menu (hamburger in Detail View, crayons in Compact View) starts with
Clear All, New Picture and Save Picture, followed by Detail View / Compact
View and Light Mode / Dark Mode (menus only, at the bottom). Undo and Redo sit
below the logo; Share Picture follows the tool groups and opens the device's
share sheet with the drawing as a PNG (choose Messages to text it). Start Over
at the bottom clears the picture and resets its tools after confirmation.
Clear All wipes the paper (Undo brings it back). History keeps 150 steps.

The picture autosaves to localStorage, so a refresh doesn't lose it.
Paint, Spray and Smudge have three strengths: picking one starts at Light, and
tapping it again goes Medium, Hard, then back to Light; dots in the tile's
corner show which. For Paint that is how solid it is (Hard more solid, Light
more see-through); for Spray, how much it sprays (Hard the most); for Smudge,
how far it drags the paint (about 40, 240 and 450px at Large).

Eraser starts at Gianormous and Round, then restores the previous size and
shape when you switch to another brush.

Keyboard: ⌘/Ctrl+Z undo, ⇧⌘Z or Ctrl+Y redo, `[` and `]` change size.

On touch screens, pinch to zoom and reposition the paper. **Show All** returns
to the full view; zoom does not change the drawing or its saved scale.
