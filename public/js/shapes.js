// Brush tip shapes, each drawn in a 100x100 box. The same path is the stamp
// on the paper and the picture on the Shape button.

function flower() {
  const petal = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  let d = "";
  for (let k = 0; k < 6; k++) {
    const a = ((k * 60 - 90) * Math.PI) / 180;
    d += petal(+(50 + 30 * Math.cos(a)).toFixed(2), +(50 + 30 * Math.sin(a)).toFixed(2), 20);
  }
  return d + petal(50, 50, 20);
}

export const SHAPES = [
  { id: "round", label: "Round", d: "M50 0a50 50 0 1 0 0 100a50 50 0 1 0 0-100Z" },
  { id: "square", label: "Square", d: "M6 6h88v88H6Z" },
  { id: "triangle", label: "Triangle", d: "M50 4 97 90H3Z" },
  { id: "star", label: "Star", d: "M50 2 61.8 36H98L68.6 57.6 79.8 93 50 71.2 20.2 93 31.4 57.6 2 36H38.2Z" },
  { id: "heart", label: "Heart", d: "M50 94C14 68 0 46 8 26 15 9 38 6 50 24 62 6 85 9 92 26c8 20-6 42-42 68Z" },
  // The flower's middle is drawn again in the opposite color (see complementOf).
  { id: "flower", label: "Flower", d: flower(), center: "M32 50a18 18 0 1 0 36 0a18 18 0 1 0-36 0Z" },
];

/** The flower's middle, for drawing it in a second color. */
export const FLOWER_CENTER = SHAPES.find((s) => s.id === "flower").center;


const paths = new Map();

/** The shape as a Path2D centered on (x, y), `size` across, turned `angle` radians. */
export function shapeAt(d, x, y, size, angle = 0) {
  if (!paths.has(d)) paths.set(d, new Path2D(d));
  const out = new Path2D();
  out.addPath(paths.get(d), new DOMMatrix().translate(x, y).rotate((angle * 180) / Math.PI).scale(size / 100).translate(-50, -50));
  return out;
}
