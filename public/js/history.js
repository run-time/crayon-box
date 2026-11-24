// Undo and redo for a canvas: a snapshot (a PNG blob) after every stroke.
// Blobs are small for drawings, unlike ImageData at full device size, so
// many steps fit. Restores run one after another, in the order asked.

export class History {
  constructor(canvas, { limit = 150, onChange = () => {} } = {}) {
    this.canvas = canvas;
    this.limit = limit;
    this.onChange = onChange;
    this.states = [];
    this.index = -1;
    this.queue = Promise.resolve();
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.states.length - 1;
  }

  /** Record the canvas as it is now; returns a promise of its blob. */
  push() {
    const snapshot = new Promise((resolve) => this.canvas.toBlob(resolve, "image/png"));
    this.states.length = this.index + 1;
    this.states.push(snapshot);
    if (this.states.length > this.limit) this.states.shift();
    this.index = this.states.length - 1;
    this.onChange();
    return snapshot;
  }

  /** Forget every step; the next push is the first. */
  reset() {
    this.states = [];
    this.index = -1;
    this.onChange();
  }

  undo() {
    if (!this.canUndo) return this.queue;
    return this.#go(this.index - 1);
  }

  redo() {
    if (!this.canRedo) return this.queue;
    return this.#go(this.index + 1);
  }

  /** The newest snapshot's blob, or null before the first. */
  current() {
    return this.states[this.index] ?? Promise.resolve(null);
  }

  #go(index) {
    this.index = index;
    this.onChange();
    const snapshot = this.states[index];
    this.queue = this.queue.then(() => drawBlob(this.canvas, snapshot)).catch(() => {});
    return this.queue;
  }
}

/** Wipe the canvas and draw an image (a blob, or a promise of one) at its top-left, pixel for pixel. */
export async function drawBlob(canvas, blob) {
  const image = await createImageBitmap(await blob);
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
  image.close?.();
}
