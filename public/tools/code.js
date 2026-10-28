// Code & SEO: Tailwind ↔ CSS, meta tags (through Statico's {seo} where the
// layouts use it), a cubic-bezier easing editor and a border-radius editor.
// The Tailwind conversion is plain functions, exported for tests.
import { h, parseColor, toHex, round, clamp } from "./kit.js";

// ==== Tailwind ↔ CSS ===========================================================

// Tailwind v3 default palette (MIT), shades 50, 100–900, 950
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const PALETTE_SRC = `slate f8fafc f1f5f9 e2e8f0 cbd5e1 94a3b8 64748b 475569 334155 1e293b 0f172a 020617
gray f9fafb f3f4f6 e5e7eb d1d5db 9ca3af 6b7280 4b5563 374151 1f2937 111827 030712
zinc fafafa f4f4f5 e4e4e7 d4d4d8 a1a1aa 71717a 52525b 3f3f46 27272a 18181b 09090b
neutral fafafa f5f5f5 e5e5e5 d4d4d4 a3a3a3 737373 525252 404040 262626 171717 0a0a0a
stone fafaf9 f5f5f4 e7e5e4 d6d3d1 a8a29e 78716c 57534e 44403c 292524 1c1917 0c0a09
red fef2f2 fee2e2 fecaca fca5a5 f87171 ef4444 dc2626 b91c1c 991b1b 7f1d1d 450a0a
orange fff7ed ffedd5 fed7aa fdba74 fb923c f97316 ea580c c2410c 9a3412 7c2d12 431407
amber fffbeb fef3c7 fde68a fcd34d fbbf24 f59e0b d97706 b45309 92400e 78350f 451a03
yellow fefce8 fef9c3 fef08a fde047 facc15 eab308 ca8a04 a16207 854d0e 713f12 422006
lime f7fee7 ecfccb d9f99d bef264 a3e635 84cc16 65a30d 4d7c0f 3f6212 365314 1a2e05
green f0fdf4 dcfce7 bbf7d0 86efac 4ade80 22c55e 16a34a 15803d 166534 14532d 052e16
emerald ecfdf5 d1fae5 a7f3d0 6ee7b7 34d399 10b981 059669 047857 065f46 064e3b 022c22
teal f0fdfa ccfbf1 99f6e4 5eead4 2dd4bf 14b8a6 0d9488 0f766e 115e59 134e4a 042f2e
cyan ecfeff cffafe a5f3fc 67e8f9 22d3ee 06b6d4 0891b2 0e7490 155e75 164e63 083344
sky f0f9ff e0f2fe bae6fd 7dd3fc 38bdf8 0ea5e9 0284c7 0369a1 075985 0c4a6e 082f49
blue eff6ff dbeafe bfdbfe 93c5fd 60a5fa 3b82f6 2563eb 1d4ed8 1e40af 1e3a8a 172554
indigo eef2ff e0e7ff c7d2fe a5b4fc 818cf8 6366f1 4f46e5 4338ca 3730a3 312e81 1e1b4b
violet f5f3ff ede9fe ddd6fe c4b5fd a78bfa 8b5cf6 7c3aed 6d28d9 5b21b6 4c1d95 2e1065
purple faf5ff f3e8ff e9d5ff d8b4fe c084fc a855f7 9333ea 7e22ce 6b21a8 581c87 3b0764
fuchsia fdf4ff fae8ff f5d0fe f0abfc e879f9 d946ef c026d3 a21caf 86198f 701a75 4a044e
pink fdf2f8 fce7f3 fbcfe8 f9a8d4 f472b6 ec4899 db2777 be185d 9d174d 831843 500724
rose fff1f2 ffe4e6 fecdd3 fda4af fb7185 f43f5e e11d48 be123c 9f1239 881337 4c0519`;
export const PALETTE = { black: "#000000", white: "#ffffff" };
for (const line of PALETTE_SRC.split("\n")) {
  const [name, ...hexes] = line.trim().split(" ");
  hexes.forEach((x, i) => { PALETTE[`${name}-${SHADES[i]}`] = `#${x}`; });
}
const SPECIAL_COLORS = { transparent: "transparent", current: "currentColor", inherit: "inherit" };

const SPACING = { 0: "0px", px: "1px" };
for (const n of [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96]) SPACING[n] = `${n / 4}rem`;
const FRACTIONS = {};
for (const d of [2, 3, 4, 5, 6, 12]) for (let n = 1; n < d; n++) FRACTIONS[`${n}/${d}`] = `${round((n / d) * 100, 6)}%`;
const BREAKPOINTS = { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" };
const TEXT = { xs: ["0.75rem", "1rem"], sm: ["0.875rem", "1.25rem"], base: ["1rem", "1.5rem"], lg: ["1.125rem", "1.75rem"], xl: ["1.25rem", "1.75rem"], "2xl": ["1.5rem", "2rem"], "3xl": ["1.875rem", "2.25rem"], "4xl": ["2.25rem", "2.5rem"], "5xl": ["3rem", "1"], "6xl": ["3.75rem", "1"], "7xl": ["4.5rem", "1"], "8xl": ["6rem", "1"], "9xl": ["8rem", "1"] };
const WEIGHTS = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };
const LEADING = { none: "1", tight: "1.25", snug: "1.375", normal: "1.5", relaxed: "1.625", loose: "2" };
for (const n of [3, 4, 5, 6, 7, 8, 9, 10]) LEADING[n] = `${n / 4}rem`;
const TRACKING = { tighter: "-0.05em", tight: "-0.025em", normal: "0em", wide: "0.025em", wider: "0.05em", widest: "0.1em" };
const RADIUS = { none: "0px", sm: "0.125rem", "": "0.25rem", md: "0.375rem", lg: "0.5rem", xl: "0.75rem", "2xl": "1rem", "3xl": "1.5rem", full: "9999px" };
const SHADOW = { sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)", "": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)", md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)", xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)", "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.25)", inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)", none: "0 0 #0000" };
const MAXW = { none: "none", xs: "20rem", sm: "24rem", md: "28rem", lg: "32rem", xl: "36rem", "2xl": "42rem", "3xl": "48rem", "4xl": "56rem", "5xl": "64rem", "6xl": "72rem", "7xl": "80rem", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", prose: "65ch", "screen-sm": "640px", "screen-md": "768px", "screen-lg": "1024px", "screen-xl": "1280px", "screen-2xl": "1536px" };
const OPACITY = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const EASE = { linear: "linear", in: "cubic-bezier(0.4, 0, 1, 1)", out: "cubic-bezier(0, 0, 0.2, 1)", "in-out": "cubic-bezier(0.4, 0, 0.2, 1)" };
const TRANSITION_FN = "transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms";
const TRANSITIONS = {
  transition: "color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter",
  "transition-colors": "color, background-color, border-color, text-decoration-color, fill, stroke",
  "transition-opacity": "opacity", "transition-shadow": "box-shadow", "transition-transform": "transform", "transition-all": "all",
};

const decls = (str) => str.split(";").map((d) => d.trim()).filter(Boolean).map((d) => { const i = d.indexOf(":"); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; });
const STATIC = {
  block: "display: block", "inline-block": "display: inline-block", inline: "display: inline", flex: "display: flex", "inline-flex": "display: inline-flex", grid: "display: grid", "inline-grid": "display: inline-grid", hidden: "display: none", contents: "display: contents", table: "display: table", "flow-root": "display: flow-root",
  static: "position: static", fixed: "position: fixed", absolute: "position: absolute", relative: "position: relative", sticky: "position: sticky",
  "flex-row": "flex-direction: row", "flex-row-reverse": "flex-direction: row-reverse", "flex-col": "flex-direction: column", "flex-col-reverse": "flex-direction: column-reverse",
  "flex-wrap": "flex-wrap: wrap", "flex-nowrap": "flex-wrap: nowrap", "flex-wrap-reverse": "flex-wrap: wrap-reverse",
  "flex-1": "flex: 1 1 0%", "flex-auto": "flex: 1 1 auto", "flex-initial": "flex: 0 1 auto", "flex-none": "flex: none",
  grow: "flex-grow: 1", "grow-0": "flex-grow: 0", shrink: "flex-shrink: 1", "shrink-0": "flex-shrink: 0",
  "items-start": "align-items: flex-start", "items-end": "align-items: flex-end", "items-center": "align-items: center", "items-baseline": "align-items: baseline", "items-stretch": "align-items: stretch",
  "justify-start": "justify-content: flex-start", "justify-end": "justify-content: flex-end", "justify-center": "justify-content: center", "justify-between": "justify-content: space-between", "justify-around": "justify-content: space-around", "justify-evenly": "justify-content: space-evenly", "justify-stretch": "justify-content: stretch",
  "justify-items-start": "justify-items: start", "justify-items-center": "justify-items: center", "justify-items-end": "justify-items: end", "justify-items-stretch": "justify-items: stretch",
  "content-start": "align-content: flex-start", "content-end": "align-content: flex-end", "content-center": "align-content: center", "content-between": "align-content: space-between", "content-around": "align-content: space-around", "content-evenly": "align-content: space-evenly",
  "self-auto": "align-self: auto", "self-start": "align-self: flex-start", "self-end": "align-self: flex-end", "self-center": "align-self: center", "self-stretch": "align-self: stretch", "self-baseline": "align-self: baseline",
  "place-items-center": "place-items: center", "place-content-center": "place-content: center", "place-self-center": "place-self: center",
  "grid-flow-row": "grid-auto-flow: row", "grid-flow-col": "grid-auto-flow: column", "grid-flow-dense": "grid-auto-flow: dense",
  "col-span-full": "grid-column: 1 / -1", "row-span-full": "grid-row: 1 / -1", "col-auto": "grid-column: auto",
  italic: "font-style: italic", "not-italic": "font-style: normal", uppercase: "text-transform: uppercase", lowercase: "text-transform: lowercase", capitalize: "text-transform: capitalize", "normal-case": "text-transform: none",
  underline: "text-decoration-line: underline", overline: "text-decoration-line: overline", "line-through": "text-decoration-line: line-through", "no-underline": "text-decoration-line: none",
  "text-left": "text-align: left", "text-center": "text-align: center", "text-right": "text-align: right", "text-justify": "text-align: justify", "text-start": "text-align: start", "text-end": "text-align: end",
  truncate: "overflow: hidden; text-overflow: ellipsis; white-space: nowrap", "text-ellipsis": "text-overflow: ellipsis", "text-wrap": "text-wrap: wrap", "text-nowrap": "text-wrap: nowrap", "text-balance": "text-wrap: balance", "text-pretty": "text-wrap: pretty",
  "whitespace-normal": "white-space: normal", "whitespace-nowrap": "white-space: nowrap", "whitespace-pre": "white-space: pre", "whitespace-pre-line": "white-space: pre-line", "whitespace-pre-wrap": "white-space: pre-wrap",
  "break-words": "overflow-wrap: break-word", "break-all": "word-break: break-all", "break-normal": "overflow-wrap: normal; word-break: normal",
  antialiased: "-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale",
  "font-sans": 'font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', "font-serif": 'font-family: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif', "font-mono": 'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  "list-none": "list-style-type: none", "list-disc": "list-style-type: disc", "list-decimal": "list-style-type: decimal", "list-inside": "list-style-position: inside", "list-outside": "list-style-position: outside",
  "border-solid": "border-style: solid", "border-dashed": "border-style: dashed", "border-dotted": "border-style: dotted", "border-double": "border-style: double", "border-none": "border-style: none",
  "object-contain": "object-fit: contain", "object-cover": "object-fit: cover", "object-fill": "object-fit: fill", "object-none": "object-fit: none", "object-center": "object-position: center",
  "aspect-auto": "aspect-ratio: auto", "aspect-square": "aspect-ratio: 1 / 1", "aspect-video": "aspect-ratio: 16 / 9",
  "pointer-events-none": "pointer-events: none", "pointer-events-auto": "pointer-events: auto", "select-none": "user-select: none", "select-text": "user-select: text", "select-all": "user-select: all",
  isolate: "isolation: isolate", visible: "visibility: visible", invisible: "visibility: hidden", collapse: "visibility: collapse",
  "sr-only": "position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0",
  "bg-fixed": "background-attachment: fixed", "bg-cover": "background-size: cover", "bg-contain": "background-size: contain", "bg-center": "background-position: center", "bg-no-repeat": "background-repeat: no-repeat", "bg-repeat": "background-repeat: repeat", "bg-none": "background-image: none",
  "transition-none": "transition-property: none",
  "box-border": "box-sizing: border-box", "box-content": "box-sizing: content-box",
  "float-left": "float: left", "float-right": "float: right", "float-none": "float: none", "clear-both": "clear: both",
  "mx-auto": "margin-left: auto; margin-right: auto",
};
for (const v of ["auto", "hidden", "clip", "visible", "scroll"]) { STATIC[`overflow-${v}`] = `overflow: ${v}`; STATIC[`overflow-x-${v}`] = `overflow-x: ${v}`; STATIC[`overflow-y-${v}`] = `overflow-y: ${v}`; }
for (const v of ["auto", "default", "pointer", "wait", "text", "move", "help", "not-allowed", "none", "progress", "grab", "grabbing", "zoom-in", "zoom-out", "crosshair"]) STATIC[`cursor-${v}`] = `cursor: ${v}`;
for (const [k, v] of Object.entries(TRANSITIONS)) STATIC[k] = `transition-property: ${v}; ${TRANSITION_FN}`;

// An arbitrary value: [..] with _ for spaces
const arb = (v) => (/^\[.+\]$/.test(v) ? v.slice(1, -1).replace(/_/g, " ") : null);
const looksLength = (v) => /^-?[\d.]+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|svh|dvh|lvh)?$|^(calc|clamp|min|max|var)\(/.test(v);

function colorValue(v) {
  let alpha = null;
  const m = v.match(/^(.*)\/(\d+|\[[\d.]+%?\])$/);
  if (m) { v = m[1]; alpha = m[2].startsWith("[") ? m[2].slice(1, -1) : String(Number(m[2]) / 100); if (alpha.endsWith("%")) alpha = String(parseFloat(alpha) / 100); }
  let c = PALETTE[v] ?? SPECIAL_COLORS[v] ?? null;
  const a = arb(v);
  if (c === null && a !== null && (parseColor(a) || /^(var|color-mix)\(/.test(a))) c = a;
  if (c === null) return null;
  if (alpha === null) return c;
  const p = parseColor(c);
  return p ? `rgb(${Math.round(p.r)} ${Math.round(p.g)} ${Math.round(p.b)} / ${round(Number(alpha), 3)})` : `color-mix(in srgb, ${c} ${round(Number(alpha) * 100, 2)}%, transparent)`;
}
const spacing = (v, neg) => {
  const a = arb(v);
  const out = a ?? SPACING[v] ?? (v === "auto" ? "auto" : FRACTIONS[v] ?? (v === "full" ? "100%" : null));
  if (out === null) return null;
  return neg ? (out === "0px" ? "0px" : out === "auto" ? null : `-${out}`) : out;
};
const SIDES = { "": [""], x: ["-left", "-right"], y: ["-top", "-bottom"], t: ["-top"], r: ["-right"], b: ["-bottom"], l: ["-left"], s: ["-inline-start"], e: ["-inline-end"] };
const SIZE_KW = { auto: "auto", full: "100%", min: "min-content", max: "max-content", fit: "fit-content", none: "none" };

// One utility (no variants) → [[property, value], …] or null
export function utilityToCss(cls) {
  if (STATIC[cls]) return decls(STATIC[cls]);
  const neg = cls.startsWith("-");
  const u = neg ? cls.slice(1) : cls;
  let m;
  if ((m = u.match(/^(p|m)([xytrblse]?)-(.+)$/))) {
    const v = spacing(m[3], neg);
    if (v === null || (m[1] === "p" && (neg || m[3] === "auto"))) return null;
    return SIDES[m[2]].map((side) => [`${m[1] === "p" ? "padding" : "margin"}${side}`, v]);
  }
  if ((m = u.match(/^gap(-[xy])?-(.+)$/))) { const v = spacing(m[2]); return v && v !== "auto" ? [[m[1] === "-x" ? "column-gap" : m[1] === "-y" ? "row-gap" : "gap", v]] : null; }
  if ((m = u.match(/^(inset(?:-[xy])?|top|right|bottom|left)-(.+)$/))) {
    const v = spacing(m[2], neg);
    if (v === null) return null;
    const props = { inset: ["inset"], "inset-x": ["left", "right"], "inset-y": ["top", "bottom"] }[m[1]] || [m[1]];
    return props.map((p) => [p, v]);
  }
  if ((m = u.match(/^z-(.+)$/))) { const v = arb(m[1]) ?? (/^\d+$/.test(m[1]) ? m[1] : m[1] === "auto" ? "auto" : null); return v === null ? null : [["z-index", neg ? `-${v}` : v]]; }
  if ((m = u.match(/^order-(.+)$/))) { const v = arb(m[1]) ?? ({ first: "-9999", last: "9999", none: "0" }[m[1]] || (/^\d+$/.test(m[1]) ? m[1] : null)); return v === null ? null : [["order", neg ? `-${v}` : v]]; }
  if (neg) return null;
  if ((m = u.match(/^(w|h|size|min-w|min-h|max-h)-(.+)$/))) {
    const v = m[2];
    const out = arb(v) ?? SPACING[v] ?? FRACTIONS[v] ?? SIZE_KW[v] ?? (v === "screen" ? (m[1].endsWith("w") ? "100vw" : "100vh") : /^(svh|lvh|dvh|svw|lvw|dvw)$/.test(v) ? `100${v}` : null);
    if (out === null || (v === "none" && !m[1].startsWith("max"))) return null;
    const props = { w: ["width"], h: ["height"], size: ["width", "height"], "min-w": ["min-width"], "min-h": ["min-height"], "max-h": ["max-height"] }[m[1]];
    return props.map((p) => [p, out]);
  }
  if ((m = u.match(/^max-w-(.+)$/))) { const out = arb(m[1]) ?? MAXW[m[1]] ?? SPACING[m[1]]; return out ? [["max-width", out]] : null; }
  if ((m = u.match(/^basis-(.+)$/))) { const out = arb(m[1]) ?? SPACING[m[1]] ?? FRACTIONS[m[1]] ?? SIZE_KW[m[1]]; return out ? [["flex-basis", out]] : null; }
  if ((m = u.match(/^grid-(cols|rows)-(.+)$/))) { const out = arb(m[2]) ?? (/^\d+$/.test(m[2]) ? `repeat(${m[2]}, minmax(0, 1fr))` : m[2] === "none" ? "none" : null); return out ? [[`grid-template-${m[1] === "cols" ? "columns" : "rows"}`, out]] : null; }
  if ((m = u.match(/^(col|row)-span-(\d+)$/))) return [[m[1] === "col" ? "grid-column" : "grid-row", `span ${m[2]} / span ${m[2]}`]];
  if ((m = u.match(/^(col|row)-(start|end)-(\d+|auto)$/))) return [[`grid-${m[1] === "col" ? "column" : "row"}-${m[2]}`, m[3]]];
  if ((m = u.match(/^text-(.+)$/))) {
    if (TEXT[m[1]]) return [["font-size", TEXT[m[1]][0]], ["line-height", TEXT[m[1]][1]]];
    const c = colorValue(m[1]);
    if (c) return [["color", c]];
    const a = arb(m[1]);
    return a && looksLength(a) ? [["font-size", a]] : null;
  }
  if ((m = u.match(/^font-(.+)$/))) { const w = WEIGHTS[m[1]] ?? (arb(m[1]) && /^\d+$/.test(arb(m[1])) ? arb(m[1]) : null); return w ? [["font-weight", String(w)]] : null; }
  if ((m = u.match(/^leading-(.+)$/))) { const v = arb(m[1]) ?? LEADING[m[1]]; return v ? [["line-height", v]] : null; }
  if ((m = u.match(/^tracking-(.+)$/))) { const v = arb(m[1]) ?? TRACKING[m[1]]; return v ? [["letter-spacing", v]] : null; }
  if ((m = u.match(/^bg-(.+)$/))) { const c = colorValue(m[1]); if (c) return [["background-color", c]]; const a = arb(m[1]); return a && /^url\(/.test(a) ? [["background-image", a]] : null; }
  if ((m = u.match(/^border(?:-([xytrbl]))?(?:-(.+))?$/))) {
    const side = m[1] || "", v = m[2];
    const sides = { "": [""], x: ["-left", "-right"], y: ["-top", "-bottom"], t: ["-top"], r: ["-right"], b: ["-bottom"], l: ["-left"] }[side];
    if (v === undefined || /^\d+$/.test(v) || (arb(v) && looksLength(arb(v)))) {
      const w = v === undefined ? "1px" : arb(v) ?? `${v}px`;
      return sides.map((s) => [`border${s}-width`, w]);
    }
    const c = colorValue(v);
    return c ? sides.map((s) => [`border${s}-color`, c]) : null;
  }
  if ((m = u.match(/^rounded(?:-(t|r|b|l|tl|tr|br|bl|s|e))?(?:-(.+))?$/))) {
    const v = m[2] === undefined ? RADIUS[""] : arb(m[2]) ?? RADIUS[m[2]];
    if (v === undefined || v === null) return null;
    const corners = { t: ["top-left", "top-right"], r: ["top-right", "bottom-right"], b: ["bottom-right", "bottom-left"], l: ["top-left", "bottom-left"], tl: ["top-left"], tr: ["top-right"], br: ["bottom-right"], bl: ["bottom-left"], s: ["start-start", "end-start"], e: ["start-end", "end-end"] }[m[1]];
    return corners ? corners.map((c) => [`border-${c}-radius`, v]) : [["border-radius", v]];
  }
  if ((m = u.match(/^shadow(?:-(.+))?$/))) { const v = m[1] === undefined ? SHADOW[""] : arb(m[1]) ?? SHADOW[m[1]]; return v ? [["box-shadow", v]] : null; }
  if ((m = u.match(/^opacity-(.+)$/))) { const v = arb(m[1]) ?? (OPACITY.includes(Number(m[1])) ? String(Number(m[1]) / 100) : null); return v ? [["opacity", v]] : null; }
  if ((m = u.match(/^(duration|delay)-(.+)$/))) { const v = arb(m[2]) ?? (/^\d+$/.test(m[2]) ? `${m[2]}ms` : null); return v ? [[`transition-${m[1]}`, v]] : null; }
  if ((m = u.match(/^ease-(.+)$/))) { const v = arb(m[1]) ?? EASE[m[1]]; return v ? [["transition-timing-function", v]] : null; }
  if ((m = u.match(/^aspect-(.+)$/))) { const a = arb(m[1]); return a ? [["aspect-ratio", a.replace("/", " / ")]] : null; }
  if ((m = u.match(/^\[([a-z-]+):(.+)\]$/))) return [[m[1], m[2].replace(/_/g, " ")]];
  return null;
}

const VARIANTS = {
  hover: (s) => `${s}:hover`, focus: (s) => `${s}:focus`, "focus-visible": (s) => `${s}:focus-visible`, "focus-within": (s) => `${s}:focus-within`, active: (s) => `${s}:active`, visited: (s) => `${s}:visited`, disabled: (s) => `${s}:disabled`, checked: (s) => `${s}:checked`,
  first: (s) => `${s}:first-child`, last: (s) => `${s}:last-child`, odd: (s) => `${s}:nth-child(odd)`, even: (s) => `${s}:nth-child(even)`, before: (s) => `${s}::before`, after: (s) => `${s}::after`, placeholder: (s) => `${s}::placeholder`,
  "group-hover": (s) => `.group:hover ${s}`, "group-focus": (s) => `.group:focus ${s}`,
};
const MEDIA = { dark: "(prefers-color-scheme: dark)", "motion-reduce": "(prefers-reduced-motion: reduce)", "motion-safe": "(prefers-reduced-motion: no-preference)", print: "print", portrait: "(orientation: portrait)", landscape: "(orientation: landscape)" };
const splitVariants = (cls) => { const parts = []; let depth = 0, cur = ""; for (const ch of cls) { if (ch === "[") depth++; if (ch === "]") depth--; if (ch === ":" && !depth) { parts.push(cur); cur = ""; } else cur += ch; } parts.push(cur); return parts; };

// "p-4 hover:bg-red-500 md:flex" → { base: [[p, v]], rules: [{ media, selector, decls }], unknown: [] }
export function tailwindToCss(input) {
  const base = [], groups = new Map(), unknown = [];
  for (let cls of input.split(/\s+/).filter(Boolean)) {
    const important = cls.startsWith("!") || cls.endsWith("!");
    cls = cls.replace(/^!|!$/g, "");
    const parts = splitVariants(cls);
    const util = parts.pop();
    let out = utilityToCss(util);
    if (!out || parts.some((v) => !VARIANTS[v] && !MEDIA[v] && !BREAKPOINTS[v] && !/^(min|max)-\[.+\]$/.test(v))) { unknown.push(cls); continue; }
    if (important) out = out.map(([p, v]) => [p, `${v} !important`]);
    if (!parts.length) { base.push(...out); continue; }
    let selector = ".{cls}";
    const media = [];
    for (const v of parts) {
      if (BREAKPOINTS[v]) media.push(`(min-width: ${BREAKPOINTS[v]})`);
      else if (MEDIA[v]) media.push(MEDIA[v]);
      else if (/^min-\[/.test(v)) media.push(`(min-width: ${v.slice(5, -1)})`);
      else if (/^max-\[/.test(v)) media.push(`(max-width: ${v.slice(5, -1)})`);
      else selector = VARIANTS[v](selector);
    }
    const key = `${media.join(" and ")}|${selector}`;
    if (!groups.has(key)) groups.set(key, { media: media.join(" and "), selector, decls: [] });
    groups.get(key).decls.push(...out);
  }
  return { base, rules: [...groups.values()], unknown };
}
export function rulesToCss(rules) {
  return rules.map(({ media, selector, decls: d }) => {
    const body = `${selector} {\n${d.map(([p, v]) => `  ${p}: ${v};`).join("\n")}\n}`;
    return media ? `@media ${media} {\n${body.replace(/^/gm, "  ")}\n}` : body;
  }).join("\n\n");
}

// ---- CSS → Tailwind: index every utility we know by its declarations, with
// shorthands expanded and lengths in px, then cover the input greedily.
const toPx = (v) => v.replace(/(-?[\d.]+)rem\b/g, (_, n) => `${round(parseFloat(n) * 16, 4)}px`).replace(/(^|[\s(,])0(px|rem|em|%)?(?=$|[\s),])/g, (_, pre) => `${pre}0px`);
function normValue(prop, v) {
  v = v.trim().replace(/\s+/g, " ").replace(/\s*!important$/, "").toLowerCase();
  if (/color|^background$|^fill$|^stroke$/.test(prop) && !/^[a-z]+$/.test(v)) { const c = parseColor(v); if (c) return c.a < 1 ? `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)} / ${round(c.a, 3)})` : toHex(c); }
  if (prop === "font-weight") return { normal: "400", bold: "700" }[v] || v;
  return toPx(v).replace(/,\s*/g, ", ");
}
const FOUR = { padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"], margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"], inset: ["top", "right", "bottom", "left"], "border-width": ["border-top-width", "border-right-width", "border-bottom-width", "border-left-width"], "border-color": ["border-top-color", "border-right-color", "border-bottom-color", "border-left-color"], "border-radius": ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"] };
function expand(prop, value) {
  if (prop === "background" && parseColor(value)) return [["background-color", value]];
  if (prop === "gap") { const [r, c = r] = value.split(" "); return [["row-gap", r], ["column-gap", c]]; }
  if (FOUR[prop] && !value.includes("/") && !/\(/.test(value)) {
    const v = value.split(" ");
    const [t, r = t, b = t, l = r] = v;
    return FOUR[prop].map((p, i) => [p, [t, r, b, l][i]]);
  }
  if (prop === "overflow" && value.includes(" ")) { const [x, y] = value.split(" "); return [["overflow-x", x], ["overflow-y", y]]; }
  return [[prop, value]];
}
const keyOf = ([p, v]) => `${p}:${normValue(p, v)}`;
let INDEX = null;
function buildIndex() {
  const names = new Set(Object.keys(STATIC));
  const sp = Object.keys(SPACING).concat(Object.keys(FRACTIONS), ["auto", "full"]);
  for (const k of sp) {
    for (const s of ["", "x", "y", "t", "r", "b", "l"]) { names.add(`p${s}-${k}`); names.add(`m${s}-${k}`); names.add(`-m${s}-${k}`); }
    for (const p of ["gap", "gap-x", "gap-y", "inset", "inset-x", "inset-y", "top", "right", "bottom", "left", "-top", "-right", "-bottom", "-left", "w", "h", "size", "min-w", "min-h", "max-h", "max-w", "basis"]) names.add(`${p}-${k}`);
  }
  for (const k of ["screen", "min", "max", "fit", "svh", "dvh"]) for (const p of ["w", "h", "min-w", "min-h", "max-h"]) names.add(`${p}-${k}`);
  for (const k of Object.keys(MAXW)) names.add(`max-w-${k}`);
  for (let n = 1; n <= 12; n++) { names.add(`grid-cols-${n}`); names.add(`grid-rows-${n}`); names.add(`col-span-${n}`); names.add(`row-span-${n}`); names.add(`order-${n}`); }
  for (const n of [0, 10, 20, 30, 40, 50, "auto"]) names.add(`z-${n}`);
  for (const k of Object.keys(TEXT)) names.add(`text-${k}`);
  for (const k of Object.keys(WEIGHTS)) names.add(`font-${k}`);
  for (const k of Object.keys(LEADING)) names.add(`leading-${k}`);
  for (const k of Object.keys(TRACKING)) names.add(`tracking-${k}`);
  for (const k of Object.keys(RADIUS)) for (const c of ["", "-t", "-r", "-b", "-l", "-tl", "-tr", "-br", "-bl"]) names.add(`rounded${c}${k ? `-${k}` : ""}`);
  for (const k of Object.keys(SHADOW)) names.add(k ? `shadow-${k}` : "shadow");
  for (const n of OPACITY) names.add(`opacity-${n}`);
  for (const n of [75, 100, 150, 200, 300, 500, 700, 1000]) { names.add(`duration-${n}`); names.add(`delay-${n}`); }
  for (const k of Object.keys(EASE)) names.add(`ease-${k}`);
  for (const w of ["", "-0", "-2", "-4", "-8"]) for (const s of ["", "-x", "-y", "-t", "-r", "-b", "-l"]) names.add(`border${s}${w}`);
  for (const c of [...Object.keys(PALETTE), ...Object.keys(SPECIAL_COLORS)]) for (const p of ["text", "bg", "border"]) names.add(`${p}-${c}`);
  const index = [];
  for (const n of names) {
    const d = utilityToCss(n);
    if (!d) continue;
    const keys = d.flatMap(([p, v]) => expand(p, v)).map(keyOf);
    index.push({ cls: n, keys });
    // text-lg sets a line-height too; on its own, a matching font-size still means text-lg
    if (/^text-/.test(n) && keys.length === 2) index.push({ cls: n, keys: [keys[0]], partial: true });
  }
  return index.sort((a, b) => b.keys.length - a.keys.length || a.cls.length - b.cls.length);
}
const ARB = { width: "w", height: "h", "min-width": "min-w", "min-height": "min-h", "max-width": "max-w", "max-height": "max-h", "padding-top": "pt", "padding-right": "pr", "padding-bottom": "pb", "padding-left": "pl", "margin-top": "mt", "margin-right": "mr", "margin-bottom": "mb", "margin-left": "ml", top: "top", right: "right", bottom: "bottom", left: "left", "row-gap": "gap-y", "column-gap": "gap-x", color: "text", "background-color": "bg", "font-size": "text", "font-weight": "font", "line-height": "leading", "letter-spacing": "tracking", "z-index": "z", opacity: "opacity", "border-radius": "rounded", "box-shadow": "shadow", "flex-basis": "basis", "grid-template-columns": "grid-cols", "grid-template-rows": "grid-rows", "transition-duration": "duration", "aspect-ratio": "aspect" };
const arbOf = (v) => `[${v.trim().replace(/\s*\/\s*/g, "/").replace(/\s+/g, "_")}]`;

// "display: flex; padding: 1rem 2rem" → { classes: ["flex", "py-4", "px-8"], unknown: [] }
export function cssToTailwind(input) {
  INDEX ??= buildIndex();
  const body = input.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[^{]*\{|\}[^}]*$/g, "");
  const items = decls(body).filter(([p, v]) => p && v).flatMap(([p, v]) => expand(p.toLowerCase(), v)).map(([p, v], pos) => ({ p, v, pos, key: keyOf([p, v]), important: /!important/.test(v) }));
  const left = new Map(items.map((it) => [it.key, it]));
  const found = []; // [position in the input, class]
  for (const entry of INDEX) {
    if (!entry.keys.every((k) => left.has(k))) continue;
    const its = entry.keys.map((k) => left.get(k));
    entry.keys.forEach((k) => left.delete(k));
    found.push([Math.min(...its.map((i) => i.pos)), its.some((i) => i.important) ? `!${entry.cls}` : entry.cls]);
  }
  const byProp = new Map([...left.values()].map((it) => [it.p, it]));
  const same = (a, b) => byProp.has(a) && byProp.has(b) && normValue(a, byProp.get(a).v) === normValue(b, byProp.get(b).v);
  const take = (props, cls) => { found.push([Math.min(...props.map((p) => byProp.get(p).pos)), cls]); props.forEach((p) => byProp.delete(p)); };
  // Same value on paired sides: px-[13px] rather than pl-[13px] pr-[13px]
  for (const kind of ["padding", "margin"]) {
    const sides = ["top", "right", "bottom", "left"].map((x) => `${kind}-${x}`);
    if (same(sides[0], sides[1]) && same(sides[0], sides[2]) && same(sides[0], sides[3])) take(sides, `${kind[0]}-${arbOf(byProp.get(sides[0]).v)}`);
    if (same(sides[3], sides[1])) take([sides[3], sides[1]], `${kind[0]}x-${arbOf(byProp.get(sides[3]).v)}`);
    if (same(sides[0], sides[2])) take([sides[0], sides[2]], `${kind[0]}y-${arbOf(byProp.get(sides[0]).v)}`);
  }
  const unknown = [];
  for (const it of byProp.values()) {
    const v = it.v.replace(/\s*!important$/, "");
    const bang = it.important ? "!" : "";
    const pre = ARB[it.p] || { "border-color": "border" }[it.p];
    // A palette colour with opacity: text-slate-900/50
    const c = /color$/.test(it.p) && !/^[a-z]+$/.test(v) ? parseColor(v) : null;
    const named = c && c.a < 1 ? Object.entries(PALETTE).find(([, hex]) => hex === toHex({ ...c, a: 1 }))?.[0] : null;
    if (named && pre && Number.isInteger(round(c.a * 100, 4))) { found.push([it.pos, `${bang}${pre}-${named}/${round(c.a * 100)}`]); continue; }
    const neg = /^-/.test(v) && /^(margin|top|right|bottom|left|z-index)/.test(it.p);
    if (pre) found.push([it.pos, `${bang}${neg ? "-" : ""}${pre}-${arbOf(neg ? v.slice(1) : v)}`]);
    else if (/^[a-z-]+$/.test(it.p)) found.push([it.pos, `${bang}[${it.p}:${v.replace(/\s+/g, "_")}]`]);
    else unknown.push(`${it.p}: ${it.v}`);
  }
  return { classes: found.sort((a, b) => a[0] - b[0]).map(([, cls]) => cls), unknown };
}

const tailwind = {
  id: "tailwind",
  name: "Tailwind ↔ CSS",
  group: "Code & SEO",
  blurb: "Turn Tailwind classes into plain CSS you can apply to the selected element, or CSS declarations into Tailwind classes. Variants like hover: and md: become their own rules.",
  keywords: "tailwind utility classes convert",
  render(t) {
    const s = { dir: "tw", tw: "flex items-center gap-4 px-6 py-3 rounded-xl bg-indigo-600 text-white font-semibold shadow-lg hover:bg-indigo-500 md:px-8", css: "display: grid;\ngrid-template-columns: repeat(3, minmax(0, 1fr));\ngap: 1.5rem;\npadding: 16px 32px;\ncolor: #0f172a;\nfont-size: 18px;\nborder-radius: 0.75rem;\nwidth: 37px;" };
    const twBox = t.text(s, "tw", { label: "Tailwind classes", area: true, rows: 5, mono: true });
    const cssBox = t.text(s, "css", { label: "CSS declarations (or a whole rule)", area: true, rows: 9, mono: true });
    const notes = h("p", { class: "tk-note" });
    t.controls(t.seg(s, "dir", [["tw", "Tailwind → CSS"], ["css", "CSS → Tailwind"]], { label: "Direction" }), twBox, cssBox, notes);
    const stage = t.stage();
    const sample = h("div", {}, "Preview");
    stage.append(sample);
    return () => {
      twBox.hidden = s.dir !== "tw"; cssBox.hidden = s.dir !== "css";
      if (s.dir === "tw") {
        const r = tailwindToCss(s.tw);
        const decl = r.base.map(([p, v]) => `${p}: ${v};`).join("\n");
        sample.style.cssText = r.base.map(([p, v]) => `${p}: ${v}`).join(";");
        notes.textContent = r.unknown.length ? `Not converted: ${r.unknown.join(" ")}` : "";
        t.out({ decl: decl || undefined, css: r.rules.length ? rulesToCss(r.rules) : undefined, name: "tw-converted" });
      } else {
        const r = cssToTailwind(s.css);
        sample.style.cssText = decls(s.css.replace(/^[^{]*\{|\}[^}]*$/g, "")).map(([p, v]) => `${p}: ${v}`).join(";");
        notes.textContent = r.unknown.length ? `Not converted: ${r.unknown.join("; ")}` : "";
        t.out({ text: r.classes.join(" "), textLabel: "Classes", tabs: [{ label: "HTML", code: `<div class="${r.classes.join(" ")}"></div>` }] });
      }
    };
  },
};

// ==== Meta tags =================================================================

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const readConfig = (host) => { try { return JSON.parse(host.read("statico.json") ?? host.read("static.json") ?? "{}"); } catch { return {}; } };

const metaTags = {
  id: "meta-tags",
  name: "Meta tags",
  group: "Code & SEO",
  blurb: "Title, description and share image for search results and link previews — edited where Statico reads them, so {seo} writes the tags on every page.",
  keywords: "seo open graph og twitter card social share preview",
  wide: true,
  render(t) {
    const host = t.host;
    const s = {};
    const load = () => {
      const site = host.site(), page = host.page(), cfg = readConfig(host);
      Object.assign(s, {
        siteName: site.name || "", siteDesc: site.description || "", siteImage: site.image || "", twitter: site.twitter || "", language: site.language || "", author: site.author || "",
        url: cfg.build?.url || "", pageTitle: page?.fields.title || "", pageDesc: page?.fields.description || "",
        pageImage: page?.fields.image || page?.fields.cover || "", pageKind: page?.kind || "", pageFile: page?.file || "", path: page?.url || host.previewPath(),
      });
    };
    load();
    const count = (key, ideal, hard) => {
      const out = h("span", { class: "tc-count" });
      const paint = () => { const n = (s[key] || "").length; out.textContent = `${n}/${ideal}`; out.dataset.state = !n ? "" : n > hard ? "bad" : n > ideal ? "warn" : "ok"; };
      t.syncs.push(paint);
      paint();
      return out;
    };
    const withCount = (el, key, ideal, hard) => { el.querySelector(".tk-label").append(count(key, ideal, hard)); el.addEventListener("input", () => t.sync()); return el; };
    const pageGroup = t.group("This page",
      h("p", { class: "tk-note tc-file" }),
      withCount(t.text(s, "pageTitle", { label: "Title" }), "pageTitle", 60, 70),
      withCount(t.text(s, "pageDesc", { label: "Description", area: true, rows: 3 }), "pageDesc", 155, 170),
      t.text(s, "pageImage", { label: "Share image (overrides the site's)", mono: true, placeholder: "/assets/images/cover.jpg" }));
    t.controls(t.row(
      pageGroup,
      t.group("The whole site (statico.json)",
        t.text(s, "siteName", { label: "Site name" }),
        withCount(t.text(s, "siteDesc", { label: "Default description", area: true, rows: 3 }), "siteDesc", 155, 170),
        t.text(s, "siteImage", { label: "Default share image", mono: true, placeholder: "/assets/images/social.jpg" }),
        t.text(s, "url", { label: "Site URL (build.url — makes image and canonical URLs absolute)", mono: true, placeholder: "https://example.com" }),
        t.row(t.text(s, "twitter", { label: "X / Twitter handle", placeholder: "@you" }), t.text(s, "language", { label: "Language", placeholder: "en" })),
        t.text(s, "author", { label: "Author" }))),
      t.button("Reload from the project", () => { load(); t.sync(); t.draw(); }),
    );
    const stage = t.stage({ plain: true, center: false });
    stage.classList.add("tc-previews");
    return () => {
      pageGroup.querySelector(".tc-file").textContent = s.pageFile ? `${s.pageFile} → ${s.path}` : `Nothing built at ${s.path}`;
      const title = s.pageTitle || s.siteName || "Untitled";
      const desc = s.pageDesc || s.siteDesc;
      const img = s.pageImage || s.siteImage;
      const base = s.url.replace(/\/$/, "");
      const abs = (p) => (!p ? "" : /^https?:/.test(p) ? p : base ? `${base}${p.startsWith("/") ? "" : "/"}${p}` : p);
      const shown = (p) => (!p ? "" : /^https?:|^data:/.test(p) ? p : host.previewUrl(p.startsWith("/") ? p : `/${p}`));
      const domain = (base.replace(/^https?:\/\//, "") || "example.com").split("/")[0];
      const pageUrl = `${base || `https://${domain}`}${s.path}`;
      const image = img ? h("div", { class: "tc-img", style: { backgroundImage: `url("${shown(img)}")` } }) : h("div", { class: "tc-img tc-img--none" }, "No share image");
      stage.replaceChildren(
        h("p", { class: "tc-cap" }, "Search result"),
        h("div", { class: "tc-google" }, h("p", { class: "tc-google__site" }, h("span", { class: "tc-google__fav" }, (s.siteName || domain)[0]?.toUpperCase()), h("span", {}, h("b", {}, s.siteName || domain), h("small", {}, pageUrl.replace(/^https?:\/\//, "").replace(/\/$/, "").replace(/\//g, " › ")))), h("p", { class: "tc-google__title" }, title.length > 62 ? `${title.slice(0, 60)}…` : title), h("p", { class: "tc-google__desc" }, desc.length > 158 ? `${desc.slice(0, 155)}…` : desc || "No description: search engines will pick some text from the page.")),
        h("p", { class: "tc-cap" }, "Facebook, LinkedIn"),
        h("div", { class: "tc-og" }, image.cloneNode(true), h("div", { class: "tc-og__body" }, h("small", {}, domain.toUpperCase()), h("b", {}, title), h("span", {}, desc))),
        h("p", { class: "tc-cap" }, "X"),
        h("div", { class: "tc-x" }, image.cloneNode(true), h("span", { class: "tc-x__domain" }, domain), h("p", {}, title)),
        h("p", { class: "tc-cap" }, "Slack, iMessage"),
        h("div", { class: "tc-slack" }, h("b", {}, s.siteName || domain), h("a", {}, title), h("span", {}, desc), img ? h("img", { src: shown(img), alt: "" }) : null),
      );
      const tags = [
        `<title>${esc(title)}</title>`,
        desc && `<meta name="description" content="${esc(desc)}">`,
        base && `<link rel="canonical" href="${esc(pageUrl)}">`,
        `<meta property="og:title" content="${esc(title)}">`,
        desc && `<meta property="og:description" content="${esc(desc)}">`,
        `<meta property="og:type" content="website">`,
        base && `<meta property="og:url" content="${esc(pageUrl)}">`,
        s.siteName && `<meta property="og:site_name" content="${esc(s.siteName)}">`,
        img && `<meta property="og:image" content="${esc(abs(img))}">`,
        s.language && `<meta property="og:locale" content="${esc(s.language.replace("-", "_"))}">`,
        `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">`,
        `<meta name="twitter:title" content="${esc(title)}">`,
        desc && `<meta name="twitter:description" content="${esc(desc)}">`,
        img && `<meta name="twitter:image" content="${esc(abs(img))}">`,
        s.twitter && `<meta name="twitter:site" content="${esc(s.twitter)}">`,
      ].filter(Boolean).join("\n");
      const targets = host.headTargets();
      const usesSeo = targets.some((p) => /\{seo\}/.test(host.read(p) || ""));
      const saveSite = () => {
        try {
          const ok = host.change(() => {
            host.setSite({ name: s.siteName, description: s.siteDesc, image: s.siteImage, twitter: s.twitter, language: s.language, author: s.author });
            const file = host.read("statico.json") !== null ? "statico.json" : host.read("static.json") !== null ? "static.json" : null;
            if (file) {
              const text = host.read(file);
              const d = JSON.parse(text);
              if ((d.build?.url || "") !== s.url) {
                if (s.url) { d.build ??= {}; d.build.url = s.url; } else if (d.build) { delete d.build.url; if (!Object.keys(d.build).length) delete d.build; }
                const ind = text.match(/^\{\s*\n([ \t]+)"/)?.[1] || "  ";
                host.write(file, `${JSON.stringify(d, null, ind)}\n`);
              }
            }
          });
          if (ok) host.notify("Saved the site's details to statico.json");
        } catch (err) { host.notify(err.message, "error"); }
      };
      const savePage = () => {
        try {
          const page = host.page();
          const ok = host.change(() => {
            if (s.pageTitle !== (page.fields.title || "")) host.setPage("title", s.pageTitle);
            if (s.pageDesc !== (page.fields.description || "")) host.setPage("description", s.pageDesc);
            if (s.pageImage !== (page.fields.image || page.fields.cover || "") && s.pageImage) host.setPage("image", s.pageImage);
          });
          if (ok) host.notify(`Saved to ${page.file}`);
        } catch (err) { host.notify(err.message, "error"); }
      };
      const notes = [];
      if (usesSeo) notes.push(`Your layout uses {seo}, so Statico writes these tags itself from statico.json and each page — saving here is all it takes. The tags below are what it will produce.`);
      else if (targets.length) notes.push(`Your layout doesn't use {seo} yet. Adding it lets Statico write these tags for every page from its own title and description.`);
      if (!base) notes.push("Without a site URL, link previews can't load a relative image: most sites need absolute og:image URLs.");
      if (s.pageKind === "layout" && s.pageImage) notes.push("A per-page image on an HTML page is set as an attribute of <layout>; {seo} reads page images from Markdown front matter.");
      t.out({
        html: tags, insert: false,
        tabs: notes.length ? [{ label: "Notes", code: notes.join("\n\n") }] : [],
        actions: [
          { label: "Save to statico.json", primary: usesSeo, run: saveSite },
          { label: "Save to this page", primary: usesSeo, disabled: !s.pageFile || s.pageKind === "html", title: s.pageKind === "html" ? "This page is a whole HTML document" : null, run: savePage },
          !usesSeo && targets.length ? { label: "Add {seo} to the layout", primary: true, run: () => { try { if (host.addToHead("{seo}", "seo")) host.notify(`Added {seo} to ${targets.join(", ")}`); t.draw(); } catch (err) { host.notify(err.message, "error"); } } } : null,
          !usesSeo && targets.length ? { label: "Add these exact tags instead", title: "The same tags on every page that uses the layout", run: () => { try { host.addToHead(tags.split("\n").filter((l) => !l.startsWith("<title>")).join("\n"), "meta"); host.notify("Added the tags to the layout"); } catch (err) { host.notify(err.message, "error"); } } } : null,
        ].filter(Boolean),
      });
    };
  },
  refresh(t) { /* keep the user's unsaved edits; the Reload button picks up changes */ },
};

// ==== Easing curves ==============================================================

const EASINGS = {
  linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], "ease-in": [0.42, 0, 1, 1], "ease-out": [0, 0, 0.58, 1], "ease-in-out": [0.42, 0, 0.58, 1],
  "in-sine": [0.12, 0, 0.39, 0], "out-sine": [0.61, 1, 0.88, 1], "in-out-sine": [0.37, 0, 0.63, 1],
  "in-quad": [0.11, 0, 0.5, 0], "out-quad": [0.5, 1, 0.89, 1], "in-out-quad": [0.45, 0, 0.55, 1],
  "in-cubic": [0.32, 0, 0.67, 0], "out-cubic": [0.33, 1, 0.68, 1], "in-out-cubic": [0.65, 0, 0.35, 1],
  "in-quart": [0.5, 0, 0.75, 0], "out-quart": [0.25, 1, 0.5, 1], "in-out-quart": [0.76, 0, 0.24, 1],
  "in-quint": [0.64, 0, 0.78, 0], "out-quint": [0.22, 1, 0.36, 1], "in-out-quint": [0.83, 0, 0.17, 1],
  "in-expo": [0.7, 0, 0.84, 0], "out-expo": [0.16, 1, 0.3, 1], "in-out-expo": [0.87, 0, 0.13, 1],
  "in-circ": [0.55, 0, 1, 0.45], "out-circ": [0, 0.55, 0.45, 1], "in-out-circ": [0.85, 0, 0.15, 1],
  "in-back": [0.36, 0, 0.66, -0.56], "out-back": [0.34, 1.56, 0.64, 1], "in-out-back": [0.68, -0.6, 0.32, 1.6],
};
const bezier = (b) => `cubic-bezier(${b.map((n) => round(n, 3)).join(", ")})`;

const easing = {
  id: "easing",
  name: "Easing curves",
  group: "Code & SEO",
  blurb: "Shape a cubic-bezier curve by dragging its handles, start from the classic easings, and watch it race a linear one.",
  keywords: "cubic bezier timing function animation transition ease",
  render(t) {
    const s = { x1: 0.16, y1: 1, x2: 0.3, y2: 1, dur: 0.9, name: "out-expo" };
    const W = 240, PAD = 70; // the unit square, with room above and below for overshoot
    const Y = (v) => PAD + (1 - v) * W, X = (v) => 20 + v * W;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W + 40} ${W + 2 * PAD}`);
    svg.setAttribute("class", "tc-curve");
    const ns = (tag, attrs) => { const el = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); svg.append(el); return el; };
    ns("rect", { x: X(0), y: Y(1), width: W, height: W, class: "tc-curve__box" });
    ns("line", { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), class: "tc-curve__diag" });
    const arm1 = ns("line", { class: "tc-curve__arm" }), arm2 = ns("line", { class: "tc-curve__arm" });
    const path = ns("path", { class: "tc-curve__path" });
    const knob1 = ns("circle", { r: 9, class: "tc-curve__knob", tabindex: 0 }), knob2 = ns("circle", { r: 9, class: "tc-curve__knob tc-curve__knob--2", tabindex: 0 });
    const drag = (knob, kx, ky) => knob.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      knob.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const r = svg.getBoundingClientRect(), k = (W + 40) / r.width;
        s[kx] = round(clamp(((ev.clientX - r.left) * k - 20) / W, 0, 1), 2);
        s[ky] = round(clamp(1 - ((ev.clientY - r.top) * k - PAD) / W, -1, 2), 2);
        t.sync(); t.draw();
      };
      knob.addEventListener("pointermove", move);
      knob.addEventListener("pointerup", () => knob.removeEventListener("pointermove", move), { once: true });
    });
    drag(knob1, "x1", "y1"); drag(knob2, "x2", "y2");
    const P = (name, label) => ({ label: label || name, apply: () => { [s.x1, s.y1, s.x2, s.y2] = EASINGS[name]; s.name = name; } });
    t.controls(
      t.presets(["ease", "ease-in", "ease-out", "ease-in-out", "linear"].map((n) => P(n)), { label: "CSS keywords" }),
      t.presets(["sine", "quad", "cubic", "quart", "quint", "expo", "circ", "back"].flatMap((f) => [P(`in-${f}`), P(`out-${f}`), P(`in-out-${f}`)]), { label: "Classic curves" }),
      t.row(t.number(s, "x1", { label: "x1", step: 0.01, min: 0, max: 1 }), t.number(s, "y1", { label: "y1", step: 0.01 }), t.number(s, "x2", { label: "x2", step: 0.01, min: 0, max: 1 }), t.number(s, "y2", { label: "y2", step: 0.01 })),
      t.range(s, "dur", { label: "Duration", min: 0.1, max: 3, step: 0.05, unit: "s" }),
      t.text(s, "name", { label: "Name for the custom property", mono: true }),
    );
    const stage = t.stage({ center: false });
    const lanes = h("div", { class: "tc-lanes" });
    const replay = h("button", { type: "button", class: "tc-replay", onclick: () => lanes.querySelectorAll(".tc-dot").forEach((d) => { d.style.animation = "none"; void d.offsetWidth; d.style.animation = ""; }) }, "Replay");
    stage.append(svg, lanes, replay);
    return () => {
      s.x1 = clamp(s.x1, 0, 1); s.x2 = clamp(s.x2, 0, 1);
      const b = [s.x1, s.y1, s.x2, s.y2];
      path.setAttribute("d", `M${X(0)} ${Y(0)} C${X(s.x1)} ${Y(s.y1)} ${X(s.x2)} ${Y(s.y2)} ${X(1)} ${Y(1)}`);
      arm1.setAttribute("x1", X(0)); arm1.setAttribute("y1", Y(0)); arm1.setAttribute("x2", X(s.x1)); arm1.setAttribute("y2", Y(s.y1));
      arm2.setAttribute("x1", X(1)); arm2.setAttribute("y1", Y(1)); arm2.setAttribute("x2", X(s.x2)); arm2.setAttribute("y2", Y(s.y2));
      knob1.setAttribute("cx", X(s.x1)); knob1.setAttribute("cy", Y(s.y1)); knob2.setAttribute("cx", X(s.x2)); knob2.setAttribute("cy", Y(s.y2));
      lanes.replaceChildren(
        h("div", { class: "tc-lane" }, h("span", {}, "This curve"), h("i", { class: "tc-dot", style: { animation: `tc-run ${s.dur}s ${bezier(b)} infinite alternate` } })),
        h("div", { class: "tc-lane" }, h("span", {}, "Linear"), h("i", { class: "tc-dot tc-dot--ghost", style: { animation: `tc-run ${s.dur}s linear infinite alternate` } })));
      const v = (s.name || "custom").trim().replace(/^-+/, "").replace(/[^\w-]+/g, "-");
      t.out({
        decl: `transition-duration: ${s.dur}s;\ntransition-timing-function: ${bezier(b)};`, name: "eased",
        tabs: [{ label: "Variable", code: `:root {\n  --ease-${v}: ${bezier(b)};\n}` }, { label: "Shorthand", code: `transition: all ${s.dur}s ${bezier(b)};\nanimation-timing-function: ${bezier(b)};` }],
        actions: [{ label: `Add --ease-${v} to :root`, title: "Adds or updates the custom property in the site's stylesheet", disabled: !t.host.defaultCss(), run: () => {
          const file = t.host.defaultCss();
          const begin = `/* tools: easing --ease-${v} */`, end = `/* /tools: easing --ease-${v} */`;
          const block = `${begin}\n:root {\n  --ease-${v}: ${bezier(b)};\n}\n${end}`;
          let text = t.host.read(file) || "";
          const i = text.indexOf(begin), j = i >= 0 ? text.indexOf(end, i) : -1;
          text = i >= 0 && j >= 0 ? text.slice(0, i) + block + text.slice(j + end.length) : `${text.replace(/\s*$/, text.trim() ? "\n\n" : "")}${block}\n`;
          t.host.write(file, text);
          t.host.notify(`Added --ease-${v} to ${file}`);
        } }],
      });
    };
  },
};

// ==== Border radius ==============================================================

const CORNERS = [["tl", "Top left"], ["tr", "Top right"], ["br", "Bottom right"], ["bl", "Bottom left"]];
// Shortest equivalent list: 4 values → 1, 2 or 3 where they repeat
export function shortRadius(v) {
  const [a, b, c, d] = v;
  if (a === b && b === c && c === d) return a;
  if (a === c && b === d) return `${a} ${b}`;
  if (b === d) return `${a} ${b} ${c}`;
  return `${a} ${b} ${c} ${d}`;
}

const radius = {
  id: "radius",
  name: "Radius",
  group: "Code & SEO",
  blurb: "Round corners one at a time or together, or go elliptical with all eight values for organic shapes.",
  keywords: "border radius corners rounded blob pill",
  render(t) {
    const s = { linked: true, all: 16, tl: 16, tr: 16, br: 16, bl: 16, adv: false, tlv: 16, trv: 16, brv: 16, blv: 16, unit: "px" };
    let lastUnit = s.unit;
    const set = (unit, h4, v4) => { s.unit = lastUnit = unit; [s.tl, s.tr, s.br, s.bl] = h4; [s.tlv, s.trv, s.brv, s.blv] = v4 || h4; s.adv = !!v4; s.linked = !v4 && h4.every((x) => x === h4[0]); s.all = h4[0]; };
    const allBox = t.range(s, "all", { label: "All corners", min: 0, max: 200 });
    const cornerBox = t.group("Corners", ...CORNERS.map(([k, label]) => t.range(s, k, { label, min: 0, max: 200 })));
    const vertBox = t.group("Vertical radii (after the slash)", ...CORNERS.map(([k, label]) => t.range(s, `${k}v`, { label, min: 0, max: 200 })));
    t.controls(
      t.presets([
        { label: "Square", apply: () => set("px", [0, 0, 0, 0]) }, { label: "Soft", apply: () => set("px", [6, 6, 6, 6]) }, { label: "Card", apply: () => set("px", [16, 16, 16, 16]) },
        { label: "Pill", apply: () => set("px", [9999, 9999, 9999, 9999]) }, { label: "Circle", apply: () => set("%", [50, 50, 50, 50]) },
        { label: "Tab", apply: () => set("px", [14, 14, 0, 0]) }, { label: "Leaf", apply: () => set("%", [0, 50, 0, 50]) }, { label: "Drop", apply: () => set("%", [50, 50, 50, 0]) },
        { label: "Blob", apply: () => set("%", [30, 70, 70, 30], [30, 30, 70, 70]) }, { label: "Pebble", apply: () => set("%", [63, 37, 54, 46], [55, 48, 52, 45]) }, { label: "Egg", apply: () => set("%", [50, 50, 50, 50], [60, 60, 40, 40]) },
      ]),
      t.seg(s, "unit", ["px", "%", "rem"], { label: "Unit" }),
      t.toggle(s, "linked", { label: "Same radius on every corner" }),
      t.toggle(s, "adv", { label: "Elliptical corners (8 values)" }),
      allBox, cornerBox, vertBox,
    );
    const stage = t.stage();
    const box = h("div", { class: "tc-radius" });
    stage.append(box);
    return () => {
      if (s.unit !== lastUnit) {
        const k = s.unit === "rem" ? (lastUnit === "px" ? 1 / 16 : 0.1) : s.unit === "px" ? (lastUnit === "rem" ? 16 : 2) : lastUnit === "px" ? 0.5 : 10;
        for (const key of ["all", "tl", "tr", "br", "bl", "tlv", "trv", "brv", "blv"]) s[key] = round(Math.min(s[key], 9999) * k, 2);
        lastUnit = s.unit;
        t.sync();
      }
      const max = s.unit === "%" ? 50 : s.unit === "rem" ? 12 : 200;
      const step = s.unit === "rem" ? 0.125 : 1;
      t.slots.controls.querySelectorAll("input[type=range]").forEach((r) => { r.max = max; r.step = step; });
      if (s.linked && !s.adv) { s.tl = s.tr = s.br = s.bl = s.all; }
      allBox.hidden = !s.linked || s.adv;
      cornerBox.hidden = s.linked && !s.adv;
      vertBox.hidden = !s.adv;
      const v = (n) => (n === 0 ? "0" : `${round(n, 3)}${s.unit}`);
      const hs = shortRadius([s.tl, s.tr, s.br, s.bl].map(v));
      const vs = shortRadius([s.tlv, s.trv, s.brv, s.blv].map(v));
      const value = s.adv && vs !== hs ? `${hs} / ${vs}` : hs;
      box.style.borderRadius = value;
      t.out({ decl: `border-radius: ${value};`, name: "rounded" });
    };
  },
};

export const tools = [tailwind, metaTags, easing, radius];

export const styles = `
.tc-count { font-family: var(--mono); font-weight: 500; }
.tc-count[data-state="ok"] { color: var(--ok, green); }
.tc-count[data-state="warn"] { color: var(--warn, orange); }
.tc-count[data-state="bad"] { color: var(--error, red); }
.tc-file { font-family: var(--mono); font-size: 0.78rem; overflow-wrap: anywhere; }
.tc-previews { display: grid; gap: 0.5rem; padding: 1.1rem; background: #f3f3f1; color: #202124; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
.tc-cap { margin: 0.6rem 0 0; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #6b6b6b; }
.tc-cap:first-child { margin-top: 0; }
.tc-google { max-width: 600px; padding: 0.9rem 1rem; background: #fff; border-radius: 10px; }
.tc-google p { margin: 0; }
.tc-google__site { display: flex; gap: 0.6rem; align-items: center; font-size: 13px; }
.tc-google__site span:last-child { display: grid; line-height: 1.25; }
.tc-google__site small { color: #4d5156; font-size: 12px; }
.tc-google__fav { display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #e8eaed; font-size: 12px; font-weight: 700; }
.tc-google__title { margin-top: 0.35rem !important; color: #1a0dab; font-size: 19px; line-height: 1.3; }
.tc-google__desc { color: #4d5156; font-size: 14px; line-height: 1.55; }
.tc-img { aspect-ratio: 1.91 / 1; background: #ddd center / cover no-repeat; }
.tc-img--none { display: grid; place-items: center; color: #888; font-size: 13px; }
.tc-og { max-width: 500px; background: #fff; border: 1px solid #dadde1; }
.tc-og__body { display: grid; gap: 0.15rem; padding: 0.6rem 0.8rem; background: #f2f3f5; }
.tc-og__body small { color: #606770; font-size: 12px; }
.tc-og__body b { font-size: 16px; color: #1d2129; }
.tc-og__body span { color: #606770; font-size: 14px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
.tc-x { position: relative; max-width: 500px; border: 1px solid #cfd9de; border-radius: 16px; overflow: hidden; background: #fff; }
.tc-x .tc-img { border-radius: 0; }
.tc-x__domain { position: absolute; left: 0.75rem; bottom: 2.6rem; padding: 0 0.35rem; border-radius: 4px; background: rgb(0 0 0 / 0.75); color: #fff; font-size: 12px; }
.tc-x p { margin: 0; padding: 0.55rem 0.8rem; font-size: 15px; color: #0f1419; }
.tc-slack { display: grid; gap: 0.15rem; max-width: 460px; padding: 0.2rem 0 0.2rem 0.8rem; border-left: 4px solid #dddddd; font-size: 15px; }
.tc-slack a { color: #1264a3; font-weight: 700; }
.tc-slack span { color: #1d1c1d; }
.tc-slack img { max-width: 360px; max-height: 190px; margin-top: 0.4rem; border-radius: 8px; object-fit: cover; }
.tc-curve { display: block; width: 100%; max-width: 300px; margin: 0 auto; touch-action: none; overflow: visible; }
.tc-curve__box { fill: none; stroke: currentColor; stroke-opacity: 0.15; }
.tc-curve__diag { stroke: currentColor; stroke-opacity: 0.18; stroke-dasharray: 4 4; }
.tc-curve__arm { stroke: currentColor; stroke-opacity: 0.45; stroke-width: 1.5; }
.tc-curve__path { fill: none; stroke: var(--accent); stroke-width: 3.5; stroke-linecap: round; }
.tc-curve__knob { fill: #fff; stroke: currentColor; stroke-width: 2.5; cursor: grab; }
.tc-curve__knob--2 { fill: var(--accent); }
.tc-curve__knob:active { cursor: grabbing; }
.tc-lanes { display: grid; gap: 0.6rem; margin-top: 1rem; }
.tc-lane { position: relative; height: 1.6rem; border-bottom: 1px dashed currentColor; border-color: rgb(128 128 128 / 0.35); }
.tc-lane span { position: absolute; top: -0.2rem; right: 0; font-size: 0.72rem; opacity: 0.6; }
.tc-dot { position: absolute; left: 0; top: 0.2rem; width: 1.1rem; height: 1.1rem; border-radius: 50%; background: var(--accent); }
.tc-dot--ghost { background: currentColor; opacity: 0.35; }
@keyframes tc-run { from { left: 0; } to { left: calc(100% - 1.1rem); } }
.tc-replay { margin-top: 0.8rem; font-size: 0.8rem; }
.tc-radius { width: min(16rem, 80%); aspect-ratio: 4 / 3; background: linear-gradient(135deg, var(--accent), oklch(55% 0.16 300)); box-shadow: 0 10px 30px rgb(0 0 0 / 0.15); }
`;
