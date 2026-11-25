// The drawing engine: pointer input in, marks on the paper out.
//
// Two canvases, stacked in the stage:
//   ink  the picture itself (transparent; the page's white paper shows through)
//   wet  a layer on top for brushes that must not darken where a stroke
//        crosses itself (Paint): the stroke is drawn there at full strength,
//        shown see-through, and laid onto the ink when the finger lifts.
//
// Round tips draw smooth lines; any other tip shape stamps that shape along
// the stroke. The canvas only ever grows (to the largest the stage has been),
// so folding the toolbox or turning a tablet never crops a picture.

import { FLOWER_CENTER, SHAPES, shapeAt } from "./shapes.js";

export const BRUSHES = [
  { id: "crayon", label: "Crayon" },
  { id: "marker", label: "Marker" },
  { id: "paint", label: "Paint" },
  { id: "spray", label: "Spray" },
  { id: "fill", label: "Fill" },
  { id: "eraser", label: "Eraser" },
  { id: "smudge", label: "Smudge" },
  { id: "move", label: "Move" }, // select a rectangle, then move, resize or turn it
];

// px: the brush width; stamp: how wide a shape stamp is (each size its own,
// so the smallest stamps still differ); dot: how big it is drawn on its button.
export const SIZES = [
  { id: "xxs", label: "Tiny", px: 1, stamp: 12, dot: 2 },
  { id: "xs", label: "Small", px: 4, stamp: 17, dot: 5 },
  { id: "md", label: "Medium", px: 14, stamp: 22, dot: 10 },
  { id: "lg", label: "Large", px: 24, stamp: 38, dot: 15 },
  { id: "xl", label: "Huge", px: 40, stamp: 64, dot: 21 },
  { id: "xxl", label: "Gianormous", px: 64, stamp: 102, dot: 28 },
];

// The Sunset paper, top to bottom: night purple down through pink and orange to
// a yellow horizon in the middle, then the same colors again, mirrored.
const SUNSET_TOP = [
  [0, "#4a2a7a"],
  [0.14, "#8a4bab"],
  [0.27, "#dc6a9c"],
  [0.38, "#ff9867"],
  [0.5, "#ffe08a"],
];

export const SUNSET_STOPS = [...SUNSET_TOP, ...SUNSET_TOP.slice(0, -1).reverse().map(([at, color]) => [1 - at, color])];

// How far above a floating piece its turn handle sits (css px).
const ROTATE_GAP = 26;
const ROTATE_HANDLE_RADIUS = 7;

const SHAPE_PATH = Object.fromEntries(SHAPES.map((s) => [s.id, s.d]));
// How see-through Paint is at each strength, in the order a tap steps through
// them; the first (Light) is where Paint and Spray start.
export const PAINT_STRENGTHS = [
  { id: "light", label: "Light", alpha: 0.3, pips: 1 },
  { id: "medium", label: "Medium", alpha: 0.55, pips: 2 },
  { id: "hard", label: "Hard", alpha: 0.85, pips: 3 },
];

// How much Spray puts down at each strength (same names and dots as Paint):
// `count` shapes every `gap` × the usual spacing. Hard is the full flow.
// How hard Smudge presses at each strength: `lay` is how strongly the carried
// paint is laid down, `fade` how fast it thins. Light fades out on its own
// (dragging paint about 40px); Medium and Hard press harder and would run on,
// so `reach` (css px along the stroke) tapers them off: about 240px and 445px,
// evenly spaced steps.
export const SMUDGE_PRESSES = {
  light: { lay: 0.22, fade: 0.4, reach: Infinity },
  medium: { lay: 0.44, fade: 0.3, reach: 405 },
  hard: { lay: 0.44, fade: 0.3, reach: 710 },
};

export const SPRAY_FLOWS = {
  hard: { count: 2, gap: 1 },
  medium: { count: 1, gap: 1 },
  light: { count: 1, gap: 2 },
};

export class Painter {
  brush = "crayon";
  color = "#e53935";
  size = 14;
  shape = "round";
  /** Spray's flow: Light, Medium or Hard (see SPRAY_FLOWS). */
  sprayFlow = SPRAY_FLOWS.light;
  /** Smudge's press: Light, Medium or Hard (see SMUDGE_PRESSES). */
  smudgePress = SMUDGE_PRESSES.light;
  /** Paint's opacity: Light, Medium or Hard (see PAINT_STRENGTHS). */
  paintAlpha = PAINT_STRENGTHS[0].alpha;
  /** Where the rainbow color is in its cycle; it carries on from stroke to stroke. */
  hue = Math.random() * 360;
  /** The uploaded photo, when the paper is "picture" (an <img>). */
  picture = null;
  /** The Wood paper's image (an <img>), and the chosen coloring page's (lines drawn over the picture). */
  wood = null;
  lines = null;
  /** Where the coloring page sits on the paper, in css px: { x, y, w, h }. */
  linesRect = null;
  /** The paper's color: shown behind the ink by the page, and laid under it on save. */
  paper = "#ffffff";
  /** Called when a stroke (or a fill) has finished changing the picture. */
  onChange = () => {};
  /** Called when the floating selection moves or changes visibility. */
  onSelectionChange = () => {};

  constructor(stage, ink, wet, paperLayer) {
    this.stage = stage;
    this.paperLayer = paperLayer; // the page's paper: it fills the stage (the visible paper), as Save does
    this.ink = ink;
    this.wet = wet;
    this.ctx = ink.getContext("2d");
    this.wetCtx = wet.getContext("2d");
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = 0;
    this.height = 0;
    this.stroke = null;

    new ResizeObserver(() => this.fit()).observe(stage);
    this.fit();

    stage.addEventListener("pointerdown", (e) => this.#down(e));
    stage.addEventListener("pointermove", (e) => this.#move(e));
    stage.addEventListener("pointerup", (e) => this.#up(e));
    stage.addEventListener("pointercancel", (e) => this.#up(e));
    stage.addEventListener("lostpointercapture", (e) => this.#up(e));
  }

  /** The color to put down now: the chosen one, or the rainbow's current hue. */
  get inkColor() {
    if (this.color !== "rainbow") return this.color;
    return hslToHex(Math.round(this.hue / 10) * 10, 88, 55); // steps of 10deg, so crayon grain can be cached
  }

  /** Move the rainbow along by a distance drawn. */
  #travel(distance) {
    this.hue = (this.hue + distance * 0.9) % 360;
  }

  /** How wide a stamp of the current tip is (set from the size; see SIZES). */
  stamp = 22;

  get stampSize() {
    return this.stamp;
  }

  /** Grow the canvases to cover the stage (or at least w x h css px), keeping what is drawn. */
  fit(minWidth = 0, minHeight = 0) {
    const w = Math.max(Math.ceil(this.stage.clientWidth), minWidth);
    const h = Math.max(Math.ceil(this.stage.clientHeight), minHeight);
    if (w <= this.width && h <= this.height) {
      this.onSelectionChange();
      return;
    }
    let old = null;
    if (this.width) {
      old = document.createElement("canvas");
      old.width = this.ink.width;
      old.height = this.ink.height;
      old.getContext("2d").drawImage(this.ink, 0, 0);
    }
    this.width = Math.max(w, this.width);
    this.height = Math.max(h, this.height);
    for (const canvas of [this.ink, this.wet]) {
      canvas.width = Math.round(this.width * this.dpr);
      canvas.height = Math.round(this.height * this.dpr);
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
    }
    if (old) this.ctx.drawImage(old, 0, 0);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.wetCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.sel) this.#drawSelection(); // resizing the canvas wiped the wet layer
  }

  clear() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.ink.width, this.ink.height);
    this.ctx.restore();
  }

  /** The picture on its paper, as a canvas ready to save: just what is on screen, as it looks. */
  flatten() {
    const out = document.createElement("canvas");
    out.width = Math.min(this.ink.width, Math.round(this.stage.clientWidth * this.dpr));
    out.height = Math.min(this.ink.height, Math.round(this.stage.clientHeight * this.dpr));
    const ctx = out.getContext("2d");
    if (this.paper === "sunset") {
      const sky = ctx.createLinearGradient(0, 0, 0, out.height);
      for (const [at, color] of SUNSET_STOPS) sky.addColorStop(at, color);
      ctx.fillStyle = sky;
    } else if (this.paper === "picture" || this.paper === "wood" || this.paper === "coloring") {
      ctx.fillStyle = "#ffffff";
    } else {
      ctx.fillStyle = this.paper;
    }
    ctx.fillRect(0, 0, out.width, out.height);
    // Picture and Wood fill the paper as the page shows them: covering, centered.
    const cover = this.paper === "picture" ? this.picture : this.paper === "wood" ? this.wood : null;
    if (cover) {
      const { naturalWidth: w, naturalHeight: h } = cover;
      const scale = Math.max(out.width / w, out.height / h);
      ctx.drawImage(cover, (out.width - w * scale) / 2, (out.height - h * scale) / 2, w * scale, h * scale);
    }
    ctx.drawImage(this.ink, 0, 0);
    // A coloring page's lines go on top, as on screen (white shows the coloring through).
    if (this.paper === "coloring" && this.lines && this.linesRect) {
      const r = this.#linesRect();
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(this.lines, r.x, r.y, r.w, r.h);
      ctx.globalCompositeOperation = "source-over";
    }
    return out;
  }

  /** Where the coloring page sits, in device px (set in css px as `linesRect` when it was picked). */
  #linesRect() {
    const r = this.linesRect;
    return { x: r.x * this.dpr, y: r.y * this.dpr, w: r.w * this.dpr, h: r.h * this.dpr };
  }

  /** For Fill: which device pixels are a coloring page's lines (1), so a fill stops at them. */
  #lineWalls(W, H) {
    if (this.paper !== "coloring" || !this.lines || !this.linesRect) return null;
    const scratch = Object.assign(document.createElement("canvas"), { width: W, height: H });
    const g = scratch.getContext("2d", { willReadFrequently: true });
    const r = this.#linesRect();
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
    g.drawImage(this.lines, r.x, r.y, r.w, r.h);
    const data = g.getImageData(0, 0, W, H).data;
    const walls = new Uint8Array(W * H);
    for (let k = 0; k < walls.length; k++) {
      const i = k * 4;
      if (data[i] + data[i + 1] + data[i + 2] < 3 * 150) walls[k] = 1; // dark enough to be a line
    }
    return walls;
  }

  // -- Pointer input ------------------------------------------------------

  #point(e) {
    const r = this.ink.getBoundingClientRect();
    const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    return { x: e.clientX - r.left, y: e.clientY - r.top, pressure };
  }

  #down(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (this.stroke || this.drag) return; // a second finger does not start a second stroke
    e.preventDefault();
    const p = this.#point(e);
    if (this.brush === "move") {
      this.#moveDown(e, p);
      return;
    }
    if (this.brush === "fill") {
      if (this.#fill(p)) this.onChange();
      return;
    }
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {} // a pointer already gone (or a synthetic one) can't be captured; draw anyway
    this.stroke = { id: e.pointerId, last: p, mid: p, points: [{ ...p, ink: this.inkColor }], carry: 0 };
    this.#begin(p);
  }

  #move(e) {
    if (this.brush === "move") {
      this.#moveMove(e);
      return;
    }
    const stroke = this.stroke;
    if (!stroke || e.pointerId !== stroke.id) return;
    const events = e.getCoalescedEvents?.() ?? [];
    for (const ev of events.length ? events : [e]) this.#extend(this.#point(ev));
  }

  #up(e) {
    if (this.drag && e.pointerId === this.drag.id) {
      this.#moveUp();
      return;
    }
    if (!this.stroke || e.pointerId !== this.stroke.id) return;
    this.#finish();
    this.stroke = null;
    this.onChange();
  }

  // -- Move: select a rectangle, then move, resize or turn it ---------------------
  //
  // Dragging a box lifts what is drawn inside it off the picture into `sel`, a
  // floating piece shown on the wet layer with handles: drag inside to move it,
  // a corner to resize it, the round handle above it to turn it. Tapping
  // outside it (or Enter, Escape, or another tool) stamps it back down; from
  // then on it is part of the picture like anything else (Undo goes back to
  // before the move). Delete drops it.

  /** Is something lifted and floating? */
  get selecting() {
    return !!this.sel;
  }

  /** The floating selection's axis-aligned bounds in stage coordinates. */
  get selectionBounds() {
    if (!this.sel) return null;
    const { cx, cy, w, h, angle } = this.sel;
    const c = Math.cos(angle), s = Math.sin(angle);
    const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
      .map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
    return {
      left: Math.min(...corners.map(({ x }) => x)),
      top: Math.min(...corners.map(({ y }) => y)),
      right: Math.max(...corners.map(({ x }) => x)),
      bottom: Math.max(...corners.map(({ y }) => y)),
    };
  }

  /** The lowest point of the turn handle in stage coordinates. */
  get selectionRotationHandleBottom() {
    if (!this.sel) return null;
    const { cy, h, angle } = this.sel;
    return cy - (h / 2 + ROTATE_GAP) * Math.cos(angle) + ROTATE_HANDLE_RADIUS;
  }

  /** Stamp a copy of the floating piece without lifting or moving it. */
  copySelection() {
    if (!this.sel) return;
    this.#stampSelection();
    this.#drawSelection();
    this.onChange();
  }

  /** Stamp the floating piece down where it is. */
  commitSelection() {
    if (!this.sel) return;
    this.#stampSelection();
    this.sel = null;
    this.#clearWet();
    this.onSelectionChange();
    this.onChange();
  }

  #stampSelection() {
    const { img, cx, cy, w, h, angle } = this.sel;
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingQuality = "high";
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /** Throw the floating piece away (it was already lifted off the picture). */
  dropSelection() {
    if (!this.sel) return;
    this.sel = null;
    this.#clearWet();
    this.onSelectionChange();
    this.onChange();
  }

  /** The point in the floating piece's own frame: its center at 0,0, unturned. */
  #local(p) {
    const { cx, cy, angle } = this.sel;
    const dx = p.x - cx, dy = p.y - cy;
    const c = Math.cos(-angle), s = Math.sin(-angle);
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  }

  /** What is under the pointer: "rotate", a corner ("nw" …), "inside", or null. */
  #hit(p, touch) {
    if (!this.sel) return null;
    const { w, h } = this.sel;
    const q = this.#local(p);
    const reach = touch ? 18 : 11;
    if (Math.hypot(q.x, q.y + h / 2 + ROTATE_GAP) <= reach + 2) return "rotate";
    for (const [name, sx, sy] of [["nw", -1, -1], ["ne", 1, -1], ["se", 1, 1], ["sw", -1, 1]]) {
      if (Math.abs(q.x - (sx * w) / 2) <= reach && Math.abs(q.y - (sy * h) / 2) <= reach) return name;
    }
    if (Math.abs(q.x) <= w / 2 && Math.abs(q.y) <= h / 2) return "inside";
    return null;
  }

  #moveDown(e, p) {
    try {
      this.stage.setPointerCapture(e.pointerId);
    } catch {}
    const part = this.#hit(p, e.pointerType === "touch");
    if (!part) {
      this.commitSelection(); // tapping outside sets the piece down; the drag selects anew
      this.drag = { id: e.pointerId, mode: "select", from: p, to: p };
      this.#drawMarquee();
      return;
    }
    const { cx, cy, w, h, angle } = this.sel;
    this.drag = { id: e.pointerId, mode: part, from: p, start: { cx, cy, w, h, angle } };
  }

  #moveMove(e) {
    const p = this.#point(e);
    const drag = this.drag;
    if (!drag || e.pointerId !== drag.id) {
      // Just hovering: a cursor that says what a drag would do.
      const part = this.#hit(p, false);
      this.stage.style.cursor =
        part === "inside" ? "move" : part === "rotate" ? "grab" : part === "nw" || part === "se" ? "nwse-resize" : part ? "nesw-resize" : "";
      return;
    }
    const st = drag.start;
    if (drag.mode === "select") {
      drag.to = p;
      this.#drawMarquee();
    } else if (drag.mode === "inside") {
      Object.assign(this.sel, { cx: st.cx + p.x - drag.from.x, cy: st.cy + p.y - drag.from.y });
      this.#drawSelection();
    } else if (drag.mode === "rotate") {
      const a0 = Math.atan2(drag.from.y - st.cy, drag.from.x - st.cx);
      const a1 = Math.atan2(p.y - st.cy, p.x - st.cx);
      let angle = st.angle + a1 - a0;
      // Snap to square when close, so it is easy to put back straight.
      const quarter = Math.PI / 2;
      const nearest = Math.round(angle / quarter) * quarter;
      if (Math.abs(angle - nearest) < 0.06) angle = nearest;
      this.sel.angle = angle;
      this.#drawSelection();
    } else {
      // A corner: the opposite corner stays put.
      const sx = drag.mode.includes("e") ? 1 : -1;
      const sy = drag.mode.includes("s") ? 1 : -1;
      const c = Math.cos(st.angle), s = Math.sin(st.angle);
      const dx = p.x - st.cx, dy = p.y - st.cy;
      const q = { x: dx * c + dy * s, y: -dx * s + dy * c }; // pointer, in the start frame
      const o = { x: (-sx * st.w) / 2, y: (-sy * st.h) / 2 }; // the fixed corner
      const w = Math.max(8, (q.x - o.x) * sx);
      const h = Math.max(8, (q.y - o.y) * sy);
      const mid = { x: o.x + (sx * w) / 2, y: o.y + (sy * h) / 2 };
      Object.assign(this.sel, { w, h, cx: st.cx + mid.x * c - mid.y * s, cy: st.cy + mid.x * s + mid.y * c });
      this.#drawSelection();
    }
  }

  #moveUp() {
    const drag = this.drag;
    this.drag = null;
    if (drag.mode !== "select") return;
    const x0 = Math.max(0, Math.min(drag.from.x, drag.to.x));
    const y0 = Math.max(0, Math.min(drag.from.y, drag.to.y));
    const x1 = Math.min(this.width, Math.max(drag.from.x, drag.to.x));
    const y1 = Math.min(this.height, Math.max(drag.from.y, drag.to.y));
    this.#clearWet();
    if (x1 - x0 < 4 || y1 - y0 < 4) return; // a tap, not a box
    // Lift what is inside the box off the picture.
    const d = this.dpr;
    const sx = Math.round(x0 * d), sy = Math.round(y0 * d);
    const sw = Math.max(1, Math.round((x1 - x0) * d)), sh = Math.max(1, Math.round((y1 - y0) * d));
    const img = Object.assign(document.createElement("canvas"), { width: sw, height: sh });
    img.getContext("2d").drawImage(this.ink, sx, sy, sw, sh, 0, 0, sw, sh);
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(sx, sy, sw, sh);
    this.ctx.restore();
    this.sel = { img, w: sw / d, h: sh / d, cx: (sx + sw / 2) / d, cy: (sy + sh / 2) / d, angle: 0 };
    this.wet.style.opacity = 1;
    this.#drawSelection();
  }

  /** The box being dragged out. */
  #drawMarquee() {
    const { from, to } = this.drag;
    const g = this.wetCtx;
    this.#clearWet();
    this.wet.style.opacity = 1;
    g.save();
    this.#dashes(g, () => g.strokeRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y)));
    g.restore();
  }

  /** The floating piece, its outline and handles. */
  #drawSelection() {
    const { img, cx, cy, w, h, angle } = this.sel;
    const g = this.wetCtx;
    this.#clearWet();
    g.save();
    g.translate(cx, cy);
    g.rotate(angle);
    g.imageSmoothingQuality = "high";
    g.drawImage(img, -w / 2, -h / 2, w, h);
    this.#dashes(g, () => g.strokeRect(-w / 2, -h / 2, w, h));
    // The turn handle, on a stalk above the top edge.
    this.#dashes(g, () => {
      g.beginPath();
      g.moveTo(0, -h / 2);
      g.lineTo(0, -h / 2 - ROTATE_GAP);
      g.stroke();
    });
    const knob = (x, y, round) => {
      g.beginPath();
      if (round) g.arc(x, y, ROTATE_HANDLE_RADIUS, 0, Math.PI * 2);
      else g.rect(x - 6, y - 6, 12, 12);
      g.fillStyle = "#ffffff";
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "#7b3fc4";
      g.stroke();
    };
    knob(0, -h / 2 - ROTATE_GAP, true);
    for (const [x, y] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) knob(x, y, false);
    g.restore();
    this.onSelectionChange();
  }

  /** A line that shows on any paper: white under dark dashes. */
  #dashes(g, trace) {
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255, 255, 255, 0.9)";
    g.setLineDash([]);
    trace();
    g.lineWidth = 1.5;
    g.strokeStyle = "#7b3fc4";
    g.setLineDash([6, 4]);
    trace();
    g.setLineDash([]);
  }

  // -- Strokes --------------------------------------------------------------

  /** Line width at a point: a pen presses wider or narrower; touch and mouse stay even. */
  #width(p) {
    return this.size * (0.4 + p.pressure * 1.2);
  }

  get #smooth() {
    return this.shape === "round" && ["crayon", "marker", "eraser"].includes(this.brush);
  }

  #begin(p) {
    const s = this.stroke;
    if (this.brush === "smudge") {
      this.#smudgeStart(p);
    } else if (this.brush === "paint") {
      this.#clearWet();
      this.wet.style.opacity = this.paintAlpha;
      if (this.shape === "round") this.#drawWet();
      else this.#stamp(this.wetCtx, p);
    } else if (this.brush === "spray") {
      this.#sparkle(p);
    } else if (this.#smooth) {
      if (this.brush === "crayon") this.#startCrayon();
      this.#dot(p);
    } else {
      this.#stamp(this.ctx, p);
    }
  }

  #extend(p) {
    const s = this.stroke;
    const dist = Math.hypot(p.x - s.last.x, p.y - s.last.y);
    if (dist < 0.75) return;

    if (this.brush === "smudge") {
      // Smear in small steps, so fast strokes drag paint as far as slow ones.
      const gap = Math.max(1.5, (this.smudge.d / this.dpr) * 0.12);
      let travelled = gap - s.carry;
      while (travelled <= dist) {
        const t = travelled / dist;
        this.smudge.travel += gap;
        this.#smudgeAt({ x: s.last.x + (p.x - s.last.x) * t, y: s.last.y + (p.y - s.last.y) * t });
        travelled += gap;
      }
      s.carry = dist - (travelled - gap);
      s.last = p;
    } else if (this.brush === "paint" && this.shape === "round") {
      this.#travel(dist);
      s.points.push({ ...p, ink: this.inkColor });
      s.last = p;
      this.#drawWet();
    } else if (this.#smooth) {
      const mid = { x: (s.last.x + p.x) / 2, y: (s.last.y + p.y) / 2, pressure: p.pressure };
      s.speed = (s.speed ?? 0) * 0.6 + dist * 0.4; // smoothed, for the crayon's wax
      this.#segment(s.mid, s.last, mid, dist);
      s.mid = mid;
      s.last = p;
    } else {
      // Stamps (or the spray's sparkles) every `gap` px along the way.
      const gap = this.brush === "spray" ? Math.max(this.size * 0.9, 9) * this.sprayFlow.gap : this.stampSize * 1.15;
      const target = this.brush === "paint" ? this.wetCtx : this.ctx;
      let travelled = gap - s.carry;
      while (travelled <= dist) {
        const t = travelled / dist;
        const q = { x: s.last.x + (p.x - s.last.x) * t, y: s.last.y + (p.y - s.last.y) * t, pressure: p.pressure };
        this.#travel(gap);
        if (this.brush === "spray") this.#sparkle(q);
        else this.#stamp(target, q);
        travelled += gap;
      }
      s.carry = dist - (travelled - gap);
      s.last = p;
    }
  }

  #finish() {
    const s = this.stroke;
    if (this.brush === "paint") {
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.globalAlpha = this.paintAlpha;
      this.ctx.drawImage(this.wet, 0, 0);
      this.ctx.restore();
      this.#clearWet();
    } else if (this.#smooth) {
      if (s.mid.x !== s.last.x || s.mid.y !== s.last.y) {
        this.#segment(s.mid, s.mid, s.last, Math.hypot(s.last.x - s.mid.x, s.last.y - s.mid.y));
      }
      if (this.brush === "crayon") this.#endCrayon();
    }
  }

  // -- Marks ----------------------------------------------------------------

  /** Set up `ctx` to draw in the current brush's ink. Call between save() and restore(). */
  #inkUp(ctx) {
    if (this.brush === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = ctx.strokeStyle = "#000";
    } else if (this.brush === "crayon" && ctx !== this.solidCtx) {
      ctx.fillStyle = ctx.strokeStyle = this.#crayonPattern();
    } else {
      ctx.fillStyle = ctx.strokeStyle = this.inkColor;
    }
  }

  /** Where smooth lines go: the picture, or (for a crayon) the stroke's solid layer. */
  get #lineCtx() {
    return this.brush === "crayon" && this.solidCtx ? this.solidCtx : this.ctx;
  }

  #dot(p) {
    const ctx = this.#lineCtx;
    const r = this.#width(p) / 2;
    ctx.save();
    this.#inkUp(ctx);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (ctx === this.solidCtx) {
      this.#waxOver((g) => {
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.fill();
      });
      this.#grainOver(p.x - r, p.y - r, p.x + r, p.y + r);
    }
  }

  /** A smooth piece of line: from `a` toward `b`, bending to `c`. */
  #segment(a, b, c, dist) {
    const ctx = this.#lineCtx;
    this.#travel(dist);
    const width = this.#width(c);
    ctx.save();
    this.#inkUp(ctx);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(b.x, b.y, c.x, c.y);
    ctx.stroke();
    ctx.restore();
    if (ctx === this.solidCtx) {
      this.#waxOver((g) => {
        g.lineCap = g.lineJoin = "round";
        g.lineWidth = width;
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.quadraticCurveTo(b.x, b.y, c.x, c.y);
        g.stroke();
      });
      const pad = width / 2 + 2;
      const xs = [a.x, b.x, c.x], ys = [a.y, b.y, c.y];
      this.#grainOver(Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad);
    }
  }

  // -- Crayon strokes ----------------------------------------------------------
  //
  // A crayon line is drawn in pieces as the finger moves. Each piece is drawn
  // twice, on two hidden layers for this stroke:
  //   solid  its color, opaque (overlapping pieces change nothing there)
  //   dense  how much wax it lays down: dense when the crayon moves slowly,
  //          lighter when it moves fast, kept with "lighten" so where pieces
  //          overlap the heavier one wins (nothing adds up into circles)
  // The grain is then cut in from those two, once per pixel: the lighter the
  // wax, the more specks of paper show through. The child sees that on the
  // wet layer; on lifting, it is laid onto the picture.

  #startCrayon() {
    const fresh = (canvas) =>
      canvas && canvas.width === this.ink.width && canvas.height === this.ink.height
        ? canvas
        : Object.assign(document.createElement("canvas"), { width: this.ink.width, height: this.ink.height });
    this.solid = fresh(this.solid);
    this.dense = fresh(this.dense);
    this.solidCtx = this.solid.getContext("2d", { willReadFrequently: true });
    this.denseCtx = this.dense.getContext("2d", { willReadFrequently: true });
    for (const ctx of [this.solidCtx, this.denseCtx]) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.ink.width, this.ink.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    this.stroke.speed = 0;
    this.#clearWet();
    this.wet.style.opacity = 1;
  }

  #endCrayon() {
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.wet, 0, 0);
    this.ctx.restore();
    this.#clearWet();
    this.solidCtx = this.denseCtx = null; // until the next crayon stroke
  }

  /** How much wax the crayon lays down now, 0-255: full when slow, about a third when fast. */
  get #wax() {
    const speed = this.stroke?.speed ?? 0; // css px moved per pointer event, smoothed
    return Math.round(255 * Math.min(1, Math.max(0.3, 1.15 - speed / 40)));
  }

  /** Draw the same mark on the dense layer: `draw(ctx)` traces it, in the current wax. */
  #waxOver(draw) {
    const ctx = this.denseCtx;
    const wax = this.#wax;
    ctx.save();
    ctx.globalCompositeOperation = "lighten";
    ctx.fillStyle = ctx.strokeStyle = `rgb(${wax} ${wax} ${wax})`;
    draw(ctx);
    ctx.restore();
  }

  /** Paint the stroke into the wet layer over a box (css px): its color, with specks of paper showing through. */
  #grainOver(x0, y0, x1, y1) {
    const d = this.dpr;
    const x = Math.max(0, Math.floor(x0 * d));
    const y = Math.max(0, Math.floor(y0 * d));
    const w = Math.min(this.wet.width, Math.ceil(x1 * d)) - x;
    const h = Math.min(this.wet.height, Math.ceil(y1 * d)) - y;
    if (w <= 0 || h <= 0) return;
    const color = this.solidCtx.getImageData(x, y, w, h).data;
    const wax = this.denseCtx.getImageData(x, y, w, h).data;
    const out = this.wetCtx.createImageData(w, h);
    const px = out.data;
    const { speck, shade } = this.#grain();
    for (let row = 0; row < h; row++) {
      const gy = ((y + row) & 127) * 128;
      for (let col = 0; col < w; col++) {
        const i = (row * w + col) * 4;
        const cover = color[i + 3];
        if (!cover) continue;
        const g = gy + ((x + col) & 127);
        // Specks of paper: about 1 in 20 where the wax is heavy, over half where it is light.
        const holes = 0.05 + 0.58 * (1 - wax[i] / 255);
        const alpha = speck[g] < holes ? 60 + shade[g] * 90 : 205 + shade[g] * 50;
        px[i] = color[i];
        px[i + 1] = color[i + 1];
        px[i + 2] = color[i + 2];
        px[i + 3] = (alpha * cover) / 255;
      }
    }
    this.wetCtx.putImageData(out, x, y);
  }

  /** The grain: for each device pixel of a repeating 128px tile, a chance of being a speck and a shade. */
  #grain() {
    if (this.grainTile) return this.grainTile;
    const n = 128 * 128;
    this.grainTile = { speck: Float32Array.from({ length: n }, Math.random), shade: Float32Array.from({ length: n }, Math.random) };
    return this.grainTile;
  }

  #stamp(ctx, p) {
    ctx.save();
    this.#inkUp(ctx);
    const size = this.stampSize * (0.4 + p.pressure * 1.2);
    const outline = shapeAt(SHAPE_PATH[this.shape], p.x, p.y, size);
    ctx.fill(outline);
    if (this.shape === "flower" && this.brush !== "eraser") {
      const center = flowerCenterOf(this.inkColor);
      ctx.fillStyle = this.brush === "crayon" ? this.#crayonPattern(center) : center;
      ctx.fill(shapeAt(FLOWER_CENTER, p.x, p.y, size));
    }
    if (this.shape !== "round" && this.brush !== "eraser") this.#shapeEdge(ctx, outline, p.x, p.y, size);
    ctx.restore();
  }

  /** Spray: a scatter of the chosen shape (circles, stars, hearts, …) in shades of the color. */
  #sparkle(p) {
    const ctx = this.ctx;
    const [h, s, l] = hexToHsl(this.inkColor);
    const d = SHAPE_PATH[this.shape]; // round sprays circles, like every other shape sprays itself
    ctx.save();
    for (let i = 0; i < this.sprayFlow.count; i++) {
      const spread = this.size * 0.9 + 4;
      const x = p.x + (Math.random() - 0.5) * spread * 2;
      const y = p.y + (Math.random() - 0.5) * spread * 2;
      const size = 6 + this.size * (0.5 + Math.random() * 0.8);
      let color;
      if (s < 15) {
        // Black, gray and white have no hue to vary: stay colorless, in shades near their own.
        const light = l < 25 ? 6 + Math.random() * 26 : l > 85 ? 84 + Math.random() * 16 : 38 + Math.random() * 40;
        color = hslToHex(0, 0, light);
      } else {
        const hue = h + (Math.random() - 0.5) * 50;
        const light = Math.min(75, Math.max(35, l + (Math.random() - 0.3) * 30));
        color = hslToHex(((hue % 360) + 360) % 360, Math.max(s, 60), light);
      }
      const angle = (Math.random() - 0.5) * 0.8;
      const shape = shapeAt(d, x, y, size, angle);
      ctx.fillStyle = color;
      ctx.fill(shape);
      if (this.shape === "flower") {
        ctx.fillStyle = flowerCenterOf(color);
        ctx.fill(shapeAt(FLOWER_CENTER, x, y, size, angle));
      }
      if (this.shape !== "round") this.#shapeEdge(ctx, shape, x, y, size);
    }
    ctx.restore();
  }

  /**
   * A faint middle-gray edge outside a non-round shape, so white ones show on
   * white paper and black ones on black. Cutting the shape out of the scratch
   * canvas keeps the ring outside, even through crayon speckles or see-through paint.
   */
  #shapeEdge(ctx, outline, x, y, size) {
    const d = this.dpr;
    const half = size * 0.6 + 3;
    const x0 = Math.floor((x - half) * d);
    const y0 = Math.floor((y - half) * d);
    const side = Math.ceil(half * 2 * d) + 2;
    const scratch = (this.edgeCanvas ??= document.createElement("canvas"));
    if (scratch.width < side || scratch.height < side) scratch.width = scratch.height = side;
    const g = scratch.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.clearRect(0, 0, side, side);
    g.setTransform(d, 0, 0, d, -x0, -y0);
    g.strokeStyle = "rgba(128, 128, 128, 0.55)";
    g.lineWidth = 2; // half of it falls outside the petals
    g.stroke(outline);
    g.globalCompositeOperation = "destination-out";
    g.fill(outline);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(scratch, 0, 0, side, side, x0, y0, side, side);
    ctx.restore();
  }

  /** How wide the smudge is, in css px. */
  get smudgeSize() {
    return this.size * 1.6 + 8;
  }

  /** Smudge: pick up the paint under the finger to carry along. */
  #smudgeStart(p) {
    const d = Math.max(8, Math.round(this.smudgeSize * this.dpr));
    const canvas = () => Object.assign(document.createElement("canvas"), { width: d, height: d });
    this.smudge = { d, carry: canvas(), tip: canvas(), travel: 0 };
    const x = Math.round(p.x * this.dpr - d / 2);
    const y = Math.round(p.y * this.dpr - d / 2);
    this.smudge.carry.getContext("2d").drawImage(this.ink, x, y, d, d, 0, 0, d, d);
  }

  /** Smudge: lay down a soft round of the carried paint, then pick up some of what is here. */
  #smudgeAt(p) {
    const { d, carry, tip, travel } = this.smudge;
    // Past its reach the smudge has run dry; it tapers over the last third.
    const { reach } = this.smudgePress;
    const left = Number.isFinite(reach) ? Math.min(1, Math.max(0, (reach - travel) / (reach / 3))) : 1;
    if (left <= 0) return;
    const x = Math.round(p.x * this.dpr - d / 2);
    const y = Math.round(p.y * this.dpr - d / 2);

    const t = tip.getContext("2d");
    t.globalCompositeOperation = "copy";
    t.drawImage(carry, 0, 0);
    t.globalCompositeOperation = "destination-in"; // feather the edge
    const edge = t.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
    edge.addColorStop(0, "rgba(0,0,0,1)");
    edge.addColorStop(0.55, "rgba(0,0,0,0.6)");
    edge.addColorStop(1, "rgba(0,0,0,0)");
    t.fillStyle = edge;
    t.fillRect(0, 0, d, d);

    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = this.smudgePress.lay * left;
    ctx.drawImage(tip, x, y);
    ctx.restore();

    // The carried paint thins out as it goes, and mixes with what it passes over.
    const c = carry.getContext("2d");
    c.globalCompositeOperation = "destination-out";
    c.globalAlpha = this.smudgePress.fade;
    c.fillRect(0, 0, d, d);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 0.35;
    c.drawImage(this.ink, x, y, d, d, 0, 0, d, d);
    c.globalAlpha = 1;
  }

  #clearWet() {
    const g = this.wetCtx;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.wet.width, this.wet.height);
    g.restore();
  }

  /** Paint: the whole stroke so far, redrawn on the wet layer. */
  #drawWet() {
    const g = this.wetCtx;
    const pts = this.stroke.points;
    const width = this.size * 1.3;
    this.#clearWet();
    g.save();
    g.fillStyle = g.strokeStyle = g.shadowColor = pts[0].ink;
    g.shadowBlur = width * 0.5 * this.dpr;
    g.lineCap = g.lineJoin = "round";
    g.lineWidth = width;
    g.beginPath();
    if (pts.length === 1) {
      g.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
      g.fill();
    } else if (this.color === "rainbow") {
      // Each piece in the color it was drawn in.
      for (let i = 1; i < pts.length; i++) {
        g.strokeStyle = g.shadowColor = pts[i].ink;
        g.beginPath();
        g.moveTo(pts[i - 1].x, pts[i - 1].y);
        g.lineTo(pts[i].x, pts[i].y);
        g.stroke();
      }
    } else {
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        g.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
      }
      const end = pts[pts.length - 1];
      g.lineTo(end.x, end.y);
      g.stroke();
    }
    g.restore();
  }

  /** The crayon's waxy grain: the color with paper showing through in specks. */
  #crayonPattern(color = this.inkColor) {
    this.patterns ??= new Map();
    if (this.patterns.has(color)) return this.patterns.get(color);
    const size = 128;
    const tile = document.createElement("canvas");
    tile.width = tile.height = size;
    const g = tile.getContext("2d");
    const img = g.createImageData(size, size);
    const [r, gr, b] = hexToRgb(color);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = Math.random();
      img.data[i] = r;
      img.data[i + 1] = gr;
      img.data[i + 2] = b;
      // Mostly solid wax, with a scatter of thin spots where the paper's tooth shows.
      img.data[i + 3] = n < 0.22 ? 70 + Math.random() * 90 : 205 + Math.random() * 50;
    }
    g.putImageData(img, 0, 0);
    const fill = this.ctx.createPattern(tile, "repeat");
    fill.setTransform(new DOMMatrix().scale(1 / this.dpr)); // one grain per device pixel
    if (this.patterns.size > 48) this.patterns.clear();
    this.patterns.set(color, fill);
    return fill;
  }

  // -- Fill -----------------------------------------------------------------

  /** Flood the area under `p` with the current color. False when nothing changed. */
  #fill(p) {
    const W = this.ink.width;
    const H = this.ink.height;
    const x0 = Math.floor(p.x * this.dpr);
    const y0 = Math.floor(p.y * this.dpr);
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return false;

    const ctx = this.ctx;
    const image = ctx.getImageData(0, 0, W, H);
    const px = image.data;
    const start = (y0 * W + x0) * 4;
    const target = [px[start], px[start + 1], px[start + 2], px[start + 3]];
    const [fr, fg, fb] = hexToRgb(this.inkColor);
    this.#travel(45); // the next rainbow fill is another color
    if (target[3] === 255 && Math.abs(target[0] - fr) + Math.abs(target[1] - fg) + Math.abs(target[2] - fb) < 8) return false;

    // Colors compared premultiplied, so every fully clear pixel is the same "paper".
    const ta = target[3] / 255;
    const tr = target[0] * ta, tg = target[1] * ta, tb = target[2] * ta;
    const walls = this.#lineWalls(W, H);
    if (walls?.[y0 * W + x0]) return false; // tapped right on a line
    const same = (i) => {
      if (walls && walls[i >> 2]) return false;
      const a = px[i + 3] / 255;
      return (
        Math.abs(px[i] * a - tr) + Math.abs(px[i + 1] * a - tg) + Math.abs(px[i + 2] * a - tb) + Math.abs(px[i + 3] - target[3]) <=
        96
      );
    };

    const mask = new Uint8Array(W * H);
    const stack = [x0, y0];
    while (stack.length) {
      const y = stack.pop();
      let x = stack.pop();
      while (x > 0 && !mask[y * W + x - 1] && same((y * W + x - 1) * 4)) x--;
      let up = false;
      let down = false;
      for (; x < W; x++) {
        const k = y * W + x;
        if (mask[k] || !same(k * 4)) break;
        mask[k] = 1;
        if (y > 0) {
          const open = !mask[k - W] && same((k - W) * 4);
          if (open && !up) stack.push(x, y - 1);
          up = open;
        }
        if (y < H - 1) {
          const open = !mask[k + W] && same((k + W) * 4);
          if (open && !down) stack.push(x, y + 1);
          down = open;
        }
      }
    }

    // Crayon outline? Then fill with the same waxy grain instead of solid color.
    const speckled = this.#crayonEdged(px, mask, W, H);
    const { speck, shade } = this.#grain();

    // Paint the area, and one pixel past its edge so no pale rim is left
    // against the soft edge of a line.
    for (let y = 0; y < H; y++) {
      const gy = (y & 127) * 128;
      for (let x = 0; x < W; x++) {
        const k = y * W + x;
        const inside = mask[k];
        const near =
          inside || (x > 0 && mask[k - 1]) || (x < W - 1 && mask[k + 1]) || (y > 0 && mask[k - W]) || (y < H - 1 && mask[k + W]);
        if (!near) continue;
        const i = k * 4;
        let alpha = 255;
        if (speckled) {
          const g = gy + (x & 127);
          alpha = speck[g] < 0.2 ? 60 + shade[g] * 90 : 205 + shade[g] * 50;
          if (!inside && px[i + 3] >= alpha) continue; // the rim: don't thin the line itself
        }
        px[i] = fr;
        px[i + 1] = fg;
        px[i + 2] = fb;
        px[i + 3] = alpha;
      }
    }
    ctx.putImageData(image, 0, 0);
    return true;
  }

  /**
   * Is the line around a filled area crayon (grainy wax) rather than smooth?
   * Looks at the drawn pixels in a band a few pixels outside the area: crayon
   * wax jumps in strength from pixel to pixel; marker and paint stay even.
   */
  #crayonEdged(px, mask, W, H) {
    const band = Math.max(5, Math.round(5 * this.dpr));
    const seen = new Uint8Array(W * H);
    let rough = 0;
    let pairs = 0;
    const visit = (x, y) => {
      if (x < 1 || y < 0 || x >= W || y >= H) return;
      const k = y * W + x;
      if (mask[k] || seen[k]) return;
      seen[k] = 1;
      const a = px[k * 4 + 3];
      const b = px[(k - 1) * 4 + 3];
      // Only well-covered pixels: skips a line's soft edge and the crayon's holes,
      // leaving solid ink (even) or crayon wax (uneven, 205-255).
      if (a >= 200 && b >= 200 && !mask[k - 1]) {
        rough += Math.abs(a - b);
        pairs++;
      }
    };
    // Walk the area's edge (sampled, for speed on big fills) and look outward.
    let step = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const k = y * W + x;
        if (!mask[k] || (mask[k - 1] && mask[k + 1] && mask[k - W] && mask[k + W])) continue;
        if (step++ % 3) continue;
        for (let d = 1; d <= band; d++) {
          visit(x - d, y);
          visit(x + d, y);
          visit(x, y - d);
          visit(x, y + d);
        }
      }
    }
    // Crayon wax jumps ~15+ between neighbors; solid ink ~0.
    return pairs > 20 && rough / pairs > 6;
  }
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hexToHsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Hue stops matching the RGB wheel to the painter's (RYB) wheel, where the
// opposites are the ones children learn: red-green, yellow-purple, blue-orange.
const RGB_TO_RYB = [[0, 0], [30, 60], [60, 120], [120, 180], [240, 240], [280, 300], [360, 360]];

function mapHue(hue, from, to) {
  const h = ((hue % 360) + 360) % 360;
  for (let i = 0; i < RGB_TO_RYB.length - 1; i++) {
    const a = RGB_TO_RYB[i];
    const b = RGB_TO_RYB[i + 1];
    if (h >= a[from] && h <= b[from]) return a[to] + ((h - a[from]) / (b[from] - a[from])) * (b[to] - a[to]);
  }
  return h;
}

/** The color opposite `hex` on the painter's color wheel, bright enough to show: purple gives yellow. */
export function complementOf(hex) {
  const [h, s, l] = hexToHsl(hex);
  if (s < 15) return l > 50 ? "#424242" : "#fdd835"; // grays have no opposite: dark middle on white, yellow on black
  const opposite = mapHue(mapHue(h, 0, 1) + 180, 1, 0);
  return hslToHex(opposite, Math.max(s, 90), Math.min(Math.max(l, 52), 60));
}


const CENTER_YELLOW = "#fdd835";
const CENTER_PURPLE = "#7b3fc4";
// How far a flower's middle turns from yellow toward the opposite color (0-1).
const CENTER_TURN = 0.3;

/** A flower's middle: yellow turned partway toward its opposite color (purple when the petals are yellow), kept bright. */
export function flowerCenterOf(hex) {
  const [h, s] = hexToHsl(hex);
  if (s < 15) return CENTER_YELLOW; // gray, black and white flowers: a plain yellow middle, like a daisy
  const yellowPetals = h >= 42 && h <= 70;
  // Start from yellow (purple for yellow petals) and turn the hue a fixed share
  // of the way toward the petals' opposite color: centers stay in the yellow
  // family but range from golden orange to yellow-green.
  const base = yellowPetals ? 270 : 52;
  const [oh] = hexToHsl(complementOf(hex));
  const toward = ((oh - base + 540) % 360) - 180;
  let mh = (base + toward * CENTER_TURN + 360) % 360;
  // Keep yellow centers yellowish: from golden orange to yellow-green, never red or green.
  if (!yellowPetals) mh = Math.min(80, Math.max(28, mh));
  // Too close to the petals to see (orange petals, orange middle)? Plain yellow, then.
  const apart = Math.abs(((mh - h + 540) % 360) - 180);
  if (apart < 25) return CENTER_YELLOW;
  return hslToHex(mh, 90, yellowPetals ? 50 : 55);
}
