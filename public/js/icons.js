// Crayon Box's own icons, registered with Flare UX's icon registry so they
// draw through <fx-icon name="crayon:marker">. Brushes are outlines on the
// 24px grid like Flare's core set; the part in var(--ink) takes the color
// the child has picked. Tip shapes are solid, from shapes.js.

import { registerIconSet } from "@run.time/flare-ux/icons/registry.js";
import { SHAPES } from "./shapes.js";

const INK = 'style="fill:var(--ink, currentColor)"';
const INK_STROKE = 'style="stroke:var(--ink, currentColor)"';

registerIconSet("crayon", {
  viewBox: "0 0 24 24",
  style: "stroke",
  icons: {
    crayon: `<path d="M15.5 2.5l6 6-10.5 10.5-6-6Z"/><path d="M5 13l-2 8 8-2Z" ${INK}/><path d="M11.5 6l5.5 5.5"/><path d="M15.5 2.5l6 6"/>`,
    marker: `<path d="M14 3.5l5.5 5.5-8 8L6 11.5Z"/><path d="M6 11.5 4 16l3 3 4.5-2" ${INK}/><path d="M11.5 6l5.5 5.5"/><path d="M3 21h9" stroke-width="3" ${INK_STROKE}/>`,
    paint: `<path d="M11.5 14.5l8.8-8.8a1.6 1.6 0 0 0-2.3-2.3L9.5 12.2"/><path d="M9.3 12.2l2.5 2.5c0 3.4-3 6.5-8.8 6.8 1.2-1.6.7-4.3 2.4-6.6 1.2-1.6 2.6-2.3 3.9-2.7Z" ${INK}/>`,
    spray: `<rect x="4" y="10" width="9" height="11" rx="2"/><path d="M6 10V7h5v3"/><path d="M4 14h9"/><path d="M8.5 7V4.5h3"/><g stroke="none" ${INK}><circle cx="16" cy="4.5" r="1.1"/><circle cx="19.5" cy="3" r="1.1"/><circle cx="18.5" cy="7" r="1.1"/><circle cx="21.5" cy="9" r="1.1"/><circle cx="16.5" cy="10" r="1.1"/></g>`,
    fill: `<path d="M10.5 3.5 3.3 10.7a1.6 1.6 0 0 0 0 2.2l6.8 6.8a1.6 1.6 0 0 0 2.2 0l6.2-6.2Z"/><path d="M4 12h14.5l-6.2 6.2a1.6 1.6 0 0 1-2.2 0Z" stroke="none" ${INK}/><path d="M3 14.6s1.9 2.5 1.9 3.8a1.9 1.9 0 0 1-3.8 0c0-1.3 1.9-3.8 1.9-3.8Z" stroke="none" ${INK}/>`,
    move: `<path d="M5.5 5.5h13v13h-13Z" ${INK_STROKE}/><path d="M12 5v14M5 12h14"/><g stroke="none" fill="currentColor"><path d="M12 1 15.5 6h-7Z"/><path d="M12 23 8.5 18h7Z"/><path d="M1 12 6 8.5v7Z"/><path d="M23 12 18 15.5v-7Z"/></g>`,
    smudge: `<path d="M13 3.5a1.8 1.8 0 0 1 1.8 1.8v6.2l3.2-.7a1.7 1.7 0 0 1 2 2.1l-1.4 5a3 3 0 0 1-2.9 2.1h-3.6a3 3 0 0 1-2.5-1.3l-3-4.3a1.5 1.5 0 0 1 2.2-2l2.4 1.8V5.3A1.8 1.8 0 0 1 13 3.5Z"/><path d="M2.5 7.5c1.5-1 3-1 4.5 0M2.5 11c1-.6 2-.7 3-.3" stroke-width="2.4" ${INK_STROKE}/>`,
    eraser: `<path d="M9 20.5h11"/><path d="M4.4 14.6 13.8 5.2a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8l-9.3 9.3H9.6l-5.2-5.2a.5.5 0 0 1 0-.7Z"/><path d="M9.2 9.8l6 6"/>`,
    logo: `<path d="M5 9h14v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1Z"/><path d="M7.5 9V5.5L9 3l1.5 2.5V9" style="fill:#e53935;stroke:none"/><path d="M11 9V4.5L12.5 2 14 4.5V9" style="fill:#fdd835;stroke:none"/><path d="M14.5 9V6l1.5-2.5L17.5 6v3" style="fill:#1e88e5;stroke:none"/><path d="M5 13h14"/>`,
  },
});

registerIconSet("shape", {
  viewBox: "-6 -6 112 112",
  style: "fill",
  // The flower's middle shows the opposite of the chosen color, as it draws.
  icons: Object.fromEntries(
    SHAPES.map((s) => [s.id, `<path d="${s.d}"/>` + (s.center ? `<path d="${s.center}" style="fill:var(--ink-opposite, currentColor)"/>` : "")]),
  ),
});
