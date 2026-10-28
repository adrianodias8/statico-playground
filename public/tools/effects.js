// Effects: shadows, glass, soft UI, shapes, patterns, motion and buttons.
// Each tool previews live and hands the drawer CSS for one element (decl)
// plus any extra rules it needs (:hover states, @keyframes).
import { h, round, clamp, rule, parseColor, toHex, formatColor, mix, readableOn, projectColors } from "./kit.js";

const GROUP = "Effects";
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const px = (n) => (n ? `${round(n, 2)}px` : "0");
const ms = (n) => `${round(n, 0)}ms`;
// A colour at a fraction of its own alpha, as rgb()
function alpha(color, a = 1) {
  const c = parseColor(color);
  return c ? formatColor({ ...c, a: round(c.a * a, 3) }, "rgb") : color;
}
const hexMix = (color, to, t) => toHex(mix(parseColor(color) || WHITE, to, t));

// The site's own colours as preset buttons for one colour control
function sitePalette(t, s, key, label = "Site colours") {
  const cols = projectColors(t.host, 10);
  return cols.length ? t.presets(cols.map((c) => ({ label: c.name, title: `${c.value} in ${c.file}`, swatch: c.value, apply: () => { s[key] = c.value; } })), { label }) : null;
}
// A <style> in the stage, for previews that need :hover or @keyframes
function stageStyle(stage) {
  const el = h("style");
  stage.append(el);
  return el;
}

// ---- Box shadow

const shadowOf = (l) => `${l.inset ? "inset " : ""}${px(l.x)} ${px(l.y)} ${px(l.blur)}${l.spread ? ` ${px(l.spread)}` : ""} ${alpha(l.color, l.opacity / 100)}`;
export const shadowList = (layers) => (layers.length ? layers.map(shadowOf).join(", ") : "none");
const layer = (x, y, blur, spread, opacity, color = "#0f172a", inset = false) => ({ x, y, blur, spread, color, opacity, inset });
export function elevation(n, color = "#0f172a") {
  const y = [1, 2, 4, 8, 16][n - 1];
  return [layer(0, y, y * 2, 0, 8 + n * 2, color), layer(0, Math.max(1, y / 2), y, -Math.floor(y / 4), 6 + n, color)];
}

const shadow = {
  id: "shadow", name: "Shadows", group: GROUP, keywords: "box-shadow elevation depth layered",
  blurb: "Layered box shadows, from a single soft drop to a whole elevation scale.",
  render(t) {
    const s = { layers: [layer(0, 10, 30, -5, 18)], card: "#ffffff", radius: 14, scale: false };
    const set = (list) => () => { s.layers.splice(0, s.layers.length, ...list); };
    t.controls(
      t.presets([
        { label: "Soft", apply: set([layer(0, 10, 30, -5, 18)]) },
        { label: "Crisp", apply: set([layer(0, 1, 2, 0, 12, "#000000"), layer(0, 0, 0, 1, 6, "#000000")]) },
        ...[1, 2, 3, 4, 5].map((n) => ({ label: `Elevation ${n}`, apply: set(elevation(n)) })),
        { label: "Long", apply: set([1, 2, 3, 4, 5, 6].map((i) => layer(i * 4, i * 4, i * 3, 0, 6))) },
      ]),
      t.repeat(s.layers, {
        label: "Add layer", max: 10,
        make: (list) => ({ ...(list.at(-1) || layer(0, 4, 12, 0, 15)) }),
        item: (l) => [
          t.row(t.range(l, "x", { label: "X", min: -100, max: 100, unit: "px" }), t.range(l, "y", { label: "Y", min: -100, max: 100, unit: "px" })),
          t.row(t.range(l, "blur", { label: "Blur", min: 0, max: 200, unit: "px" }), t.range(l, "spread", { label: "Spread", min: -100, max: 100, unit: "px" })),
          t.color(l, "color", { label: "Colour" }),
          t.range(l, "opacity", { label: "Opacity", min: 0, max: 100, unit: "%" }),
          t.toggle(l, "inset", { label: "Inset" }),
        ],
      }),
      t.group("Preview", t.color(s, "card", { label: "Card colour" }), sitePalette(t, s, "card"), t.range(s, "radius", { label: "Radius", min: 0, max: 60, unit: "px" })),
      t.toggle(s, "scale", { label: "Also make an elevation scale (--shadow-1 to --shadow-5)" }),
    );
    const card = h("div", { class: "te-card" });
    t.stage().append(card);
    return () => {
      const value = shadowList(s.layers);
      card.style.boxShadow = value;
      card.style.background = s.card;
      card.style.borderRadius = px(s.radius);
      const color = s.layers[0]?.color || "#0f172a";
      const tabs = s.scale ? [{ label: "Elevation scale", code: `:root {\n${[1, 2, 3, 4, 5].map((n) => `  --shadow-${n}: ${shadowList(elevation(n, color))};`).join("\n")}\n}` }] : [];
      t.out({ decl: `box-shadow: ${value};`, name: "shadow", tabs });
    };
  },
};

// ---- Text shadow

const tLayer = (x, y, blur, color, opacity = 100) => ({ x, y, blur, color, opacity });
const textShadowList = (layers) => (layers.length ? layers.map((l) => `${px(l.x)} ${px(l.y)} ${px(l.blur)} ${alpha(l.color, l.opacity / 100)}`).join(", ") : "none");

const textShadow = {
  id: "text-shadow", name: "Text shadow", group: GROUP, keywords: "glow neon 3d letterpress",
  blurb: "Stack text shadows for glows, extruded 3D type, outlines and letterpress.",
  render(t) {
    const s = { layers: [tLayer(0, 2, 8, "#000000", 25)], text: "Shadow play", color: "#111827", size: 64, withColor: false };
    const set = (color, list) => () => { s.color = color; s.withColor = true; s.layers.splice(0, s.layers.length, ...list); };
    t.controls(
      t.presets([
        { label: "Soft", apply: set("#111827", [tLayer(0, 2, 8, "#000000", 25)]) },
        { label: "Neon", apply: set("#ffffff", [tLayer(0, 0, 4, "#ffffff"), tLayer(0, 0, 10, "#ff2bd6"), tLayer(0, 0, 22, "#ff2bd6"), tLayer(0, 0, 44, "#ff2bd6")]) },
        { label: "Retro 3D", apply: set("#ffd23f", [1, 2, 3, 4, 5].map((i) => tLayer(i, i, 0, i === 5 ? "#1b1b3a" : "#ee4266"))) },
        { label: "Outline", apply: set("#ffffff", [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 2], [2, 0], [0, -2], [-2, 0]].map(([x, y]) => tLayer(x, y, 0, "#111827"))) },
        { label: "Letterpress", apply: set("#5b5f66", [tLayer(0, 1, 0, "#ffffff", 70), tLayer(0, -1, 0, "#000000", 20)]) },
      ]),
      t.text(s, "text", { label: "Sample text" }),
      t.row(t.color(s, "color", { label: "Text colour" }), t.range(s, "size", { label: "Size", min: 16, max: 140, unit: "px" })),
      t.toggle(s, "withColor", { label: "Include the text colour in the CSS" }),
      t.repeat(s.layers, {
        label: "Add layer", max: 16,
        make: (list) => ({ ...(list.at(-1) || tLayer(0, 2, 6, "#000000", 30)) }),
        item: (l) => [
          t.row(t.range(l, "x", { label: "X", min: -40, max: 40, unit: "px" }), t.range(l, "y", { label: "Y", min: -40, max: 40, unit: "px" })),
          t.range(l, "blur", { label: "Blur", min: 0, max: 80, unit: "px" }),
          t.row(t.color(l, "color", { label: "Colour" }), t.range(l, "opacity", { label: "Opacity", min: 0, max: 100, unit: "%" })),
        ],
      }),
    );
    const text = h("p", { class: "te-text" });
    t.stage({ bg: "light" }).append(text);
    return () => {
      const value = textShadowList(s.layers);
      text.textContent = s.text || "Shadow play";
      Object.assign(text.style, { color: s.color, fontSize: px(s.size), textShadow: value });
      t.out({ decl: `${s.withColor ? `color: ${s.color};\n` : ""}text-shadow: ${value};`, name: "text-shadow" });
    };
  },
};

// ---- Glass

const glass = {
  id: "glass", name: "Glassmorphism", group: GROUP, keywords: "frosted glass backdrop-filter blur",
  blurb: "Frosted glass panels: a backdrop blur, a tint and a hairline edge.",
  render(t) {
    const s = { blur: 14, saturate: 160, tint: "#ffffff", opacity: 22, border: 35, radius: 18, shadow: true };
    t.controls(
      t.presets([
        { label: "Clear", apply: () => Object.assign(s, { blur: 8, saturate: 120, tint: "#ffffff", opacity: 10, border: 25 }) },
        { label: "Frosted", apply: () => Object.assign(s, { blur: 18, saturate: 160, tint: "#ffffff", opacity: 28, border: 40 }) },
        { label: "Smoked", apply: () => Object.assign(s, { blur: 16, saturate: 140, tint: "#111827", opacity: 35, border: 12 }) },
      ]),
      t.range(s, "blur", { label: "Blur", min: 0, max: 40, unit: "px" }),
      t.range(s, "saturate", { label: "Saturation", min: 100, max: 250, unit: "%" }),
      t.color(s, "tint", { label: "Tint" }),
      sitePalette(t, s, "tint"),
      t.range(s, "opacity", { label: "Tint opacity", min: 0, max: 100, unit: "%" }),
      t.range(s, "border", { label: "Edge opacity", min: 0, max: 100, unit: "%" }),
      t.range(s, "radius", { label: "Radius", min: 0, max: 48, unit: "px" }),
      t.toggle(s, "shadow", { label: "Drop shadow" }),
    );
    const stage = t.stage({ plain: true });
    stage.classList.add("te-glass-scene");
    const card = h("div", { class: "te-glass-card" }, h("strong", {}, "Frosted"), h("p", {}, "Whatever sits behind this panel shows through, blurred."));
    stage.append(card);
    return () => {
      const filter = `blur(${s.blur}px) saturate(${s.saturate}%)`;
      const decl = [
        `background: ${alpha(s.tint, s.opacity / 100)};`,
        `-webkit-backdrop-filter: ${filter};`,
        `backdrop-filter: ${filter};`,
        `border: 1px solid ${alpha("#ffffff", s.border / 100)};`,
        `border-radius: ${px(s.radius)};`,
        s.shadow ? "box-shadow: 0 8px 32px rgb(0 0 0 / 0.14);" : "",
      ].filter(Boolean).join("\n");
      card.style.cssText = decl;
      card.style.color = readableOn(mix({ r: 246, g: 226, b: 214, a: 1 }, parseColor(s.tint) || WHITE, s.opacity / 100));
      t.out({ decl, name: "glass" });
    };
  },
};

// ---- Neumorphism

const LIGHTS = { "top-left": [1, 1, 145], "top-right": [-1, 1, 225], "bottom-right": [-1, -1, 325], "bottom-left": [1, -1, 45] };
export function neu(o) {
  const base = parseColor(o.base) || WHITE;
  const k = o.intensity / 100;
  const light = toHex(mix(base, WHITE, Math.min(1, k * 3)));
  const dark = toHex(mix(base, BLACK, k));
  const [sx, sy, angle] = LIGHTS[o.light] || LIGHTS["top-left"];
  const dx = sx * o.distance, dy = sy * o.distance;
  const outer = `${px(dx)} ${px(dy)} ${px(o.blur)} ${dark}, ${px(-dx)} ${px(-dy)} ${px(o.blur)} ${light}`;
  const lo = toHex(mix(base, BLACK, k / 3)), hi = toHex(mix(base, WHITE, k / 3));
  const background = o.shape === "concave" ? `linear-gradient(${angle}deg, ${lo}, ${hi})` : o.shape === "convex" ? `linear-gradient(${angle}deg, ${hi}, ${lo})` : toHex(base);
  const shadow = o.shape === "pressed" ? `inset ${px(dx)} ${px(dy)} ${px(o.blur)} ${dark}, inset ${px(-dx)} ${px(-dy)} ${px(o.blur)} ${light}` : outer;
  return { background, shadow };
}

const neumorphism = {
  id: "neumorphism", name: "Neumorphism", group: GROUP, keywords: "soft ui neumorphic",
  blurb: "Soft UI: shapes pressed out of, or into, a surface of the same colour.",
  render(t) {
    const s = { base: "#e3e7ee", size: 160, radius: 32, distance: 14, blur: 28, intensity: 14, shape: "flat", light: "top-left" };
    t.controls(
      t.color(s, "base", { label: "Surface colour" }),
      sitePalette(t, s, "base"),
      t.seg(s, "shape", [["flat", "Flat"], ["concave", "Concave"], ["convex", "Convex"], ["pressed", "Pressed"]], { label: "Shape" }),
      t.select(s, "light", Object.keys(LIGHTS).map((k) => [k, `Light from ${k.replace("-", " ")}`]), { label: "Light" }),
      t.range(s, "distance", { label: "Distance", min: 1, max: 50, unit: "px" }),
      t.range(s, "blur", { label: "Blur", min: 0, max: 100, unit: "px" }),
      t.range(s, "intensity", { label: "Intensity", min: 2, max: 50, unit: "%" }),
      t.row(t.range(s, "size", { label: "Size", min: 40, max: 260, unit: "px" }), t.range(s, "radius", { label: "Radius", min: 0, max: 130, unit: "px" })),
    );
    const stage = t.stage({ plain: true });
    const el = h("div");
    stage.append(el);
    return () => {
      const { background, shadow } = neu(s);
      stage.style.background = s.base;
      el.style.cssText = `width:${s.size}px;height:${s.size}px;border-radius:${s.radius}px;background:${background};box-shadow:${shadow}`;
      t.out({ decl: `border-radius: ${px(s.radius)};\nbackground: ${background};\nbox-shadow: ${shadow};`, name: "soft", tabs: [{ label: "Surface", code: `/* The page or panel behind it */\nbackground: ${toHex(parseColor(s.base) || WHITE)};` }] });
    };
  },
};

// ---- Triangle

const DIRS = ["up", "down", "left", "right", "up-left", "up-right", "down-left", "down-right"];
const CLIPS = {
  up: "50% 0, 100% 100%, 0 100%", down: "0 0, 100% 0, 50% 100%", left: "100% 0, 100% 100%, 0 50%", right: "0 0, 100% 50%, 0 100%",
  "up-left": "0 0, 100% 0, 0 100%", "up-right": "0 0, 100% 0, 100% 100%", "down-left": "0 0, 100% 100%, 0 100%", "down-right": "100% 0, 100% 100%, 0 100%",
};
export function triangleDecl({ dir, w, h: ht, color, method }) {
  if (method === "clip") return `width: ${px(w)};\nheight: ${px(ht)};\nbackground: ${color};\nclip-path: polygon(${CLIPS[dir]});`;
  const t = "solid transparent", c = `solid ${color}`;
  const b = {
    up: [`border-left: ${px(w / 2)} ${t}`, `border-right: ${px(w / 2)} ${t}`, `border-bottom: ${px(ht)} ${c}`],
    down: [`border-left: ${px(w / 2)} ${t}`, `border-right: ${px(w / 2)} ${t}`, `border-top: ${px(ht)} ${c}`],
    left: [`border-top: ${px(ht / 2)} ${t}`, `border-bottom: ${px(ht / 2)} ${t}`, `border-right: ${px(w)} ${c}`],
    right: [`border-top: ${px(ht / 2)} ${t}`, `border-bottom: ${px(ht / 2)} ${t}`, `border-left: ${px(w)} ${c}`],
    "up-left": [`border-top: ${px(ht)} ${c}`, `border-right: ${px(w)} ${t}`],
    "up-right": [`border-top: ${px(ht)} ${c}`, `border-left: ${px(w)} ${t}`],
    "down-left": [`border-bottom: ${px(ht)} ${c}`, `border-right: ${px(w)} ${t}`],
    "down-right": [`border-bottom: ${px(ht)} ${c}`, `border-left: ${px(w)} ${t}`],
  }[dir];
  return ["width: 0", "height: 0", ...b].map((l) => `${l};`).join("\n");
}

const triangle = {
  id: "triangle", name: "Triangle", group: GROUP, keywords: "arrow caret tooltip pointer",
  blurb: "CSS triangles for carets and tooltip arrows, with borders or clip-path.",
  render(t) {
    const s = { dir: "up", w: 80, h: 70, color: "#111827", method: "clip" };
    t.controls(
      t.seg(s, "method", [["clip", "clip-path"], ["border", "Border trick"]], { label: "Method" }),
      t.seg(s, "dir", DIRS.map((d) => [d, { up: "↑", down: "↓", left: "←", right: "→", "up-left": "↖", "up-right": "↗", "down-left": "↙", "down-right": "↘" }[d]]), { label: "Direction" }),
      t.row(t.range(s, "w", { label: "Width", min: 4, max: 240, unit: "px" }), t.range(s, "h", { label: "Height", min: 4, max: 240, unit: "px" })),
      t.color(s, "color", { label: "Colour" }),
      sitePalette(t, s, "color"),
      t.note("The border trick works anywhere, even as a ::before or ::after; clip-path keeps a real box you can give a gradient or image."),
    );
    const el = h("div");
    t.stage().append(el);
    return () => {
      const decl = triangleDecl(s);
      el.style.cssText = decl;
      const pseudo = `/* As a tooltip arrow: give the tooltip position: relative */\n.{cls}-host::after {\n  content: "";\n  position: absolute;\n${decl.split("\n").map((l) => `  ${l}`).join("\n")}\n}`;
      t.out({ decl, name: "triangle", tabs: [{ label: "As ::after", code: pseudo }] });
    };
  },
};

// ---- Clip path

export const CLIP_PRESETS = {
  triangle: [[50, 0], [100, 100], [0, 100]],
  trapezoid: [[20, 0], [80, 0], [100, 100], [0, 100]],
  parallelogram: [[25, 0], [100, 0], [75, 100], [0, 100]],
  rhombus: [[50, 0], [100, 50], [50, 100], [0, 50]],
  pentagon: [[50, 0], [100, 38], [82, 100], [18, 100], [0, 38]],
  hexagon: [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]],
  star: [[50, 0], [61, 35], [98, 35], [68, 57], [79, 91], [50, 70], [21, 91], [32, 57], [2, 35], [39, 35]],
  arrow: [[0, 20], [60, 20], [60, 0], [100, 50], [60, 100], [60, 80], [0, 80]],
  chevron: [[75, 0], [100, 50], [75, 100], [0, 100], [25, 50], [0, 0]],
  message: [[0, 0], [100, 0], [100, 75], [75, 75], [75, 100], [50, 75], [0, 75]],
  cross: [[35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35]],
  frame: [[0, 0], [0, 100], [20, 100], [20, 20], [80, 20], [80, 80], [20, 80], [20, 100], [100, 100], [100, 0]],
};
const pct = (n) => (n ? `${round(n, 1)}%` : "0");
export function clipValue(s) {
  if (s.kind === "circle") return `circle(${pct(s.r)} at ${pct(s.cx)} ${pct(s.cy)})`;
  if (s.kind === "ellipse") return `ellipse(${pct(s.rx)} ${pct(s.ry)} at ${pct(s.cx)} ${pct(s.cy)})`;
  if (s.kind === "inset") return `inset(${pct(s.top)} ${pct(s.right)} ${pct(s.bottom)} ${pct(s.left)}${s.round ? ` round ${px(s.round)}` : ""})`;
  return `polygon(${s.points.map(([x, y]) => `${pct(x)} ${pct(y)}`).join(", ")})`;
}
const IMAGE = /\.(jpe?g|png|webp|avif|gif|svg)$/i;
const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif", svg: "image/svg+xml" };
const blobUrls = new Map();
function imageUrl(host, path) {
  if (!path) return null;
  if (!blobUrls.has(path)) {
    const bytes = host.bytes(path);
    if (!bytes) return null;
    blobUrls.set(path, URL.createObjectURL(new Blob([bytes], { type: MIME[path.split(".").pop().toLowerCase()] || "image/*" })));
  }
  return blobUrls.get(path);
}

const clipPath = {
  id: "clip-path", name: "Clip path", group: GROUP, keywords: "polygon shape mask circle ellipse inset",
  blurb: "Cut elements into shapes. Drag the points on the preview to make your own.",
  render(t) {
    const s = { kind: "polygon", points: CLIP_PRESETS.hexagon.map((p) => [...p]), r: 45, cx: 50, cy: 50, rx: 48, ry: 34, top: 8, right: 8, bottom: 8, left: 8, round: 16, img: "" };
    const images = t.host.files().filter((p) => IMAGE.test(p)).slice(0, 80);
    const poly = (name) => () => { s.kind = "polygon"; s.points = CLIP_PRESETS[name].map((p) => [...p]); };
    const polyGroup = t.group(null,
      t.note("Drag a point to move it; arrow keys nudge the focused point. Double-click a point to remove it."),
      t.button("Add a point", () => {
        let best = 0, len = -1;
        s.points.forEach((p, i) => { const q = s.points[(i + 1) % s.points.length]; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d > len) { len = d; best = i; } });
        const p = s.points[best], q = s.points[(best + 1) % s.points.length];
        s.points.splice(best + 1, 0, [round((p[0] + q[0]) / 2, 1), round((p[1] + q[1]) / 2, 1)]);
        t.draw();
      }));
    const circleGroup = t.group(null, t.range(s, "r", { label: "Radius", min: 0, max: 75, unit: "%" }));
    const ellipseGroup = t.group(null, t.row(t.range(s, "rx", { label: "Radius X", min: 0, max: 75, unit: "%" }), t.range(s, "ry", { label: "Radius Y", min: 0, max: 75, unit: "%" })));
    const centre = t.group(null, t.row(t.range(s, "cx", { label: "Centre X", min: 0, max: 100, unit: "%" }), t.range(s, "cy", { label: "Centre Y", min: 0, max: 100, unit: "%" })), t.note("Or drag the centre point on the preview."));
    const insetGroup = t.group(null,
      t.row(t.range(s, "top", { label: "Top", min: 0, max: 50, unit: "%" }), t.range(s, "right", { label: "Right", min: 0, max: 50, unit: "%" })),
      t.row(t.range(s, "bottom", { label: "Bottom", min: 0, max: 50, unit: "%" }), t.range(s, "left", { label: "Left", min: 0, max: 50, unit: "%" })),
      t.range(s, "round", { label: "Corner radius", min: 0, max: 80, unit: "px" }));
    t.controls(
      t.presets([
        ...Object.keys(CLIP_PRESETS).map((name) => ({ label: name[0].toUpperCase() + name.slice(1), apply: poly(name) })),
        { label: "Circle", apply: () => { s.kind = "circle"; } },
        { label: "Ellipse", apply: () => { s.kind = "ellipse"; } },
        { label: "Inset", apply: () => { s.kind = "inset"; } },
      ], { label: "Shapes" }),
      t.seg(s, "kind", [["polygon", "Polygon"], ["circle", "Circle"], ["ellipse", "Ellipse"], ["inset", "Inset"]], { label: "Kind" }),
      polyGroup, circleGroup, ellipseGroup, centre, insetGroup,
      images.length ? t.select(s, "img", [["", "A gradient"], ...images], { label: "Preview with" }) : null,
    );
    const ghost = h("div", { class: "te-clip__ghost" });
    const shape = h("div", { class: "te-clip__shape" });
    const pins = h("div", { class: "te-clip__pins" });
    const box = h("div", { class: "te-clip" }, ghost, shape, pins);
    t.stage().append(box);
    let pinKey = "";
    let drag = null;
    const toPct = (e) => { const r = box.getBoundingClientRect(); return [clamp(round(((e.clientX - r.left) / r.width) * 100, 1), 0, 100), clamp(round(((e.clientY - r.top) / r.height) * 100, 1), 0, 100)]; };
    const move = (i, [x, y]) => { if (s.kind === "polygon") s.points[i] = [x, y]; else { s.cx = x; s.cy = y; } };
    const at = (i) => (s.kind === "polygon" ? s.points[i] : [s.cx, s.cy]);
    function pin(i) {
      const el = h("button", { type: "button", class: "te-clip__pt", "aria-label": s.kind === "polygon" ? `Point ${i + 1}` : "Centre" });
      el.addEventListener("pointerdown", (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.focus(); drag = i; });
      el.addEventListener("pointermove", (e) => { if (drag !== i) return; move(i, toPct(e)); t.sync(); t.draw(); });
      el.addEventListener("pointerup", () => { drag = null; });
      el.addEventListener("dblclick", () => { if (s.kind === "polygon" && s.points.length > 3) { s.points.splice(i, 1); t.draw(); } });
      el.addEventListener("keydown", (e) => {
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!d) return;
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const [x, y] = at(i);
        move(i, [clamp(round(x + d[0] * step, 1), 0, 100), clamp(round(y + d[1] * step, 1), 0, 100)]);
        t.sync(); t.draw();
      });
      return el;
    }
    return () => {
      polyGroup.hidden = s.kind !== "polygon";
      circleGroup.hidden = s.kind !== "circle";
      ellipseGroup.hidden = s.kind !== "ellipse";
      centre.hidden = !(s.kind === "circle" || s.kind === "ellipse");
      insetGroup.hidden = s.kind !== "inset";
      const url = imageUrl(t.host, s.img);
      const bg = url ? `center / cover no-repeat url("${url}")` : "linear-gradient(135deg, #ff7a59, #7b61ff 55%, #2ec5ff)";
      ghost.style.background = bg;
      shape.style.background = bg;
      const value = clipValue(s);
      shape.style.clipPath = value;
      const n = s.kind === "polygon" ? s.points.length : s.kind === "inset" ? 0 : 1;
      if (pinKey !== `${s.kind}:${n}`) { pinKey = `${s.kind}:${n}`; pins.replaceChildren(...Array.from({ length: n }, (_, i) => pin(i))); }
      [...pins.children].forEach((el, i) => { const [x, y] = at(i); el.style.left = `${x}%`; el.style.top = `${y}%`; });
      t.out({ decl: `clip-path: ${value};`, name: "clipped" });
    };
  },
};

// ---- Blob

// mulberry32: a small seeded random generator, so a seed always gives the same blob
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export function blobPoints(n, randomness, seed, size) {
  const rand = rng(seed);
  const c = size / 2, base = size * 0.46, k = randomness / 100;
  return Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 + (rand() - 0.5) * k * (Math.PI / n);
    const r = base * (1 - rand() * k * 0.55);
    return [c + Math.cos(angle) * r, c + Math.sin(angle) * r];
  });
}
// A smooth closed curve through the points: Catmull-Rom turned into cubic Béziers
export function smoothPath(pts) {
  const n = pts.length;
  const f = ([x, y]) => `${round(x, 1)},${round(y, 1)}`;
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1)} ${f(c2)} ${f(p2)}`;
  }
  return `${d}Z`;
}
export function blobSvg({ d, size, color, color2, gradient, id = "blob" }) {
  const fill = gradient ? `url(#${id}-fill)` : color;
  const defs = gradient ? `<defs><linearGradient id="${id}-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color2}"/></linearGradient></defs>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${defs}<path fill="${fill}" d="${d}"/></svg>`;
}

const blob = {
  id: "blob", name: "Blobs", group: GROUP, keywords: "organic shape svg random",
  blurb: "Organic blob shapes from a seed: as SVG, an inline image or a clip-path.",
  render(t) {
    const s = { points: 7, randomness: 60, seed: 2718, size: 320, color: "#7b61ff", color2: "#2ec5ff", gradient: true };
    t.controls(
      t.row(t.range(s, "points", { label: "Points", min: 3, max: 14 }), t.range(s, "randomness", { label: "Randomness", min: 0, max: 100, unit: "%" })),
      t.row(t.number(s, "seed", { label: "Seed", step: 1 }), h("div", { class: "tk-field te-end" }, t.button("Shuffle", () => { s.seed = Math.floor(Math.random() * 100000); t.sync(); t.draw(); }))),
      t.range(s, "size", { label: "Size", min: 40, max: 800, unit: "px" }),
      t.color(s, "color", { label: "Colour" }),
      sitePalette(t, s, "color"),
      t.toggle(s, "gradient", { label: "Gradient" }),
      t.color(s, "color2", { label: "Second colour" }),
    );
    const holder = h("div", { class: "te-blob" });
    t.stage().append(holder);
    let svg = "";
    return () => {
      const d = smoothPath(blobPoints(s.points, s.randomness, s.seed, s.size));
      svg = blobSvg({ d, size: s.size, color: s.color, color2: s.color2, gradient: s.gradient, id: `blob-${s.seed}` });
      holder.innerHTML = svg;
      const bg = s.gradient ? `linear-gradient(135deg, ${s.color}, ${s.color2})` : s.color;
      t.out({
        decl: `width: ${px(s.size)};\nheight: ${px(s.size)};\nbackground: ${bg};\nclip-path: path("${d}");`,
        name: "blob",
        html: svg,
        tabs: [{ label: "SVG file", code: `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n` }],
        actions: [{
          label: "Save as SVG in assets/images",
          run: () => {
            const all = new Set(t.host.files());
            let path = `assets/images/blob-${s.seed}.svg`;
            for (let n = 2; all.has(path); n++) path = `assets/images/blob-${s.seed}-${n}.svg`;
            t.host.write(path, `${svg}\n`);
            t.host.notify(`Saved ${path}; use it as <img src="/${path}">`, "ok");
          },
        }],
      });
    };
  },
};

// ---- Patterns

export const PATTERNS = {
  stripes: "Stripes", diagonal: "Diagonal stripes", polka: "Polka dots", checkerboard: "Checkerboard", grid: "Grid",
  crosshatch: "Cross-hatch", zigzag: "Zigzag", triangles: "Triangles", waves: "Waves", isometric: "Isometric",
};
// { images: [...], size?, position? } for one pattern
export function patternLayers(kind, { fg, bg, size: sz, thick: th }) {
  const half = round(sz / 2, 2), q = round(sz / 4, 2);
  switch (kind) {
    case "stripes": return { images: [`repeating-linear-gradient(0deg, ${fg} 0 ${th}px, transparent ${th}px ${sz}px)`] };
    case "diagonal": return { images: [`repeating-linear-gradient(45deg, ${fg} 0 ${th}px, transparent ${th}px ${sz}px)`] };
    case "polka": { const dot = `radial-gradient(circle, ${fg} ${th}px, transparent ${round(th + 0.6, 2)}px)`; return { images: [dot, dot], size: `${sz}px ${sz}px`, position: `0 0, ${half}px ${half}px` }; }
    case "checkerboard": return { images: [`repeating-conic-gradient(${fg} 0 25%, transparent 0 50%)`], size: `${sz}px ${sz}px` };
    case "grid": return { images: [`linear-gradient(${fg} ${th}px, transparent ${th}px)`, `linear-gradient(90deg, ${fg} ${th}px, transparent ${th}px)`], size: `${sz}px ${sz}px` };
    case "crosshatch": return { images: [`repeating-linear-gradient(45deg, ${fg} 0 ${th}px, transparent ${th}px ${sz}px)`, `repeating-linear-gradient(-45deg, ${fg} 0 ${th}px, transparent ${th}px ${sz}px)`] };
    case "zigzag": return {
      images: [135, 225, 315, 45].map((a) => `linear-gradient(${a}deg, ${fg} 25%, transparent 25%)`),
      size: `${sz}px ${sz}px`, position: `-${half}px 0, -${half}px 0, 0 0, 0 0`,
    };
    case "triangles": return { images: [`conic-gradient(from 150deg at 50% 25%, ${fg} 0 60deg, transparent 0)`], size: `${sz}px ${sz}px` };
    case "waves": { const r = half, arc = `radial-gradient(circle at 50% 100%, transparent ${round(r - th, 2)}px, ${fg} ${round(r - th, 2)}px ${r}px, transparent ${r}px)`; return { images: [arc, arc], size: `${sz}px ${half}px`, position: `0 0, ${half}px ${q}px` }; }
    case "isometric": {
      const fg2 = toHex(mix(parseColor(fg) || BLACK, parseColor(bg) || WHITE, 0.5));
      const line = (a, c) => `linear-gradient(${a}deg, ${c} 12%, transparent 12.5%, transparent 87%, ${c} 87.5%, ${c})`;
      const face = `linear-gradient(60deg, ${fg2} 25%, transparent 25.5%, transparent 75%, ${fg2} 75%, ${fg2})`;
      const h2 = round(sz * 1.75, 2), off = `${half}px ${round(sz * 0.875, 2)}px`;
      return { images: [line(30, fg), line(150, fg), line(30, fg), line(150, fg), face, face], size: `${sz}px ${h2}px`, position: `0 0, 0 0, ${off}, ${off}, 0 0, ${off}` };
    }
    default: return { images: [] };
  }
}
export function patternDecl(kind, o) {
  const L = patternLayers(kind, o);
  return [`background-color: ${o.bg};`, `background-image: ${L.images.join(", ")};`, L.size ? `background-size: ${L.size};` : "", L.position ? `background-position: ${L.position};` : ""].filter(Boolean).join("\n");
}

const pattern = {
  id: "pattern", name: "Patterns", group: GROUP, keywords: "background stripes dots checkerboard grid zigzag",
  blurb: "Background patterns made of gradients alone: no images to load.",
  render(t) {
    const s = { kind: "diagonal", fg: "#1f2937", bg: "#f8fafc", size: 24, thick: 4, opacity: 100 };
    t.controls(
      t.select(s, "kind", Object.entries(PATTERNS), { label: "Pattern" }),
      t.row(t.color(s, "fg", { label: "Ink" }), t.color(s, "bg", { label: "Ground" })),
      sitePalette(t, s, "fg", "Site colours for the ink"),
      t.range(s, "opacity", { label: "Ink opacity", min: 5, max: 100, unit: "%" }),
      t.range(s, "size", { label: "Size", min: 4, max: 160, unit: "px" }),
      t.range(s, "thick", { label: "Line or dot size", min: 1, max: 40, unit: "px" }),
    );
    const swatch = h("div", { class: "te-pattern" });
    t.stage({ plain: true, center: false }).append(swatch);
    return () => {
      const decl = patternDecl(s.kind, { fg: alpha(s.fg, s.opacity / 100), bg: s.bg, size: s.size, thick: s.thick });
      swatch.style.cssText = decl;
      t.out({ decl, name: `pattern-${s.kind}` });
    };
  },
};

// ---- Text stroke

export const strokeShadow = (w, color, steps = 16) => Array.from({ length: steps }, (_, i) => { const a = (i / steps) * Math.PI * 2; return `${round(Math.cos(a) * w, 2)}px ${round(Math.sin(a) * w, 2)}px 0 ${color}`; }).join(", ");

const textStroke = {
  id: "text-stroke", name: "Text stroke", group: GROUP, keywords: "outline text hollow",
  blurb: "Outlined and hollow type with -webkit-text-stroke, plus a text-shadow fallback.",
  render(t) {
    const s = { text: "Outline", size: 96, weight: 800, width: 2, stroke: "#111827", fill: "#ffd23f", hollow: true, behind: false };
    t.controls(
      t.text(s, "text", { label: "Sample text" }),
      t.row(t.range(s, "size", { label: "Size", min: 16, max: 180, unit: "px" }), t.range(s, "weight", { label: "Weight", min: 100, max: 900, step: 100 })),
      t.range(s, "width", { label: "Stroke width", min: 0.5, max: 12, step: 0.5, unit: "px" }),
      t.color(s, "stroke", { label: "Stroke colour" }),
      sitePalette(t, s, "stroke"),
      t.toggle(s, "hollow", { label: "Hollow (no fill)" }),
      t.color(s, "fill", { label: "Fill colour" }),
      t.toggle(s, "behind", { label: "Stroke behind the fill (keeps letter shapes crisp)" }),
    );
    const text = h("p", { class: "te-text" });
    t.stage().append(text);
    return () => {
      const width = s.behind ? s.width * 2 : s.width;
      const decl = [`-webkit-text-stroke: ${px(width)} ${s.stroke};`, `color: ${s.hollow ? "transparent" : s.fill};`, s.behind && !s.hollow ? "paint-order: stroke fill;" : ""].filter(Boolean).join("\n");
      text.textContent = s.text || "Outline";
      text.style.cssText = `${decl}font-size:${s.size}px;font-weight:${s.weight}`;
      const fallback = `color: ${s.hollow ? "var(--background, #fff)" : s.fill};\ntext-shadow: ${strokeShadow(s.width, s.stroke)};`;
      t.out({ decl, name: "outlined", tabs: [{ label: "text-shadow fallback", code: `/* Older browsers, or when the stroke should sit outside the letters */\n${rule(".{cls}", fallback)}` }] });
    };
  },
};

// ---- Easings shared by transition and animation

export const EASINGS = [
  ["ease", "ease"], ["linear", "linear"], ["ease-in", "ease-in"], ["ease-out", "ease-out"], ["ease-in-out", "ease-in-out"],
  ["cubic-bezier(0.25, 1, 0.5, 1)", "Out quart"], ["cubic-bezier(0.16, 1, 0.3, 1)", "Out expo"], ["cubic-bezier(0.34, 1.56, 0.64, 1)", "Out back"],
  ["cubic-bezier(0.68, -0.6, 0.32, 1.6)", "In-out back"], ["cubic-bezier(0.65, 0, 0.35, 1)", "In-out cubic"], ["steps(4, end)", "Steps (4)"],
];

// ---- Transition

const PROPS = ["transform", "opacity", "background-color", "color", "box-shadow", "border-color", "all"];
const transition = {
  id: "transition", name: "Transitions", group: GROUP, keywords: "hover animate ease duration",
  blurb: "Transitions for one or more properties, with the hover state they animate to.",
  render(t) {
    const s = {
      list: [{ prop: "transform", dur: 250, ease: "cubic-bezier(0.25, 1, 0.5, 1)", delay: 0 }, { prop: "box-shadow", dur: 250, ease: "ease-out", delay: 0 }],
      lift: 4, scale: 100, from: "#ffffff", to: "#ffffff", shadow: true, opacity: 100,
    };
    t.controls(
      t.repeat(s.list, {
        label: "Add property", max: 7,
        make: (list) => ({ ...(list.at(-1) || { dur: 250, ease: "ease", delay: 0 }), prop: PROPS.find((p) => !list.some((x) => x.prop === p)) || "all" }),
        item: (x) => [
          t.select(x, "prop", PROPS, { label: "Property" }),
          t.row(t.range(x, "dur", { label: "Duration", min: 0, max: 2000, step: 10, unit: "ms" }), t.range(x, "delay", { label: "Delay", min: 0, max: 1500, step: 10, unit: "ms" })),
          t.select(x, "ease", EASINGS, { label: "Easing" }),
        ],
      }),
      t.group("On hover",
        t.row(t.range(s, "lift", { label: "Lift", min: -20, max: 20, unit: "px" }), t.range(s, "scale", { label: "Scale", min: 80, max: 130, unit: "%" })),
        t.row(t.color(s, "from", { label: "Colour" }), t.color(s, "to", { label: "Hover colour" })),
        t.range(s, "opacity", { label: "Opacity", min: 0, max: 100, unit: "%" }),
        t.toggle(s, "shadow", { label: "Shadow on hover" })),
    );
    const stage = t.stage();
    const style = stageStyle(stage);
    const demo = h("button", { type: "button", class: "te-demo te-tr-demo", onclick: () => demo.classList.toggle("is-on") }, "Hover or click me");
    stage.append(demo);
    return () => {
      const decl = `transition: ${s.list.map((x) => `${x.prop} ${ms(x.dur)} ${x.ease}${x.delay ? ` ${ms(x.delay)}` : ""}`).join(", ")};`;
      const transform = [s.lift ? `translateY(${-s.lift}px)` : "", s.scale !== 100 ? `scale(${round(s.scale / 100, 2)})` : ""].filter(Boolean).join(" ");
      const hover = [transform ? `transform: ${transform};` : "", s.to !== s.from ? `background-color: ${s.to};` : "", s.shadow ? "box-shadow: 0 12px 28px -8px rgb(0 0 0 / 0.25);" : "", s.opacity < 100 ? `opacity: ${round(s.opacity / 100, 2)};` : ""].filter(Boolean).join("\n");
      const css = `${hover ? `${rule(".{cls}:hover,\n.{cls}:focus-visible", hover)}\n\n` : ""}@media (prefers-reduced-motion: reduce) {\n  .{cls} { transition: none; }\n}`;
      style.textContent = `${rule(".te-tr-demo", `${decl}\nbackground-color: ${s.from};`)}\n${hover ? rule(".te-tr-demo:hover, .te-tr-demo.is-on", hover) : ""}`;
      t.out({ decl, css, name: "lift" });
    };
  },
};

// ---- Animation

export const KEYFRAMES = {
  "fade-in": { css: "from { opacity: 0; }\nto { opacity: 1; }", dur: 500, ease: "ease-out" },
  "slide-up": { css: "from { opacity: 0; transform: translateY(24px); }\nto { opacity: 1; transform: none; }", dur: 600, ease: "cubic-bezier(0.16, 1, 0.3, 1)" },
  "scale-in": { css: "from { opacity: 0; transform: scale(0.85); }\nto { opacity: 1; transform: none; }", dur: 450, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
  bounce: { css: "0%, 50%, 80%, 100% { transform: translateY(0); }\n30% { transform: translateY(-28px); }\n65% { transform: translateY(-10px); }\n90% { transform: translateY(-3px); }", dur: 1000, ease: "ease-out" },
  shake: { css: "0%, 100% { transform: translateX(0); }\n15%, 45%, 75% { transform: translateX(-8px); }\n30%, 60%, 90% { transform: translateX(8px); }", dur: 600, ease: "ease-in-out" },
  pulse: { css: "0%, 100% { transform: scale(1); }\n50% { transform: scale(1.06); }", dur: 1400, ease: "ease-in-out", infinite: true },
  spin: { css: "to { transform: rotate(360deg); }", dur: 1000, ease: "linear", infinite: true },
  wiggle: { css: "0%, 100% { transform: rotate(0); }\n25% { transform: rotate(-6deg); }\n75% { transform: rotate(6deg); }", dur: 500, ease: "ease-in-out" },
  flip: { css: "from { transform: perspective(600px) rotateY(0); }\nto { transform: perspective(600px) rotateY(360deg); }", dur: 900, ease: "ease-in-out" },
  heartbeat: { css: "0%, 28%, 70%, 100% { transform: scale(1); }\n14%, 42% { transform: scale(1.15); }", dur: 1300, ease: "ease-in-out", infinite: true },
  float: { css: "0%, 100% { transform: translateY(0); }\n50% { transform: translateY(-12px); }", dur: 3000, ease: "ease-in-out", infinite: true },
};
const animation = {
  id: "animation", name: "Animations", group: GROUP, keywords: "keyframes motion entrance loop",
  blurb: "Keyframe animations, from entrances to gentle loops, with reduced motion handled.",
  render(t) {
    const s = { kind: "slide-up", dur: 600, delay: 0, count: 1, infinite: false, dir: "normal", fill: "both", ease: KEYFRAMES["slide-up"].ease };
    let last = s.kind;
    t.controls(
      t.select(s, "kind", Object.keys(KEYFRAMES).map((k) => [k, k[0].toUpperCase() + k.slice(1).replace("-", " ")]), { label: "Animation" }),
      t.row(t.range(s, "dur", { label: "Duration", min: 50, max: 5000, step: 50, unit: "ms" }), t.range(s, "delay", { label: "Delay", min: 0, max: 3000, step: 50, unit: "ms" })),
      t.select(s, "ease", EASINGS, { label: "Easing" }),
      t.row(t.number(s, "count", { label: "Times", min: 1, step: 1 }), h("div", { class: "tk-field te-end" }, t.toggle(s, "infinite", { label: "Forever" }))),
      t.row(t.select(s, "dir", ["normal", "reverse", "alternate", "alternate-reverse"], { label: "Direction" }), t.select(s, "fill", ["none", "forwards", "backwards", "both"], { label: "Fill" })),
    );
    const stage = t.stage();
    const style = stageStyle(stage);
    const demo = h("div", { class: "te-demo te-anim-demo" }, "Animated");
    const replay = () => { demo.style.animation = "none"; void demo.offsetWidth; demo.style.animation = ""; };
    stage.append(demo, h("button", { type: "button", class: "te-replay", onclick: replay }, "↻ Replay"));
    return () => {
      if (s.kind !== last) {
        last = s.kind;
        const k = KEYFRAMES[s.kind];
        Object.assign(s, { dur: k.dur, ease: k.ease, infinite: !!k.infinite, dir: "normal" });
        t.sync();
      }
      const name = `anim-${s.kind}`;
      const value = `${name} ${ms(s.dur)} ${s.ease}${s.delay ? ` ${ms(s.delay)}` : ""} ${s.infinite ? "infinite" : Math.max(1, Math.round(s.count))} ${s.dir} ${s.fill}`;
      const frames = `@keyframes ${name} {\n${KEYFRAMES[s.kind].css.split("\n").map((l) => `  ${l}`).join("\n")}\n}`;
      style.textContent = `${frames}\n.te-anim-demo { animation: ${value}; }`;
      replay();
      t.out({ decl: `animation: ${value};`, css: `${frames}\n\n@media (prefers-reduced-motion: reduce) {\n  .{cls} { animation: none; }\n}`, name: s.kind });
    };
  },
};

// ---- Button

const HOVERS = [["darken", "Darken"], ["lighten", "Lighten"], ["lift", "Lift"], ["grow", "Grow"], ["glow", "Glow"], ["invert", "Invert"]];
const SHADOWS = { none: "", soft: "0 1px 2px rgb(0 0 0 / 0.08), 0 4px 12px -4px rgb(0 0 0 / 0.2)", hard: "0 4px 0 rgb(0 0 0 / 0.85)" };
export function buttonCss(s) {
  const border = s.border ? `${px(s.border)} solid ${s.borderColor}` : "0";
  const shadow = SHADOWS[s.shadow] || "";
  const decl = [
    "display: inline-flex;", "align-items: center;", "justify-content: center;", "gap: 0.5em;",
    `padding: ${px(s.py)} ${px(s.px)};`, `font-size: ${px(s.size)};`, `font-weight: ${s.weight};`, "line-height: 1.2;",
    s.tracking ? `letter-spacing: ${round(s.tracking, 3)}em;` : "", s.upper ? "text-transform: uppercase;" : "",
    `color: ${s.color};`, `background-color: ${s.bg};`, `border: ${border};`, `border-radius: ${px(s.radius)};`,
    shadow ? `box-shadow: ${shadow};` : "", "cursor: pointer;", "text-decoration: none;",
    `transition: background-color ${s.speed}ms ease, color ${s.speed}ms ease, border-color ${s.speed}ms ease, transform ${s.speed}ms ease, box-shadow ${s.speed}ms ease;`,
  ].filter(Boolean).join("\n");
  const bg = parseColor(s.bg) || BLACK;
  const hover = {
    darken: `background-color: ${hexMix(s.bg, BLACK, 0.14)};${s.border ? `\nborder-color: ${hexMix(s.borderColor, BLACK, 0.14)};` : ""}`,
    lighten: `background-color: ${hexMix(s.bg, WHITE, 0.16)};`,
    lift: `transform: translateY(-2px);\nbox-shadow: 0 10px 24px -8px ${alpha(toHex(bg), 0.55)};`,
    grow: "transform: scale(1.04);",
    glow: `box-shadow: 0 0 0 4px ${alpha(toHex(bg), 0.22)}, 0 8px 24px -6px ${alpha(toHex(bg), 0.5)};`,
    invert: `background-color: ${s.color};\ncolor: ${s.bg};\nborder-color: ${s.bg};`,
  }[s.hover];
  const active = s.press ? `transform: translateY(1px) scale(0.98);${shadow && s.shadow === "hard" ? "\nbox-shadow: 0 1px 0 rgb(0 0 0 / 0.85);" : ""}` : "";
  const css = [
    rule(".{cls}:hover", hover),
    active ? rule(".{cls}:active", active) : "",
    rule(".{cls}:focus-visible", `outline: 2px solid ${s.focus};\noutline-offset: 3px;`),
    rule(".{cls}:disabled,\n.{cls}[aria-disabled=\"true\"]", "opacity: 0.5;\ncursor: not-allowed;\ntransform: none;"),
    "@media (prefers-reduced-motion: reduce) {\n  .{cls} { transition: none; }\n}",
  ].filter(Boolean).join("\n\n");
  return { decl, css };
}

const button = {
  id: "button", name: "Buttons", group: GROUP, keywords: "cta button hover focus react",
  blurb: "Buttons with hover, pressed and keyboard focus states, as CSS, HTML or React.",
  render(t) {
    const s = { label: "Get started", bg: "#111827", color: "#ffffff", radius: 8, px: 22, py: 12, size: 16, weight: 600, tracking: 0, upper: false, border: 0, borderColor: "#111827", shadow: "soft", hover: "darken", press: true, focus: "#2563eb", speed: 180 };
    t.controls(
      t.presets([
        { label: "Solid", apply: () => Object.assign(s, { bg: "#111827", color: "#ffffff", border: 0, radius: 8, shadow: "soft", hover: "darken", upper: false, tracking: 0 }) },
        { label: "Pill", apply: () => Object.assign(s, { radius: 999, px: 26, shadow: "none", hover: "lift" }) },
        { label: "Outline", apply: () => Object.assign(s, { bg: "#ffffff", color: "#111827", border: 2, borderColor: "#111827", shadow: "none", hover: "invert" }) },
        { label: "Brutal", apply: () => Object.assign(s, { bg: "#ffd23f", color: "#111111", border: 2, borderColor: "#111111", radius: 0, shadow: "hard", hover: "darken", upper: true, tracking: 0.04 }) },
        { label: "Quiet", apply: () => Object.assign(s, { bg: "#eef2f7", color: "#1f2937", border: 0, radius: 6, shadow: "none", hover: "darken", weight: 500 }) },
      ]),
      t.text(s, "label", { label: "Label" }),
      t.row(t.color(s, "bg", { label: "Background" }), t.color(s, "color", { label: "Text" })),
      sitePalette(t, s, "bg", "Site colours for the background"),
      t.row(t.range(s, "px", { label: "Padding X", min: 0, max: 60, unit: "px" }), t.range(s, "py", { label: "Padding Y", min: 0, max: 40, unit: "px" })),
      t.row(t.range(s, "size", { label: "Font size", min: 10, max: 32, unit: "px" }), t.range(s, "weight", { label: "Weight", min: 100, max: 900, step: 100 })),
      t.row(t.range(s, "radius", { label: "Radius", min: 0, max: 40, unit: "px" }), t.range(s, "tracking", { label: "Tracking", min: -0.05, max: 0.3, step: 0.01, unit: "em" })),
      t.toggle(s, "upper", { label: "Uppercase" }),
      t.row(t.range(s, "border", { label: "Border", min: 0, max: 6, unit: "px" }), t.color(s, "borderColor", { label: "Border colour" })),
      t.seg(s, "shadow", [["none", "No shadow"], ["soft", "Soft"], ["hard", "Hard"]], { label: "Shadow" }),
      t.seg(s, "hover", HOVERS, { label: "On hover" }),
      t.toggle(s, "press", { label: "Press in when clicked" }),
      t.row(t.color(s, "focus", { label: "Focus ring" }), t.range(s, "speed", { label: "Speed", min: 0, max: 600, step: 10, unit: "ms" })),
    );
    const stage = t.stage();
    const style = stageStyle(stage);
    const demo = h("button", { type: "button", class: "te-btn-demo" });
    stage.append(demo);
    return () => {
      const { decl, css } = buttonCss(s);
      demo.textContent = s.label || "Button";
      style.textContent = `${rule(".te-btn-demo", decl)}\n${css.replaceAll("{cls}", "te-btn-demo")}`;
      const label = (s.label || "Button").replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"));
      t.out({
        decl, css, name: "button",
        html: `<button type="button" class="{cls}">${label}</button>`,
        tabs: [{ label: "React", code: `// Put the CSS in your stylesheet; the component only sets the class.\nexport function Button({ children = ${JSON.stringify(s.label || "Button")}, className = "", ...props }) {\n  return (\n    <button type="button" className={\`{cls} \${className}\`.trim()} {...props}>\n      {children}\n    </button>\n  );\n}\n` }],
      });
    };
  },
};

export const tools = [shadow, textShadow, glass, neumorphism, triangle, clipPath, blob, pattern, textStroke, transition, animation, button];

export const styles = `
.te-card { width: min(16rem, 80%); aspect-ratio: 4 / 3; background: #fff; }
.te-text { margin: 0; max-width: 100%; text-align: center; font-family: var(--display); font-weight: 800; line-height: 1; letter-spacing: -0.02em; overflow-wrap: anywhere; }
.te-end { align-content: end; }
.te-glass-scene { min-height: 17rem; background:
  radial-gradient(circle at 22% 30%, #ff7a59 0 17%, transparent 17.5%),
  radial-gradient(circle at 78% 72%, #7b61ff 0 21%, transparent 21.5%),
  radial-gradient(circle at 70% 18%, #2ec5ff 0 11%, transparent 11.5%),
  linear-gradient(135deg, #fde68a, #fbcfe8 50%, #bfdbfe); }
.te-glass-card { width: min(18rem, 85%); padding: 1.3rem 1.4rem; font: 0.95rem/1.45 var(--text); }
.te-glass-card strong { display: block; margin-bottom: 0.3rem; font: 700 1.3rem/1.1 var(--display); }
.te-glass-card p { margin: 0; }
.te-clip { position: relative; width: min(100%, 22rem); aspect-ratio: 1; touch-action: none; user-select: none; }
.te-clip__ghost, .te-clip__shape { position: absolute; inset: 0; }
.te-clip__ghost { opacity: 0.16; }
.te-clip__pins { position: absolute; inset: 0; }
.te-clip__pt { position: absolute; width: 16px; height: 16px; margin: -8px 0 0 -8px; padding: 0; border-radius: 50%; background: #fff; border: 2px solid var(--accent); box-shadow: 0 1px 4px rgb(0 0 0 / 0.35); cursor: grab; }
.te-clip__pt:active { cursor: grabbing; }
.te-clip__pt:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.te-blob { display: grid; place-items: center; width: 100%; }
.te-blob svg { display: block; width: min(100%, 18rem); height: auto; }
.te-pattern { width: 100%; min-height: 15rem; border-radius: 6px; }
.te-demo { padding: 1.1rem 1.6rem; border: 1px solid rgb(0 0 0 / 0.08); border-radius: 12px; background: #fff; color: #111; font: 600 1rem/1.2 var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.06); }
.te-tr-demo { cursor: pointer; }
.te-replay { position: absolute; left: 0.6rem; bottom: 0.6rem; padding: 0.15rem 0.6rem; font-size: 0.8rem; border-radius: 999px; background: #fff; color: #111; }
.tk-stage__inner:has(.te-replay) { position: relative; }
`;
