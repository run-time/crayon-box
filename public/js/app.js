// Crayon Box: the toolbox, wired to the painter.
//
// The toolbox is one set of groups (Brush, Color, Size, Shape) drawn two
// ways. As a sidebar every group's choices are laid out in full; folded into
// a narrow strip down the left (the "rail"), each group is a round icon
// button showing what is picked, and its choices open in a popover beside
// it -- so the paper gets nearly the whole screen.

import "@run.time/flare-ux/components/fx-button.js";
import "@run.time/flare-ux/components/fx-icon.js";
import "@run.time/flare-ux/components/fx-spinner.js";
import "@run.time/flare-ux/components/fx-dropdown-menu.js";
import "@run.time/flare-ux/components/fx-dialog.js";
import { toast } from "@run.time/flare-ux/components/fx-toast.js";
import { confirmAction } from "@run.time/flare-ux/components/fx-popup-alert.js";
import "./icons.js";
import { SHAPES } from "./shapes.js";
import { BRUSHES, PAINT_STRENGTHS, SPRAY_FLOWS, SMUDGE_PRESSES, SIZES, Painter, flowerCenterOf, SUNSET_STOPS } from "./painter.js";
import { History, drawBlob } from "./history.js";

// Crayon colors are the picture's paint, not UI, so they are plain values.
const COLORS = [
  { value: "#e53935", label: "Red" },
  { value: "#fb8c00", label: "Orange" },
  { value: "#fdd835", label: "Yellow" },
  { value: "#d4a017", label: "Gold" },
  { value: "#9ccc65", label: "Lime" },
  { value: "#2e9e44", label: "Green" },
  { value: "#00a6a0", label: "Teal" },
  { value: "#29b6f6", label: "Sky blue" },
  { value: "#1e5bd8", label: "Blue" },
  { value: "#7b3fc4", label: "Purple" },
  { value: "#b39ddb", label: "Lavender" },
  { value: "#f06292", label: "Pink" },
  { value: "#d81b8c", label: "Magenta" },
  { value: "#ffb38a", label: "Peach" },
  { value: "#8d5524", label: "Brown" },
  { value: "#9e9e9e", label: "Gray" },
  { value: "#212121", label: "Black" },
  { value: "#ffffff", label: "White" },
  { value: "rainbow", label: "Rainbow" }, // cycles through the hues as you draw, with any brush
];

// Paper colors: what the stage shows behind the picture, and what Save puts under it.
// 16 plain papers, Wood, Sunset, Picture and Custom: as many as there are colors (4 rows of 5).
const PAPERS = [
  { value: "#ffffff", label: "White" },
  { value: "#fff8e7", label: "Cream" },
  { value: "#fff3b0", label: "Sunshine" },
  { value: "#ffe1ec", label: "Pink" },
  { value: "#ece4ff", label: "Purple" },
  { value: "#dff1ff", label: "Sky" },
  { value: "#d6f5f1", label: "Water" },
  { value: "#e0f7e9", label: "Grass" },
  { value: "#e4e4e4", label: "Silver" },
  { value: "#1f5f75", label: "Ocean" },
  { value: "#1e4d2b", label: "Evergreen" },
  { value: "#3b1f4a", label: "Plum" },
  { value: "#661a1f", label: "Cherry" },
  { value: "#d9b98c", label: "Cardboard" },
  { value: "#23312b", label: "Chalkboard" },
  { value: "wood", label: "Wood" }, // light wood grain
  { value: "sunset", label: "Sunset" }, // a sunset down to a middle horizon, mirrored below it
  { value: "coloring", label: "Coloring Page" }, // a page of line art to color in (assets/coloring-pages)
  { value: "picture", label: "Picture" }, // a photo the child uploads, filling the paper
];

// The uploaded picture, as a data URL (kept in this browser between visits).
let pictureUrl = null;

const WOOD_URL = "/assets/papers/wood.png";
const COLORING_DIR = "/assets/coloring-pages/";

/** A paper as a CSS background: its color, Wood's or the uploaded picture's image, or Sunset's gradient. */
function paperCss(value) {
  if (value === "wood") return `url(${WOOD_URL}) center / cover no-repeat, #e2c08f`;
  if (value === "coloring") return "#ffffff"; // the page's lines are a layer over the drawing
  if (value === "picture") return pictureUrl ? `url(${pictureUrl}) center / cover no-repeat, #ffffff` : "#ffffff";
  if (value !== "sunset") return value;
  return `linear-gradient(to bottom, ${SUNSET_STOPS.map(([at, color]) => `${color} ${at * 100}%`).join(", ")})`;
}

const PREFS_KEY = "crayon-box.prefs";
const THEME_KEY = "crayon-box.theme";
const DRAWING_KEY = "crayon-box.drawing";
const PICTURE_KEY = "crayon-box.picture";

const store = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null;
    }
  },
  raw(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
      return true;
    } catch {
      return false; // private mode, or the picture is too big to keep
    }
  },
};

const saved = store.get(PREFS_KEY) ?? {};
// Rainbow used to be a brush (a smooth line, like the marker); it is a color now.
if (saved.brush === "rainbow") Object.assign(saved, { brush: "marker", color: "rainbow" });
// Sparkle was folded into Spray, which now draws sparkles.
if (saved.brush === "sparkle") saved.brush = "spray";
// The tools every new picture starts with: black crayon, medium, round, on white paper.
const DEFAULTS = { brush: "crayon", color: "#212121", size: "md", shape: "round", paper: "#ffffff", paint: "light", spray: "light", smudge: "light" };

const state = {
  brush: BRUSHES.some((b) => b.id === saved.brush && !b.action) ? saved.brush : DEFAULTS.brush,
  color: saved.color === "rainbow" || /^#[0-9a-f]{6}$/i.test(saved.color ?? "") ? saved.color : DEFAULTS.color,
  size: SIZES.some((s) => s.id === saved.size) ? saved.size : DEFAULTS.size,
  shape: SHAPES.some((s) => s.id === saved.shape) ? saved.shape : DEFAULTS.shape,
  eraserPrevious: {
    size: SIZES.some((s) => s.id === saved.eraserPrevious?.size) ? saved.eraserPrevious.size : DEFAULTS.size,
    shape: SHAPES.some((s) => s.id === saved.eraserPrevious?.shape) ? saved.eraserPrevious.shape : DEFAULTS.shape,
  },
  paper:
    (saved.paper === "picture" ? store.raw(PICTURE_KEY) : PAPERS.some((p) => p.value === saved.paper)) || /^#[0-9a-f]{6}$/i.test(saved.paper ?? "")
      ? saved.paper
      : DEFAULTS.paper,
  paint: PAINT_STRENGTHS.some((p) => p.id === saved.paint) ? saved.paint : DEFAULTS.paint,
  spray: PAINT_STRENGTHS.some((p) => p.id === saved.spray) ? saved.spray : DEFAULTS.spray,
  smudge: PAINT_STRENGTHS.some((p) => p.id === saved.smudge) ? saved.smudge : DEFAULTS.smudge,
  // The chosen coloring page's file name (checked against the list once it loads).
  coloring: typeof saved.coloring === "string" && /^[\w.-]+$/.test(saved.coloring) ? saved.coloring : null,
  // Where that page sits on the paper (css px), fixed when it was picked, so the
  // lines stay over the coloring when the window changes size.
  coloringRect: saved.coloringRect && ["x", "y", "w", "h"].every((k) => Number.isFinite(saved.coloringRect[k])) ? saved.coloringRect : null,
  // "row" was the folded layout's old name.
  layout: saved.layout === "sidebar" ? "sidebar" : saved.layout === "rail" || saved.layout === "row" ? "rail" : matchMedia("(max-width: 720px)").matches ? "rail" : "sidebar",
};

const app = document.querySelector(".app");
const toolbox = document.querySelector(".toolbox");
const stage = document.querySelector(".stage");
const ring = document.querySelector(".cursor-ring");
const copySelectionButton = document.getElementById("copy-selection");
const painter = new Painter(stage, document.getElementById("ink"), document.getElementById("wet"), document.getElementById("paper"));
const history = new History(painter.ink, { limit: 150, onChange: syncHistoryButtons });

function positionCopySelectionButton() {
  const bounds = painter.selectionBounds;
  copySelectionButton.hidden = !bounds;
  if (!bounds) return;
  const width = copySelectionButton.offsetWidth;
  const height = copySelectionButton.offsetHeight;
  const left = Math.max(4, Math.min((bounds.left + bounds.right - width) / 2, stage.clientWidth - width - 4));
  const belowSelection = Math.max(bounds.bottom, painter.selectionRotationHandleBottom) + 12;
  const top = Math.max(4, Math.min(belowSelection, stage.clientHeight - height - 4));
  copySelectionButton.style.left = `${left}px`;
  copySelectionButton.style.top = `${top}px`;
}

painter.onSelectionChange = positionCopySelectionButton;
copySelectionButton.addEventListener("pointerdown", (event) => event.stopPropagation());
copySelectionButton.addEventListener("click", () => painter.copySelection());

// -- Building the groups ----------------------------------------------------

const labelOf = {
  brush: (v) => {
    const name = BRUSHES.find((b) => b.id === v).label;
    return STRENGTH_BRUSHES.includes(v) ? `${name} ${strengthOf(v).label}` : name;
  },
  color: (v) => COLORS.find((c) => c.value === v)?.label ?? "Your color",
  size: (v) => SIZES.find((s) => s.id === v).label,
  shape: (v) => SHAPES.find((s) => s.id === v).label,
  paper: (v) => PAPERS.find((p) => p.value === v)?.label ?? "Custom",
};

const crayon = `<span class="crayon-wrap"><span class="crayon"></span></span>`;

function option(group, value, label, inner, extra = "") {
  return `<button type="button" class="opt" data-group="${group}" data-value="${value}" aria-pressed="false" aria-label="${label}" title="${label}" ${extra}>${inner}</button>`;
}

function fill(group, html) {
  toolbox.querySelector(`[data-group-panel="${group}"] .choices`).innerHTML = html;
}

fill(
  "brush",
  BRUSHES.map((b) => option("brush", b.id, b.label, `<fx-icon name="crayon:${b.id}" size="28"></fx-icon><span class="opt-text">${b.label}</span>`)).join(""),
);
fill(
  "color",
  COLORS.map((c) => option("color", c.value, c.label, crayon, `style="--c:${c.value}"`)).join("") +
    `<label class="opt custom" title="Any color" aria-label="Any color"><span class="wheel"></span><input type="color" id="custom-color" /></label>`,
);
fill(
  "size",
  SIZES.map((s) => option("size", s.id, s.label, `<span class="size-dot" style="--d:${s.dot}px"></span>`)).join(""),
);
fill(
  "shape",
  SHAPES.map((s) => option("shape", s.id, s.label, `<fx-icon name="shape:${s.id}" size="26"></fx-icon>`)).join(""),
);
fill(
  "paper",
  PAPERS.map((p) =>
    p.value === "picture"
      ? option("paper", p.value, "Picture: upload a photo", `<span class="paper-sheet"></span><fx-icon name="upload" size="22"></fx-icon>`)
      : p.value === "coloring"
      ? option("paper", p.value, "Coloring Page: pick one", `<span class="paper-sheet"></span><fx-icon name="image" size="22"></fx-icon>`)
      : option("paper", p.value, p.label, `<span class="paper-sheet"></span>`, `style="--p:${paperCss(p.value, 96)}"`),
  ).join("") +
    `<label class="opt custom" title="Custom" aria-label="Custom paper"><span class="wheel"></span><input type="color" id="custom-paper" /></label>`,
);

// -- Reflecting the state ----------------------------------------------------

function render() {
  const sizePx = SIZES.find((s) => s.id === state.size).px;
  const stamp = SIZES.find((s) => s.id === state.size).stamp;
  Object.assign(painter, { brush: state.brush, color: state.color, size: sizePx, stamp, shape: state.shape, paper: state.paper });
  document.documentElement.style.setProperty("--paper", paperCss(state.paper));
  // A coloring page's lines sit over the drawing (multiplied, so its white lets the coloring show).
  const rect = state.coloringRect;
  const page = state.paper === "coloring" && state.coloring && rect ? `url("${COLORING_DIR}${encodeURIComponent(state.coloring)}")` : "none";
  document.documentElement.style.setProperty("--lines", page);
  if (rect) {
    const linesLayer = stage.querySelector(".lines");
    Object.assign(linesLayer.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
  }
  painter.linesRect = rect;

  // --ink colors the icons (an SVG fill: one color); --ink-bg the dots and the crayon (can be a gradient).
  const rainbow = state.color === "rainbow";
  const root = document.documentElement.style;
  root.setProperty("--ink", state.brush === "eraser" ? "var(--fx-text-secondary)" : rainbow ? "#e53935" : state.color);
  // The strip's crayon gets white bands when it is the black one (see app.css).
  if (state.color === "#212121" && state.brush !== "eraser") root.setProperty("--ink-band", "var(--fx-color-white)");
  else root.removeProperty("--ink-band");
  root.setProperty("--ink-opposite", state.brush === "eraser" ? "var(--fx-text-secondary)" : flowerCenterOf(rainbow ? "#e53935" : state.color));
  root.setProperty("--ink-bg", state.brush === "eraser" ? "var(--fx-text-secondary)" : rainbow ? "var(--rainbow)" : state.color);
  app.dataset.layout = state.layout;
  stage.dataset.brush = state.brush;

  for (const opt of toolbox.querySelectorAll(".opt[data-group]")) {
    opt.setAttribute("aria-pressed", String(state[opt.dataset.group] === opt.dataset.value));
  }
  const custom = toolbox.querySelector('[data-group-panel="color"] .opt.custom');
  const isCustom = !COLORS.some((c) => c.value === state.color);
  custom.classList.toggle("is-picked", isCustom);
  if (isCustom) custom.style.setProperty("--c", state.color);
  if (!rainbow) custom.querySelector("input").value = state.color;
  const customPaper = toolbox.querySelector('[data-group-panel="paper"] .opt.custom');
  const isCustomPaper = !PAPERS.some((p) => p.value === state.paper);
  customPaper.classList.toggle("is-picked", isCustomPaper);
  if (isCustomPaper) {
    customPaper.style.setProperty("--c", state.paper);
    customPaper.querySelector("input").value = state.paper;
  }

  for (const group of ["brush", "color", "size", "shape", "paper"]) {
    const name = labelOf[group](state[group]);
    toolbox.querySelector(`[data-group-panel="${group}"] .picked`).textContent = name;
    const trigger = toolbox.querySelector(`.group-trigger[data-trigger="${group}"]`);
    trigger.setAttribute("aria-label", `${group[0].toUpperCase()}${group.slice(1)}: ${name}`);
    trigger.title = trigger.getAttribute("aria-label");
  }
  toolbox.querySelector('[data-trigger="color"] .crayon').classList.toggle("is-rainbow", rainbow);
  const brushTrigger = toolbox.querySelector('[data-trigger="brush"]');
  brushTrigger.classList.toggle("has-strength", STRENGTH_BRUSHES.includes(state.brush));
  brushTrigger.querySelector(".trigger-face").innerHTML =
    `<fx-icon name="crayon:${state.brush}" size="28"></fx-icon>` + (STRENGTH_BRUSHES.includes(state.brush) ? pipsHtml(state.brush) : "");
  // The Paint, Spray and Smudge tiles: their pips show the strength, and their names say it.
  for (const brush of STRENGTH_BRUSHES) {
    const tile = toolbox.querySelector(`.opt[data-group="brush"][data-value="${brush}"]`);
    tile.querySelector(".pips")?.remove();
    tile.insertAdjacentHTML("beforeend", pipsHtml(brush));
    const label = BRUSHES.find((b) => b.id === brush).label;
    const name = state.brush === brush ? `${label} ${strengthOf(brush).label} (tap again to change)` : label;
    tile.setAttribute("aria-label", name);
    tile.title = name;
  }
  painter.paintAlpha = strengthOf("paint").alpha;
  painter.sprayFlow = SPRAY_FLOWS[state.spray];
  painter.smudgePress = SMUDGE_PRESSES[state.smudge];
  toolbox.querySelector('[data-trigger="size"] .size-dot').style.setProperty("--d", `${SIZES.find((s) => s.id === state.size).dot}px`);
  toolbox.querySelector('[data-trigger="shape"] .trigger-face').innerHTML = `<fx-icon name="shape:${state.shape}" size="28"></fx-icon>`;

  const toggle = document.getElementById("layout-toggle");
  const folded = state.layout === "rail";
  toggle.setAttribute("aria-expanded", String(!folded));
  toggle.setAttribute("aria-label", folded ? "Open the settings menu" : "Fold tools into a strip");
  toggle.setAttribute("aria-hidden", String(folded));
  toggle.tabIndex = folded ? -1 : 0;
  toggle.title = toggle.getAttribute("aria-label");

  renderSettings();
  updateRing();
  store.set(PREFS_KEY, state);
}

// -- Light and dark menus (the paper keeps its own color) -------------------------

const darkQuery = matchMedia("(prefers-color-scheme: dark)");
const isDark = () => (document.documentElement.dataset.fxTheme ?? (darkQuery.matches ? "dark" : "light")) === "dark";

// -- The menu: theme, view, new and save -----------------------------------------

const settings = document.getElementById("settings");
// Workaround for flare-ux 0.1.0: it hides its default ⋮ with `:host(:has(> [slot="trigger"]))`,
// which browsers don't match, so a custom trigger shows both icons. Remove once fixed upstream.
customElements.whenDefined("fx-dropdown-menu").then(() => {
  settings.shadowRoot?.querySelector(".default-icon")?.style.setProperty("display", "none");
});

/** Tick the current theme and view in the menu. */
function renderSettings() {
  const current = { theme: isDark() ? "dark" : "light", layout: state.layout };
  for (const item of settings.querySelectorAll("button[data-check]")) {
    const on = current[item.dataset.check] === item.dataset.value;
    item.classList.toggle("is-checked", on);
    item.setAttribute("aria-current", on ? "true" : "false");
  }
  // In the strip the menu button sits at the left edge, so the menu opens rightward from it.
  if (state.layout === "rail") settings.setAttribute("align", "start");
  else settings.removeAttribute("align");
}

function setTheme(theme) {
  document.documentElement.dataset.fxTheme = theme;
  store.set(THEME_KEY, theme);
  renderSettings();
}

/** Fold the sidebar into the strip, or open it (the column's width eases; see .app in app.css). */
function setLayout(layout) {
  closePopover();
  state.layout = layout;
  render();
}

settings.addEventListener("fx:menu-select", (e) => {
  const value = e.detail.value;
  if (value === "light" || value === "dark") setTheme(value);
  else if (value === "sidebar" || value === "rail") setLayout(value);
  else if (value === "new") newPicture();
  else if (value === "save") savePicture();
});
darkQuery.addEventListener("change", renderSettings);

/** Three little dots, filled for a brush's strength: one Light, two Medium, three Hard. */
function pipsHtml(brush) {
  const on = strengthOf(brush).pips;
  return `<span class="pips" aria-hidden="true">${[1, 2, 3].map((n) => `<i class="${n <= on ? "on" : ""}"></i>`).join("")}</span>`;
}

// -- Choosing ------------------------------------------------------------------

// Brushes with a strength (Light, Medium, Hard), kept in state under the brush's id.
const STRENGTH_BRUSHES = ["paint", "spray", "smudge"];

function strengthOf(brush) {
  return PAINT_STRENGTHS.find((p) => p.id === state[brush]);
}

function restoreEraserSettings() {
  state.size = state.eraserPrevious.size;
  state.shape = state.eraserPrevious.shape;
}

function choose(group, value) {
  // Leaving the Move tool sets down whatever is floating.
  if (group === "brush" && value !== "move") {
    painter.commitSelection();
    stage.style.cursor = "";
  }
  // Paint, Spray and Smudge start at Light; tapping again goes Medium, then Hard, then back to Light.
  if (group === "brush" && STRENGTH_BRUSHES.includes(value)) {
    const i = PAINT_STRENGTHS.findIndex((p) => p.id === state[value]);
    state[value] = state.brush === value ? PAINT_STRENGTHS[(i + 1) % PAINT_STRENGTHS.length].id : PAINT_STRENGTHS[0].id;
  }
  if (group === "brush" && value === "eraser") {
    if (state.brush !== "eraser") {
      state.eraserPrevious = { size: state.size, shape: state.shape };
    }
    state.size = "xxl";
    state.shape = "round";
  } else if (state.brush === "eraser" && (group === "brush" || group === "color")) {
    restoreEraserSettings();
  }
  state[group] = value;
  // Picking a color while erasing or smudging means "I want to draw again".
  if (group === "color" && (state.brush === "eraser" || state.brush === "smudge")) state.brush = "crayon";
  render();
}

toolbox.addEventListener("click", (e) => {
  const opt = e.target.closest(".opt[data-group]");
  // Coloring Page: with none picked yet, or tapped while already the paper, it opens the chooser.
  if (opt?.dataset.value === "coloring" && (!state.coloring || state.paper === "coloring")) {
    openColoringChooser();
    return;
  }
  // Picture: with none yet, or tapped while already the paper, it asks for a photo.
  if (opt?.dataset.value === "picture" && (!pictureUrl || state.paper === "picture")) {
    pictureInput.click();
    return;
  }
  if (opt) {
    const again = opt.dataset.group === "brush" && STRENGTH_BRUSHES.includes(opt.dataset.value) && state.brush === opt.dataset.value;
    choose(opt.dataset.group, opt.dataset.value);
    // In the strip, keep the popover open while a strength is being changed.
    if (state.layout === "rail" && !again) closePopover();
    return;
  }
  const trigger = e.target.closest(".group-trigger");
  if (trigger) {
    const group = trigger.dataset.trigger;
    openGroup === group ? closePopover() : openPopover(group);
  }
});

const customInput = document.getElementById("custom-color");
customInput.addEventListener("input", () => choose("color", customInput.value));
// -- Coloring pages ------------------------------------------------------------------
//
// The pages are the images in public/assets/coloring-pages. The dev server lists
// that folder at /assets/coloring-pages/index.json; `npm run build` writes the
// same list there for Vercel. So a new page is just a new image in the folder.

const coloringDialog = document.getElementById("coloring-dialog");
const coloringGrid = coloringDialog.querySelector(".coloring-grid");
let coloringPages = [];

async function loadColoringPages() {
  try {
    const res = await fetch(`${COLORING_DIR}index.json`, { cache: "no-cache" });
    coloringPages = res.ok ? await res.json() : [];
  } catch {
    coloringPages = [];
  }
  coloringGrid.innerHTML = coloringPages
    .map(
      (page) =>
        `<button type="button" class="coloring-choice" data-file="${page.file}" aria-label="${page.label}" title="${page.label}">` +
        `<img src="${COLORING_DIR}${encodeURIComponent(page.file)}" alt="" loading="lazy" /><span>${page.label}</span></button>`,
    )
    .join("");
  // A remembered page that is no longer in the folder is forgotten.
  if (state.coloring && !coloringPages.some((p) => p.file === state.coloring)) {
    state.coloring = null;
    if (state.paper === "coloring") state.paper = DEFAULTS.paper;
  }
  await showColoringPage();
}

/** Put the chosen page on its tile, and give its lines to the painter (for Fill and Save). */
function showColoringPage() {
  const tile = toolbox.querySelector('.opt[data-value="coloring"]');
  const url = state.coloring ? `${COLORING_DIR}${encodeURIComponent(state.coloring)}` : null;
  let pageImageReady = Promise.resolve();
  tile.classList.toggle("has-picture", !!url);
  tile.style.setProperty("--p", url ? `url("${url}") center / contain no-repeat, #ffffff` : "transparent");
  for (const b of coloringGrid.querySelectorAll(".coloring-choice")) b.setAttribute("aria-pressed", String(b.dataset.file === state.coloring));
  if (!url) {
    painter.lines = null;
  } else if (painter.lines?.dataset.file !== state.coloring) {
    const img = new Image();
    img.dataset.file = state.coloring;
    pageImageReady = new Promise((resolve) => {
      img.onload = () => {
        if (img.dataset.file === state.coloring) {
          painter.lines = img;
          if (!state.coloringRect) {
            // Place the page once: the whole page, fitted and centered on the paper as it is now.
            const W = stage.clientWidth, H = stage.clientHeight;
            const scale = Math.min(W / img.naturalWidth, H / img.naturalHeight);
            const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
            state.coloringRect = { x: (W - w) / 2, y: (H - h) / 2, w, h };
            render();
          }
        }
        resolve();
      };
      img.onerror = resolve;
    });
    img.src = url;
  }
  render();
  return pageImageReady;
}

function openColoringChooser() {
  if (!coloringPages.length) {
    toast("There are no coloring pages yet.", { tone: "info" });
    return;
  }
  coloringDialog.showModal();
}

coloringGrid.addEventListener("click", (e) => {
  const choice = e.target.closest(".coloring-choice");
  if (!choice) return;
  if (choice.dataset.file !== state.coloring) state.coloringRect = null; // placed fresh when it loads
  state.coloring = choice.dataset.file;
  coloringDialog.close();
  choose("paper", "coloring");
  showColoringPage();
  if (state.layout === "rail") closePopover();
});

const coloringPagesReady = loadColoringPages();

// -- Wood paper: its image, for Save ---------------------------------------------------

{
  const img = new Image();
  img.onload = () => (painter.wood = img);
  img.src = WOOD_URL;
}

// -- Picture paper ----------------------------------------------------------------

const pictureInput = Object.assign(document.createElement("input"), { type: "file", accept: "image/*", hidden: true });
document.body.append(pictureInput);

/** Show the picture on its tile, and hand it to the painter for saving. `null` forgets it. */
function usePicture(url) {
  pictureUrl = url;
  const tile = toolbox.querySelector('.opt[data-value="picture"]');
  tile.classList.toggle("has-picture", !!url);
  tile.style.setProperty("--p", url ? `url(${url}) center / cover no-repeat` : "transparent");
  if (!url) {
    painter.picture = null;
    return;
  }
  const img = new Image();
  img.onload = () => (painter.picture = img);
  img.src = url;
}

pictureInput.addEventListener("change", async () => {
  const file = pictureInput.files?.[0];
  pictureInput.value = "";
  if (!file) return;
  try {
    // Scaled down so it keeps in the browser and draws quickly.
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const c = Object.assign(document.createElement("canvas"), { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
    c.getContext("2d").drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close?.();
    const url = c.toDataURL("image/jpeg", 0.85);
    usePicture(url);
    if (!store.set(PICTURE_KEY, url)) toast("This picture is too big to keep after a reload, but you can use it now.", { tone: "info" });
    choose("paper", "picture");
    if (state.layout === "rail") closePopover();
  } catch {
    toast("That file isn't a picture we can use.", { tone: "warning" });
  }
});

{
  const kept = store.raw(PICTURE_KEY);
  if (kept?.startsWith("data:image/")) usePicture(kept); // the render at start-up shows it
}

const customPaperInput = document.getElementById("custom-paper");
customPaperInput.addEventListener("input", () => choose("paper", customPaperInput.value));

// -- Popovers (row layout) -------------------------------------------------------

let openGroup = null;

function openPopover(group) {
  closePopover();
  openGroup = group;
  const section = toolbox.querySelector(`[data-group="${group}"].group`);
  section.dataset.open = "";
  section.querySelector(".group-trigger").setAttribute("aria-expanded", "true");
  placePopover();
  const panel = section.querySelector(".group-panel");
  panel.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
}

/** Line the open popover up with its button, nudged to stay on screen. */
function placePopover() {
  if (!openGroup) return;
  const section = toolbox.querySelector(`[data-group="${openGroup}"].group`);
  const trigger = section.querySelector(".group-trigger").getBoundingClientRect();
  const panel = section.querySelector(".group-panel");
  const margin = 8;
  const top = Math.min(Math.max(margin, trigger.top - 8), innerHeight - margin - panel.offsetHeight);
  panel.style.setProperty("--top", `${Math.max(margin, top)}px`);
}

addEventListener("resize", placePopover);
toolbox.addEventListener("scroll", placePopover, { passive: true });

function closePopover() {
  if (!openGroup) return;
  const section = toolbox.querySelector(`[data-group="${openGroup}"].group`);
  delete section.dataset.open;
  section.querySelector(".group-trigger").setAttribute("aria-expanded", "false");
  openGroup = null;
}

document.addEventListener("pointerdown", (e) => {
  if (openGroup && !(e.target instanceof Element && e.target.closest(".group[data-open]"))) closePopover();
});

// -- Actions ---------------------------------------------------------------------

const buttons = {
  undo: document.getElementById("undo"),
  redo: document.getElementById("redo"),
  clear: document.getElementById("clear"),
  share: document.getElementById("share"),
};

function syncHistoryButtons() {
  buttons.undo.disabled = !history.canUndo;
  buttons.redo.disabled = !history.canRedo;
}

let autosaveTimer;
function remember() {
  const snapshot = history.push();
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    const blob = await snapshot;
    if (!blob) return;
    const reader = new FileReader();
    reader.onload = () => store.set(DRAWING_KEY, reader.result);
    reader.readAsDataURL(blob);
  }, 800);
}

async function rememberAfter(step) {
  await step;
  const blob = await history.current();
  if (!blob) return;
  const reader = new FileReader();
  reader.onload = () => store.set(DRAWING_KEY, reader.result);
  reader.readAsDataURL(blob);
}

painter.onChange = remember;

// Undo and Redo set down a floating piece first (so Undo goes back to before the move).
buttons.undo.addEventListener("click", () => {
  painter.commitSelection();
  rememberAfter(history.undo());
});
buttons.redo.addEventListener("click", () => {
  painter.commitSelection();
  rememberAfter(history.redo());
});
buttons.clear.addEventListener("click", clearPicture);
buttons.share.addEventListener("click", sharePicture);

/** Clear the paper at once. No question asked; Undo brings it back. */
function clearPicture() {
  painter.commitSelection();
  painter.clear();
  remember();
  toast("Clean paper! Undo brings your picture back.", { tone: "info", duration: 2500 });
}

async function newPicture() {
  painter.commitSelection();
  const ok = await confirmAction({
    title: "Start a new picture?",
    message: "This wipes the paper clean and forgets every step, so Undo can't bring this picture back. Save it first if you want to keep it.",
    confirmLabel: "Start over",
    tone: "error",
  });
  if (!ok) return;
  painter.clear();
  history.reset(); // a fresh start: nothing to undo back to
  Object.assign(state, DEFAULTS); // and the starting tools (the view and theme stay as they are)
  // An uploaded picture was this picture's paper: forget it too. (A coloring page stays
  // in the chooser; the paper is White again.)
  usePicture(null);
  try {
    localStorage.removeItem(PICTURE_KEY);
  } catch {}
  render();
  remember();
}

function pictureBlob() {
  painter.commitSelection();
  return new Promise((resolve, reject) => {
    painter.flatten().toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The drawing could not be exported as a PNG."));
    }, "image/png");
  });
}

function pictureFilename() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  return `crayon-box-${stamp}.png`;
}

function downloadPicture(blob) {
  const link = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob),
    download: pictureFilename(),
  });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}

async function savePicture() {
  try {
    downloadPicture(await pictureBlob());
    toast("Your picture is saved!", { tone: "success" });
  } catch (error) {
    console.error("Could not save the drawing:", error);
    toast("Couldn't save the picture. Please try again.", { tone: "error" });
  }
}

async function sharePicture() {
  let blob;
  try {
    blob = await pictureBlob();
  } catch (error) {
    console.error("Could not prepare the drawing for sharing:", error);
    toast("Couldn't prepare the picture to share. Please try again.", { tone: "error" });
    return;
  }

  if (typeof File === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") {
    downloadPicture(blob);
    toast("Sharing isn't available here. Your picture was downloaded instead.", { tone: "info" });
    return;
  }

  const file = new File([blob], pictureFilename(), { type: "image/png" });
  if (!navigator.canShare({ files: [file] })) {
    downloadPicture(blob);
    toast("Sharing pictures isn't supported here. Your picture was downloaded instead.", { tone: "info" });
    return;
  }

  try {
    await navigator.share({ title: "Crayon Box picture", files: [file] });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    console.error("Could not share the drawing:", error);
    toast("Couldn't share the picture. Try Save Picture instead.", { tone: "error" });
  }
}

document.getElementById("layout-toggle").addEventListener("click", () => {
  if (state.layout === "rail") settings.querySelector('[slot="trigger"]').click();
  else setLayout("rail");
});

// -- Keyboard ----------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openGroup) {
    const trigger = toolbox.querySelector(`[data-trigger="${openGroup}"]`);
    closePopover();
    trigger.focus();
    return;
  }
  if (e.target instanceof Element && e.target.closest("input, textarea, fx-text-field, dialog")) return;
  if (painter.selecting) {
    if (e.key === "Enter" || e.key === "Escape") {
      e.preventDefault();
      painter.commitSelection();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      painter.dropSelection();
      return;
    }
  }
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") {
    e.preventDefault();
    painter.commitSelection();
    rememberAfter(e.shiftKey ? history.redo() : history.undo());
  } else if (mod && e.key.toLowerCase() === "y") {
    e.preventDefault();
    painter.commitSelection();
    rememberAfter(history.redo());
  } else if (!mod && (e.key === "[" || e.key === "]")) {
    const i = SIZES.findIndex((s) => s.id === state.size) + (e.key === "]" ? 1 : -1);
    if (SIZES[i]) choose("size", SIZES[i].id);
  }
});

// -- The brush ring that follows a mouse or pen --------------------------------------

let lastPointer = null;

function updateRing() {
  const show = lastPointer && state.brush !== "fill" && state.brush !== "move";
  ring.hidden = !show;
  if (!show) return;
  const size =
    state.brush === "spray" ? painter.size * 1.8 + 8
    : state.brush === "smudge" ? painter.smudgeSize
    : state.shape === "round" ? painter.size
    : painter.stampSize;
  ring.style.width = ring.style.height = `${size}px`;
  ring.style.transform = `translate(${lastPointer.x - size / 2}px, ${lastPointer.y - size / 2}px)`;
}

stage.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  const r = stage.getBoundingClientRect();
  lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top };
  updateRing();
});
stage.addEventListener("pointerleave", () => {
  lastPointer = null;
  updateRing();
});

// -- Start ------------------------------------------------------------------------------

render();
// The saved layout is in place; from now on, folding the sidebar slides.
requestAnimationFrame(() => requestAnimationFrame(() => app.classList.remove("no-slide")));

const drawingReady = (async () => {
  const drawing = store.raw(DRAWING_KEY);
  if (drawing?.startsWith("data:image/png")) {
    try {
      const blob = await (await fetch(drawing)).blob();
      // Saved on a wider screen? Grow the paper first so none of it is cut off.
      const { width, height } = await createImageBitmap(blob);
      painter.fit(Math.ceil(width / painter.dpr), Math.ceil(height / painter.dpr));
      await drawBlob(painter.ink, blob);
    } catch {}
  }
  await history.push();
})();

const pageLoadReady =
  document.readyState === "complete"
    ? Promise.resolve()
    : new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
const minimumLoadingTime = new Promise((resolve) => {
  setTimeout(resolve, Math.max(0, 2000 - performance.now()));
});

Promise.all([pageLoadReady, coloringPagesReady, drawingReady, minimumLoadingTime]).then(() => {
  document.getElementById("loading-screen").hidden = true;
  app.classList.remove("is-loading");
});
