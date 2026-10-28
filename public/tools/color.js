// Colour tools: contrast, conversion, gradients, palettes, filters and an
// OKLCH picker. They start from the site's own colours (projectColors) and
// write back to its stylesheets.
import {
  h, round, clamp, parseColor, toHex, formatColor, rgbToOklch, oklchToRgb, inGamut, maxChroma,
  contrast, readableOn, projectColors, mix,
} from "./kit.js";

const FORMATS = ["hex", "rgb", "hsl", "oklch", "oklab"];
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|oklch|oklab)\([^()]*\)/g;

// The site's colourful colours, for tools that need a hue to start from
const vivid = (t) => projectColors(t.host).map((c) => c.value).filter((v) => rgbToOklch(parseColor(v)).c > 0.05);

// The project's colours as presets that set s[key]
function siteSwatches(t, s, key, label = "From the site") {
  const list = projectColors(t.host, 16);
  if (!list.length) return null;
  return t.presets(list.map((c) => ({ label: c.name.startsWith("--") ? c.name : c.value, title: `${c.value} · ${c.file}`, swatch: c.value, apply: () => { s[key] = c.value; } })), { label });
}

// The nearest colour to fg, by OKLCH lightness alone, that reaches target
// contrast against bg; null if neither direction gets there.
function fixLightness(fg, bg, target) {
  const o = rgbToOklch(fg);
  let best = null;
  for (const dir of [-1, 1]) {
    const end = dir < 0 ? 0 : 1;
    const at = (l) => ({ ...oklchToRgb(l, o.c, o.h), a: fg.a });
    if (contrast(at(end), bg) < target) continue;
    let lo = o.l, hi = end;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (contrast(at(mid), bg) >= target) hi = mid; else lo = mid; }
    if (!best || Math.abs(hi - o.l) < best.d) best = { d: Math.abs(hi - o.l), c: at(hi) };
  }
  return best?.c || null;
}

const contrastTool = {
  id: "contrast", name: "Contrast checker", group: "Color", keywords: "wcag accessibility a11y aa aaa",
  blurb: "Check text and background colours against WCAG 2 AA and AAA, and find the nearest colour that passes.",
  render(t) {
    const site = projectColors(t.host);
    const s = { fg: site.find((c) => /ink|text|fg|fore/i.test(c.name))?.value || "#3d3d45", bg: site.find((c) => /paper|bg|back|surface/i.test(c.name))?.value || "#fbfbfa" };
    t.controls(
      t.color(s, "fg", { label: "Text" }), t.color(s, "bg", { label: "Background" }),
      t.button("Swap", () => { [s.fg, s.bg] = [s.bg, s.fg]; t.sync(); t.draw(); }),
      siteSwatches(t, s, "fg", "Site colours → text"), siteSwatches(t, s, "bg", "Site colours → background"),
    );
    const stage = t.stage({ plain: true, center: false });
    const ratio = h("p", { class: "tx-ratio" });
    const sample = h("div", { class: "tx-sample" });
    const grid = h("div", { class: "tx-badges" });
    const fixes = h("div", { class: "tx-fixes" });
    stage.append(ratio, sample);
    t.add(grid, fixes);
    return () => {
      const fg = parseColor(s.fg), bg = parseColor(s.bg);
      if (!fg || !bg) return;
      const r = contrast(fg, bg);
      ratio.replaceChildren(h("strong", {}, `${round(r, 2).toFixed(2)}`), ":1");
      stage.parentElement.style.background = s.bg;
      sample.style.color = s.fg;
      sample.replaceChildren(h("p", { class: "tx-sample__big" }, "Large text, 24px"), h("p", {}, "Body text at 16px. The quick brown fox jumps over the lazy dog."), h("p", { class: "tx-sample__ui" }, h("span", { style: { borderColor: s.fg } }, "Button"), h("span", { style: { background: s.fg, color: s.bg } }, "Badge")));
      const checks = [["Normal text", "AA", 4.5], ["Normal text", "AAA", 7], ["Large text", "AA", 3], ["Large text", "AAA", 4.5], ["UI and graphics", "AA", 3]];
      grid.replaceChildren(...checks.map(([what, level, need]) => h("div", { class: `tx-badge ${r >= need ? "tx-pass" : "tx-fail"}` }, h("span", {}, what), h("strong", {}, `${level} ${r >= need ? "pass" : "fail"}`), h("small", {}, `needs ${need}:1`))));
      const sugg = [4.5, 7].filter((n) => r < n).map((n) => ({ n, c: fixLightness(fg, bg, n + 0.02) })).filter((x) => x.c);
      fixes.replaceChildren(...(sugg.length ? [h("p", { class: "tk-label" }, "Nearest text colours that pass")] : []), ...sugg.map(({ n, c }) => {
        const hex = toHex(c);
        return h("button", { type: "button", class: "tx-fix", onclick: () => { s.fg = hex; t.sync(); t.draw(); } }, h("span", { class: "tk-presets__swatch", style: { background: hex } }), `${hex} reaches ${n === 7 ? "AAA" : "AA"} (${round(contrast(c, bg), 2)}:1)`);
      }));
      t.out({ decl: `color: ${s.fg};\nbackground-color: ${s.bg};`, name: "text-pair", text: `${round(r, 2)}:1 — ${checks.map(([w, l, n]) => `${w} ${l}: ${r >= n ? "pass" : "fail"}`).join(", ")}`, textLabel: "Report" });
    };
  },
};

const converter = {
  id: "color-converter", name: "Color converter", group: "Color", keywords: "hex rgb hsl oklch oklab convert",
  blurb: "Convert a colour between hex, rgb, hsl, oklch and oklab — or convert every colour in a stylesheet at once.",
  render(t) {
    const s = { color: vivid(t)[0] || "#e4572e", alpha: 1, file: t.host.defaultCss() || "", to: "oklch" };
    t.controls(t.color(s, "color", { label: "Colour (any CSS format)" }), t.range(s, "alpha", { label: "Alpha", min: 0, max: 1, step: 0.01 }), siteSwatches(t, s, "color"));
    const swatch = t.stage({ height: "8rem" });
    const rows = h("div", { class: "tx-rows" });
    const bulk = h("div", { class: "tk-group" });
    t.add(rows, bulk);
    const drawBulk = () => {
      const files = t.host.cssFiles();
      if (!files.length) { bulk.replaceChildren(t.note("No stylesheets in this project.")); return; }
      if (!files.includes(s.file)) s.file = files[0];
      const found = (t.host.read(s.file) || "").match(COLOR_RE)?.filter((c) => parseColor(c)) || [];
      bulk.replaceChildren(
        h("p", { class: "tk-group__title" }, "Convert a whole stylesheet"),
        t.row(t.select(s, "file", files, { label: "File" }), t.select(s, "to", FORMATS, { label: "To" })),
        t.note(`${found.length} colour${found.length === 1 ? "" : "s"} in ${s.file}. Colours inside var() fallbacks and named colours are left alone.`),
        t.button(`Convert ${found.length} to ${s.to}`, () => {
          let n = 0;
          const next = (t.host.read(s.file) || "").replace(COLOR_RE, (m) => { const c = parseColor(m); if (!c) return m; n++; return formatColor(c, s.to); });
          t.host.write(s.file, next);
          t.host.notify(`Converted ${n} colours in ${s.file} to ${s.to}`);
          drawBulk();
        }, { disabled: !found.length }),
      );
    };
    return () => {
      const c0 = parseColor(s.color);
      if (!c0) return;
      const c = { ...c0, a: c0.a < 1 && s.alpha === 1 ? c0.a : s.alpha };
      swatch.parentElement.dataset.bg = "checker";
      swatch.style.background = formatColor(c, "rgb");
      swatch.replaceChildren(h("span", { class: "tx-on", style: { color: readableOn(c) } }, formatColor(c, "hex")));
      rows.replaceChildren(...FORMATS.map((f) => {
        const v = formatColor(c, f);
        return h("div", { class: "tx-row" }, h("span", { class: "tk-label" }, f), h("code", {}, v), h("button", { type: "button", onclick: () => t.copy(v) }, "Copy"));
      }));
      const o = rgbToOklch(c);
      if (!inGamut(o.l, o.c, o.h)) rows.append(t.note("Outside sRGB: shown with chroma reduced to fit."));
      drawBulk();
      t.out({ text: FORMATS.map((f) => `${f.padEnd(6)} ${formatColor(c, f)}`).join("\n"), textLabel: "All formats", decl: `color: ${formatColor(c, s.to)};`, name: "color" });
    };
  },
};

// ---- Gradients

const stopsCss = (stops) => [...stops].sort((a, b) => a.at - b.at).map((x) => `${x.color} ${x.at}%`).join(", ");
function gradientCss(s) {
  const space = s.space === "srgb" ? "" : ` in ${s.space}`;
  const stops = stopsCss(s.stops);
  const rep = s.repeat ? "repeating-" : "";
  if (s.type === "radial") return `${rep}radial-gradient(${s.shape} at ${s.x}% ${s.y}%${space}, ${stops})`;
  if (s.type === "conic") return `${rep}conic-gradient(from ${s.angle}deg at ${s.x}% ${s.y}%${space}, ${stops})`;
  return `${rep}linear-gradient(${s.angle}deg${space}, ${stops})`;
}
const GRADIENTS = [
  ["Dusk", ["#ff7a59", "#c1467c", "#3a1c71"]], ["Lagoon", ["#00c9a7", "#0081cf"]], ["Peach", ["#ffd6a5", "#ff9a8b"]],
  ["Aurora", ["#22d1ee", "#5e60ce", "#c77dff"]], ["Moss", ["#d8f3dc", "#40916c", "#1b4332"]], ["Ink", ["#232526", "#414345"]],
];
const spread = (colors) => colors.map((color, i) => ({ color, at: Math.round((i / (colors.length - 1)) * 100) }));

const gradient = {
  id: "gradient", name: "Gradient generator", group: "Color", keywords: "linear radial conic background",
  blurb: "Build linear, radial and conic gradients, mixed in OKLab or sRGB, with as many stops as you like.",
  render(t) {
    const site = vivid(t);
    const s = { type: "linear", angle: 135, shape: "circle", x: 50, y: 50, space: "oklab", repeat: false, stops: spread(site.length >= 2 ? site.slice(0, 2) : GRADIENTS[0][1]) };
    t.controls(
      t.seg(s, "type", ["linear", "radial", "conic"], { label: "Type" }),
      t.range(s, "angle", { label: "Angle", min: 0, max: 360, unit: "deg" }),
      t.row(t.select(s, "shape", ["circle", "ellipse", "closest-side", "farthest-corner"], { label: "Radial shape" }), t.select(s, "space", [["oklab", "Mix in OKLab"], ["oklch", "Mix in OKLCH"], ["srgb", "Mix in sRGB"]], { label: "Mixing" })),
      t.row(t.range(s, "x", { label: "Centre x", unit: "%" }), t.range(s, "y", { label: "Centre y", unit: "%" })),
      t.toggle(s, "repeat", { label: "Repeating" }),
      t.presets(GRADIENTS.map(([label, cols]) => ({ label, swatch: `linear-gradient(90deg, ${cols.join(", ")})`, apply: () => { s.stops.splice(0, s.stops.length, ...spread(cols)); } }))),
      t.repeat(s.stops, { label: "Stop", min: 2, max: 8, make: (l) => ({ color: l.at(-1).color, at: 100 }), item: (stop) => [t.color(stop, "color", { label: "Colour" }), t.range(stop, "at", { label: "Position", unit: "%" })] }),
    );
    const box = t.stage({ height: "16rem" });
    return () => {
      const bg = gradientCss(s);
      box.style.background = bg;
      t.out({ decl: `background-image: ${bg};`, name: "gradient" });
    };
  },
};

const gradientText = {
  id: "gradient-text", name: "Gradient text", group: "Color", keywords: "background-clip text",
  blurb: "Fill text with a gradient, optionally drifting slowly, with a solid colour where clipping isn't supported.",
  render(t) {
    const site = vivid(t);
    const s = { text: t.host.site().name || "Gradient text", size: 64, weight: 800, angle: 90, animate: false, speed: 6, stops: spread(site.length >= 2 ? site.slice(0, 3) : GRADIENTS[3][1]) };
    t.controls(
      t.text(s, "text", { label: "Sample text" }),
      t.row(t.range(s, "size", { label: "Size", min: 16, max: 140, unit: "px" }), t.range(s, "weight", { label: "Weight", min: 100, max: 900, step: 100 })),
      t.range(s, "angle", { label: "Angle", min: 0, max: 360, unit: "deg" }),
      t.toggle(s, "animate", { label: "Drift the gradient" }), t.range(s, "speed", { label: "Drift speed", min: 2, max: 20, unit: "s" }),
      t.presets(GRADIENTS.map(([label, cols]) => ({ label, swatch: `linear-gradient(90deg, ${cols.join(", ")})`, apply: () => { s.stops.splice(0, s.stops.length, ...spread(cols)); } }))),
      t.repeat(s.stops, { label: "Colour", min: 2, max: 6, make: (l) => ({ color: l.at(-1).color, at: 100 }), item: (stop) => [t.color(stop, "color", { label: "Colour" }), t.range(stop, "at", { label: "Position", unit: "%" })] }),
    );
    const stage = t.stage({ height: "12rem" });
    const el = h("p", { class: "tx-gtext" });
    const style = h("style");
    stage.append(el, style);
    return () => {
      // Drifting, the gradient ends where it starts so the loop has no seam
      const stops = s.animate ? `${stopsCss(s.stops.map((x) => ({ ...x, at: Math.round(x.at * 0.8) })))}, ${s.stops[0].color} 100%` : stopsCss(s.stops);
      const bg = `linear-gradient(${s.angle}deg in oklab, ${stops})`;
      const decl = [`color: ${s.stops[0].color};`, `background-image: ${bg};`, "-webkit-background-clip: text;", "background-clip: text;", "-webkit-text-fill-color: transparent;"];
      if (s.animate) decl.push("background-size: 200% auto;", `animation: {cls}-drift ${s.speed}s linear infinite;`);
      const css = s.animate ? `@keyframes {cls}-drift {\n  to { background-position: 200% center; }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .{cls} { animation: none; }\n}` : "";
      el.textContent = s.text;
      el.className = "tx-gtext tx-gtext--live";
      Object.assign(el.style, { fontSize: `${s.size}px`, fontWeight: s.weight });
      style.textContent = `.tx-gtext--live { ${decl.join(" ").replaceAll("{cls}", "tx-live")} } @keyframes tx-live-drift { to { background-position: 200% center; } }`;
      t.out({ decl: decl.join("\n"), css, name: "gradient-text" });
    };
  },
};

// ---- Brand palette: 50–950 scales in OKLCH from up to three brand colours

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const LIGHT = [0.975, 0.94, 0.885, 0.81, 0.72, 0.63, 0.545, 0.46, 0.38, 0.3, 0.22];
const CHROMA = [0.12, 0.25, 0.45, 0.7, 0.9, 1, 1, 0.92, 0.8, 0.66, 0.5];
function scale(color, pin, neutral) {
  const o = rgbToOklch(color);
  // Pin the brand colour itself to the step nearest its lightness
  const at = LIGHT.reduce((b, l, i) => (Math.abs(l - o.l) < Math.abs(LIGHT[b] - o.l) ? i : b), 0);
  const shift = pin ? o.l - LIGHT[at] : 0;
  return STEPS.map((step, i) => {
    if (pin && i === at) return { step, c: color };
    const l = clamp(LIGHT[i] + shift * (1 - Math.abs(i - at) / 6), 0.08, 0.99);
    const c = neutral ? Math.min(0.02, o.c) * (0.6 + CHROMA[i] * 0.4) : Math.min(o.c * CHROMA[i] * 1.05, maxChroma(l, o.h));
    return { step, c: { ...oklchToRgb(l, c, o.h), a: 1 } };
  });
}
const brand = {
  id: "brand-colors", name: "Brand colors", group: "Color", wide: true, keywords: "palette design system tokens scale tailwind",
  blurb: "Turn one to three brand colours into full 50–950 scales, a tinted neutral and status colours, as CSS variables.",
  render(t) {
    const site = vivid(t);
    const s = { primary: site[0] || "#e4572e", secondary: site[1] || "", accent: site[2] || "", pin: true, neutral: true, status: true, format: "oklch", prefix: "" };
    t.controls(
      t.row(t.color(s, "primary", { label: "Primary" }), t.text(s, "secondary", { label: "Secondary (optional)", placeholder: "#2a9d8f" }), t.text(s, "accent", { label: "Accent (optional)", placeholder: "#e9c46a" })),
      t.row(t.toggle(s, "pin", { label: "Keep each brand colour exactly" }), t.toggle(s, "neutral", { label: "Tinted neutral" }), t.toggle(s, "status", { label: "Success, warning, danger, info" })),
      t.row(t.seg(s, "format", ["oklch", "hex", "rgb"], { label: "Output" }), t.text(s, "prefix", { label: "Variable prefix", placeholder: "none" })),
    );
    const out = h("div", { class: "tx-scales" });
    t.add(out);
    return () => {
      const p = parseColor(s.primary);
      if (!p) return;
      const o = rgbToOklch(p);
      const sets = [["primary", p, false]];
      for (const k of ["secondary", "accent"]) { const c = parseColor(s[k]); if (c) sets.push([k, { ...c, a: 1 }, false]); }
      if (s.neutral) sets.push(["neutral", { ...oklchToRgb(0.6, 0.015, o.h), a: 1 }, true]);
      if (s.status) for (const [name, hue] of [["success", 150], ["warning", 75], ["danger", 27], ["info", 245]]) sets.push([name, { ...oklchToRgb(0.62, 0.16, hue), a: 1 }, false]);
      const pre = s.prefix ? `${s.prefix.replace(/^-+|-+$/g, "")}-` : "";
      const vars = [];
      const tw = {};
      out.replaceChildren(...sets.map(([name, color, neutral]) => {
        const sc = scale(color, s.pin && !neutral && ["primary", "secondary", "accent"].includes(name), neutral);
        tw[name] = {};
        for (const { step, c } of sc) { const v = formatColor(c, s.format); vars.push(`--${pre}${name}-${step}: ${v};`); tw[name][step] = toHex(c); }
        return h("div", { class: "tx-scale" }, h("p", { class: "tk-label" }, name), h("div", { class: "tx-scale__row" }, sc.map(({ step, c }) => h("button", { type: "button", class: "tx-chip", title: `--${pre}${name}-${step}: ${formatColor(c, s.format)} — click to copy`, style: { background: toHex(c), color: readableOn(c) }, onclick: () => t.copy(formatColor(c, s.format)) }, h("span", {}, step), h("small", {}, `${round(contrast(c, { r: 255, g: 255, b: 255 }), 1)}`)))));
      }));
      out.append(t.note("The small number on each swatch is its contrast against white: 4.5 or more for body text."));
      t.out({ decl: vars.join("\n"), root: true, tabs: [{ label: "Tailwind", code: `// tailwind.config.js → theme.extend.colors\n${JSON.stringify(tw, null, 2)}` }, { label: "JSON", code: JSON.stringify(Object.fromEntries(vars.map((v) => v.slice(2, -1).split(": "))), null, 2) }] });
    };
  },
};

// ---- Filters

const FILTERS = [
  ["blur", 0, 20, 0, "px"], ["brightness", 0, 200, 100, "%"], ["contrast", 0, 200, 100, "%"], ["saturate", 0, 300, 100, "%"],
  ["grayscale", 0, 100, 0, "%"], ["sepia", 0, 100, 0, "%"], ["hue-rotate", 0, 360, 0, "deg"], ["invert", 0, 100, 0, "%"], ["opacity", 0, 100, 100, "%"],
];
const FILTER_PRESETS = {
  Original: {}, Vintage: { sepia: 45, contrast: 110, brightness: 105, saturate: 80 }, Noir: { grayscale: 100, contrast: 135, brightness: 90 },
  Warm: { sepia: 20, saturate: 130, "hue-rotate": 350 }, Cool: { saturate: 110, "hue-rotate": 190, brightness: 102 }, Faded: { contrast: 80, brightness: 115, saturate: 70 },
  Dramatic: { contrast: 150, saturate: 120, brightness: 90 }, Dream: { blur: 1, brightness: 112, saturate: 140 },
};
const filterTool = {
  id: "css-filter", name: "CSS filter", group: "Color", keywords: "filter backdrop-filter image effects",
  blurb: "Play with CSS filters on one of the site's images, then apply them as filter or backdrop-filter.",
  render(t) {
    const images = t.host.files().filter((p) => /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(p) && !p.includes("favicon"));
    const s = { image: images[0] || "", backdrop: false, shadow: false, sx: 0, sy: 8, sb: 16, sc: "rgb(0 0 0 / 0.35)" };
    for (const [k, , , d] of FILTERS) s[k] = d;
    t.controls(
      images.length ? t.select(s, "image", images.map((p) => [p, p.split("/").pop()]), { label: "Image from the site" }) : t.note("No images in the project: the preview uses a gradient."),
      t.presets(Object.entries(FILTER_PRESETS).map(([label, v]) => ({ label, apply: () => { for (const [k, , , d] of FILTERS) s[k] = v[k] ?? d; } }))),
      ...FILTERS.map(([k, min, max, , unit]) => t.range(s, k, { label: k, min, max, step: k === "blur" ? 0.5 : 1, unit })),
      t.toggle(s, "shadow", { label: "Add a drop-shadow" }),
      t.row(t.range(s, "sx", { label: "Shadow x", min: -40, max: 40, unit: "px" }), t.range(s, "sy", { label: "Shadow y", min: -40, max: 40, unit: "px" })),
      t.row(t.range(s, "sb", { label: "Shadow blur", min: 0, max: 60, unit: "px" }), t.color(s, "sc", { label: "Shadow colour" })),
      t.toggle(s, "backdrop", { label: "As backdrop-filter (for glass panels)" }),
    );
    const stage = t.stage({ height: "16rem" });
    const urls = new Map();
    const urlOf = (p) => {
      if (!urls.has(p)) { const bytes = t.host.bytes(p); urls.set(p, bytes ? URL.createObjectURL(new Blob([bytes], { type: p.endsWith(".svg") ? "image/svg+xml" : "" })) : ""); }
      return urls.get(p);
    };
    return () => {
      const parts = FILTERS.filter(([k, , , d]) => s[k] !== d).map(([k, , , , unit]) => `${k}(${s[k]}${unit})`);
      if (s.shadow) parts.push(`drop-shadow(${s.sx}px ${s.sy}px ${s.sb}px ${s.sc})`);
      const value = parts.join(" ") || "none";
      const src = s.image ? urlOf(s.image) : "";
      const pic = src ? h("img", { src, alt: "", class: "tx-filter-img" }) : h("div", { class: "tx-filter-img tx-filter-img--fake" });
      if (s.backdrop) stage.replaceChildren(h("div", { class: "tx-backdrop" }, pic, h("div", { class: "tx-backdrop__panel", style: { backdropFilter: value, webkitBackdropFilter: value } }, "Panel")));
      else { pic.style.filter = value; stage.replaceChildren(pic); }
      t.out({ decl: s.backdrop ? `-webkit-backdrop-filter: ${value};\nbackdrop-filter: ${value};` : `filter: ${value};`, name: s.backdrop ? "frosted" : "filtered" });
    };
  },
};

// ---- OKLCH picker

const oklchTool = {
  id: "oklch", name: "OKLCH color picker", group: "Color", keywords: "oklch lch perceptual palette gamut p3 harmony",
  blurb: "Pick colours by lightness, chroma and hue, see where sRGB ends, and build shades and harmonies that stay even.",
  render(t) {
    const start = parseColor(vivid(t)[0] || "#e4572e");
    const o = rgbToOklch(start);
    const s = { l: round(o.l * 100, 1), c: round(o.c, 3), h: round(o.h, 1), a: 1, harmony: "shades", vars: "brand" };
    const plane = h("canvas", { width: 280, height: 180, class: "tx-plane", title: "Click or drag: chroma across, lightness up" });
    const hueBar = h("div", { class: "tx-huebar" });
    const pick = (e) => {
      const r = plane.getBoundingClientRect();
      s.c = round(clamp((e.clientX - r.left) / r.width, 0, 1) * 0.37, 3);
      s.l = round((1 - clamp((e.clientY - r.top) / r.height, 0, 1)) * 100, 1);
      t.sync(); t.draw();
    };
    plane.addEventListener("pointerdown", (e) => { plane.setPointerCapture(e.pointerId); pick(e); plane.onpointermove = pick; });
    plane.addEventListener("pointerup", () => { plane.onpointermove = null; });
    t.controls(
      t.range(s, "l", { label: "Lightness", min: 0, max: 100, step: 0.1, unit: "%" }),
      t.range(s, "c", { label: "Chroma", min: 0, max: 0.37, step: 0.001 }),
      t.range(s, "h", { label: "Hue", min: 0, max: 360, step: 0.1, unit: "°" }), hueBar,
      t.range(s, "a", { label: "Alpha", min: 0, max: 1, step: 0.01 }),
      t.button("Load from text…", () => { const v = prompt("Any CSS colour"); const c = v && parseColor(v); if (!c) return; const k = rgbToOklch(c); Object.assign(s, { l: round(k.l * 100, 1), c: round(k.c, 3), h: round(k.h, 1), a: c.a }); t.sync(); t.draw(); }),
      t.seg(s, "harmony", [["shades", "Shades"], ["complement", "Complement"], ["analogous", "Analogous"], ["triad", "Triad"], ["tetrad", "Tetrad"]], { label: "Palette" }),
      t.text(s, "vars", { label: "Variable name" }),
    );
    const stage = t.stage({ plain: true, center: false });
    const swatch = h("div", { class: "tx-big" });
    const info = h("div", { class: "tx-rows" });
    const pal = h("div", { class: "tx-scale__row" });
    stage.append(plane, swatch);
    t.add(info, pal);
    const ctx = plane.getContext("2d");
    return () => {
      const L = s.l / 100;
      // The plane: chroma × lightness at this hue, faded outside sRGB
      const img = ctx.createImageData(plane.width, plane.height);
      for (let y = 0; y < plane.height; y++) {
        const l = 1 - y / (plane.height - 1);
        const edge = maxChroma(l, s.h);
        for (let x = 0; x < plane.width; x++) {
          const c = (x / (plane.width - 1)) * 0.37;
          const rgb = oklchToRgb(l, Math.min(c, edge), s.h);
          const i = (y * plane.width + x) * 4;
          const out = c > edge;
          img.data[i] = out ? rgb.r * 0.35 + 140 : rgb.r; img.data[i + 1] = out ? rgb.g * 0.35 + 140 : rgb.g; img.data[i + 2] = out ? rgb.b * 0.35 + 140 : rgb.b; img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const px = (s.c / 0.37) * plane.width, py = (1 - L) * plane.height;
      ctx.strokeStyle = L > 0.6 ? "#000" : "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2); ctx.stroke();
      hueBar.style.background = `linear-gradient(90deg, ${Array.from({ length: 13 }, (_, i) => toHex(oklchToRgb(Math.max(L, 0.3), Math.min(s.c || 0.1, 0.15), i * 30))).join(", ")})`;
      const value = `oklch(${s.l}% ${s.c} ${s.h}${s.a < 1 ? ` / ${s.a}` : ""})`;
      const rgb = { ...oklchToRgb(L, s.c, s.h), a: s.a };
      const fits = inGamut(L, s.c, s.h);
      swatch.style.background = value;
      swatch.replaceChildren(h("span", { style: { color: readableOn(rgb) } }, value));
      info.replaceChildren(
        h("div", { class: "tx-row" }, h("span", { class: "tk-label" }, "oklch"), h("code", {}, value), h("button", { type: "button", onclick: () => t.copy(value) }, "Copy")),
        h("div", { class: "tx-row" }, h("span", { class: "tk-label" }, "hex"), h("code", {}, toHex(rgb)), h("button", { type: "button", onclick: () => t.copy(toHex(rgb)) }, "Copy")),
        t.note(fits ? "Inside sRGB: every screen shows it as picked." : `Outside sRGB (the faded area): wide-gamut screens show it, others get the nearest colour, ${toHex(rgb)}. The output includes that as a fallback.`),
      );
      const hues = { shades: null, complement: [0, 180], analogous: [-30, 0, 30], triad: [0, 120, 240], tetrad: [0, 90, 180, 270] }[s.harmony];
      const list = hues ? hues.map((d, i) => ({ name: `${s.vars}-${i + 1}`, l: L, c: s.c, h: (s.h + d + 360) % 360 })) : [0.95, 0.85, 0.72, 0.6, 0.48, 0.36, 0.25].map((l, i) => ({ name: `${s.vars}-${(i + 1) * 100}`, l, c: Math.min(s.c, maxChroma(l, s.h)), h: s.h }));
      const vars = list.map((p) => `--${p.name}: oklch(${round(p.l * 100, 1)}% ${round(p.c, 3)} ${round(p.h, 1)});`);
      pal.replaceChildren(...list.map((p) => { const c = oklchToRgb(p.l, p.c, p.h); return h("button", { type: "button", class: "tx-chip", title: `--${p.name} — click to copy`, style: { background: toHex(c), color: readableOn(c) }, onclick: () => t.copy(`oklch(${round(p.l * 100, 1)}% ${round(p.c, 3)} ${round(p.h, 1)})`) }, h("span", {}, p.name.split("-").pop())); }));
      t.out({ decl: `${fits ? "" : `color: ${toHex(rgb)};\n`}color: ${value};`, name: "oklch-color", tabs: [{ label: "Palette variables", code: `:root {\n${vars.map((v) => `  ${v}`).join("\n")}\n}` }], actions: [{ label: "Add palette to stylesheet", run: () => addRoot(t, vars, "oklch-palette") }] });
    };
  },
};
// :root variables into the default stylesheet, in the drawer's update-in-place format
function addRoot(t, vars, key) {
  const file = t.host.defaultCss();
  if (!file) { t.host.notify("This project has no stylesheet", "error"); return; }
  const begin = `/* tools: ${key} */`, end = `/* /tools: ${key} */`;
  const block = `${begin}\n:root {\n${vars.map((v) => `  ${v}`).join("\n")}\n}\n${end}`;
  let text = t.host.read(file) || "";
  const i = text.indexOf(begin), j = i >= 0 ? text.indexOf(end, i) : -1;
  text = i >= 0 && j >= 0 ? text.slice(0, i) + block + text.slice(j + end.length) : `${text.replace(/\s*$/, text.trim() ? "\n\n" : "")}${block}\n`;
  t.host.write(file, text);
  t.host.notify(`Added the palette to ${file}`);
}

export const tools = [contrastTool, converter, gradient, gradientText, brand, filterTool, oklchTool];

export const styles = `
.tx-ratio { margin: 0 0 0.6rem; font: 400 1.4rem/1 var(--display); }
.tx-ratio strong { font-size: 3.4rem; font-weight: 700; letter-spacing: -0.03em; }
.tx-sample p { margin: 0 0 0.5rem; }
.tx-sample__big { font-size: 24px; font-weight: 600; }
.tx-sample__ui { display: flex; gap: 0.5rem; }
.tx-sample__ui span { padding: 0.3rem 0.8rem; border: 2px solid; border-radius: 6px; font-size: 0.85rem; font-weight: 600; }
.tx-badges { display: grid; grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr)); gap: 0.4rem; }
.tx-badge { display: grid; gap: 0.1rem; padding: 0.55rem 0.7rem; border: 1px solid var(--rule); border-radius: 6px; font-size: 0.8rem; }
.tx-badge strong { font-size: 0.95rem; }
.tx-badge small { color: var(--ink-soft); }
.tx-pass strong { color: var(--ok); }
.tx-fail strong { color: var(--error); }
.tx-fixes { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; }
.tx-fixes .tk-label { flex-basis: 100%; }
.tx-fix { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.84rem; }
.tx-on { font: 600 1.1rem var(--mono); }
.tx-rows { display: grid; gap: 0.3rem; }
.tx-row { display: grid; grid-template-columns: 3.5rem minmax(0, 1fr) auto; align-items: center; gap: 0.6rem; padding: 0.3rem 0; border-bottom: 1px solid var(--rule); }
.tx-row code { font: 0.86rem var(--mono); overflow-wrap: anywhere; }
.tx-row button { font-size: 0.8rem; padding: 0.15rem 0.55rem; }
.tx-gtext { margin: 0; line-height: 1.05; text-align: center; letter-spacing: -0.02em; }
.tx-scales { display: grid; gap: 0.8rem; }
.tx-scale { display: grid; gap: 0.3rem; }
.tx-scale__row { display: grid; grid-template-columns: repeat(auto-fit, minmax(3.2rem, 1fr)); gap: 3px; }
.tx-chip { display: grid; gap: 0.1rem; justify-items: start; min-height: 3.2rem; padding: 0.35rem 0.4rem; border: 0; border-radius: 4px; font-size: 0.72rem; text-align: left; }
.tx-chip small { opacity: 0.75; font-family: var(--mono); font-size: 0.66rem; }
.tx-filter-img { display: block; max-width: 100%; max-height: 22rem; border-radius: 6px; }
.tx-filter-img--fake { width: 20rem; height: 13rem; background: linear-gradient(135deg, #f6d365, #fda085 40%, #5ee7df 70%, #b490ca); }
.tx-backdrop { position: relative; }
.tx-backdrop__panel { position: absolute; inset: 22% 18%; display: grid; place-items: center; border-radius: 12px; border: 1px solid rgb(255 255 255 / 0.4); background: rgb(255 255 255 / 0.12); color: #fff; font-weight: 700; text-shadow: 0 1px 2px rgb(0 0 0 / 0.4); }
.tx-plane { width: 100%; height: auto; aspect-ratio: 280 / 180; border-radius: 6px; cursor: crosshair; touch-action: none; display: block; }
.tx-huebar { height: 0.5rem; margin-top: -0.4rem; border-radius: 999px; }
.tx-big { display: grid; place-items: center; min-height: 5.5rem; margin-top: 0.6rem; border-radius: 6px; font: 600 0.95rem var(--mono); }
`;
