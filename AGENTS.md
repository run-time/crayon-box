# Crayon Box -- for AI agents

Start with README.md. `npm run dev` serves the app; `npm run check` must pass.

- No framework, no bundler, no runtime dependencies besides
  `@run.time/flare-ux`. Plain ES modules under `public/`.
- UI uses Flare UX (read `node_modules/@run.time/flare-ux/AGENTS.md`): use
  `fx-*` components for buttons, dialogs, toasts; colors, spacing, type and
  radii come from `--fx-*` tokens. Exceptions, on purpose: the crayon colors
  (they are paint, not UI), the white paper, and the brush/shape pickers,
  which are custom swatch grids that no fx component covers.
- Import flare-ux by package name (`@run.time/flare-ux/components/…`,
  `@run.time/flare-ux/icons/…`); the import map in `index.html` resolves it.
  Never import from `node_modules/` or `/vendor/` paths directly.
- New icons go in `public/js/icons.js` (24px grid, 2px round strokes; the
  part that takes the chosen color uses `var(--ink)`).
- New brushes: add to `BRUSHES` in `painter.js` and handle them in
  `#begin` / `#extend` / `#finish`; add an icon named after the brush id.
- Test a change in a browser, at desktop and phone widths, in both layouts.
