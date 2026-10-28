// Typography tools: font pairings that can be self-hosted into the site,
// a fluid type scale, px ↔ rem, and clamp() for any fluid value. The clamp
// maths is shared by the last three.
import { h, round } from "./kit.js";

// clamp() that grows linearly from minPx at minVw to maxPx at maxVw
export function clampExpr(minPx, maxPx, minVw, maxVw, unit = "rem", root = 16) {
  const u = (v) => (unit === "rem" ? `${round(v / root, 4)}rem` : `${round(v, 2)}px`);
  if (maxVw === minVw || minPx === maxPx) return u(minPx);
  const slope = (maxPx - minPx) / (maxVw - minVw);
  const intercept = minPx - slope * minVw;
  const vw = `${round(Math.abs(slope) * 100, 4)}vw`;
  const pref = round(intercept, 4) === 0 ? (slope < 0 ? `-${vw}` : vw) : `${u(intercept)} ${slope < 0 ? "-" : "+"} ${vw}`;
  return `clamp(${u(Math.min(minPx, maxPx))}, ${pref}, ${u(Math.max(minPx, maxPx))})`;
}
// The size clampExpr gives at a viewport width, in px
export function clampAt(minPx, maxPx, minVw, maxVw, vw) {
  if (maxVw === minVw) return minPx;
  const v = minPx + ((maxPx - minPx) / (maxVw - minVw)) * (vw - minVw);
  return Math.min(Math.max(minPx, maxPx), Math.max(Math.min(minPx, maxPx), v));
}

// Rules the drawer adds sit between "tools:" comments; adding again replaces them
function upsert(text, key, css) {
  const begin = `/* tools: ${key} */`;
  const end = `/* /tools: ${key} */`;
  text ??= "";
  const block = `${begin}\n${css.trim()}\n${end}`;
  const i = text.indexOf(begin);
  const j = i >= 0 ? text.indexOf(end, i) : -1;
  if (i >= 0 && j >= 0) return text.slice(0, i) + block + text.slice(j + end.length);
  return `${text.replace(/\s*$/, text.trim() ? "\n\n" : "")}${block}\n`;
}

// ---- Font pairing

const FALLBACK = { serif: 'Georgia, "Times New Roman", serif', sans: "system-ui, sans-serif", display: "system-ui, sans-serif", mono: "ui-monospace, Menlo, monospace" };
// [heading, heading weight, heading kind, body, body kind, category]
const PAIRS = [
  ["Playfair Display", 700, "serif", "Source Sans 3", "sans", "serif"],
  ["Fraunces", 600, "serif", "Inter", "sans", "serif"],
  ["Cormorant Garamond", 600, "serif", "Proza Libre", "sans", "serif"],
  ["DM Serif Display", 400, "serif", "DM Sans", "sans", "serif"],
  ["Libre Baskerville", 700, "serif", "Lato", "sans", "serif"],
  ["Lora", 600, "serif", "Nunito Sans", "sans", "serif"],
  ["EB Garamond", 500, "serif", "Work Sans", "sans", "serif"],
  ["Instrument Serif", 400, "serif", "Instrument Sans", "sans", "serif"],
  ["Newsreader", 500, "serif", "Public Sans", "sans", "serif"],
  ["Space Grotesk", 600, "sans", "IBM Plex Sans", "sans", "sans"],
  ["Manrope", 700, "sans", "Inter", "sans", "sans"],
  ["Bricolage Grotesque", 700, "sans", "Hanken Grotesk", "sans", "sans"],
  ["Montserrat", 700, "sans", "Karla", "sans", "sans"],
  ["Sora", 600, "sans", "Nunito", "sans", "sans"],
  ["Outfit", 600, "sans", "Figtree", "sans", "sans"],
  ["Syne", 700, "display", "Inter", "sans", "display"],
  ["Bebas Neue", 400, "display", "Barlow", "sans", "display"],
  ["Abril Fatface", 400, "display", "Poppins", "sans", "display"],
  ["Unbounded", 600, "display", "Rubik", "sans", "display"],
  ["Anton", 400, "display", "Libre Franklin", "sans", "display"],
  ["JetBrains Mono", 700, "mono", "Inter", "sans", "mono"],
  ["Space Mono", 700, "mono", "Work Sans", "sans", "mono"],
  ["IBM Plex Mono", 600, "mono", "IBM Plex Sans", "sans", "mono"],
  ["DM Mono", 500, "mono", "DM Sans", "sans", "mono"],
];
const fam = (name) => name.trim().replace(/\s+/g, "+");
export function fontsUrl(s) {
  const fams = s.heading.trim() === s.body.trim()
    ? [`family=${fam(s.heading)}:wght@${[...new Set([400, s.hw, 700])].sort((a, b) => a - b).join(";")}`]
    : [`family=${fam(s.heading)}:wght@${s.hw}`, `family=${fam(s.body)}:wght@400;700`];
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}
const stack = (name, kind) => `"${name.trim()}", ${FALLBACK[kind] || FALLBACK.sans}`;
// Custom properties the site already sets fonts with ("--display", "--serif"…)
function fontVars(host) {
  const found = new Set();
  for (const f of host.cssFiles()) {
    for (const m of (host.read(f) || "").matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
      if (!/^--font-(heading|body)$/.test(m[1]) && /["']|\b(serif|sans-serif|monospace|system-ui)\b/.test(m[2]) && !/var\(/.test(m[2])) found.add(m[1]);
    }
  }
  return [...found];
}
function varsCss(s) {
  const mapped = [s.hv && `  ${s.hv}: var(--font-heading);`, s.bv && s.bv !== s.hv && `  ${s.bv}: var(--font-body);`].filter(Boolean);
  return `:root {\n  --font-heading: ${stack(s.heading, s.hk)};\n  --font-body: ${stack(s.body, s.bk)};${mapped.length ? `\n${mapped.join("\n")}` : ""}\n}\n\nbody { font-family: var(--font-body); }\n\nh1, h2, h3, h4, h5, h6 {\n  font-family: var(--font-heading);\n  font-weight: ${s.hw};\n}`;
}
const loadedLinks = new Set();
function loadCss(href) {
  if (loadedLinks.has(href)) return;
  loadedLinks.add(href);
  document.head.append(h("link", { rel: "stylesheet", href, "data-tools-font": "" }));
}

// Download a css2 stylesheet's woff2 files and rewrite it to point at them
async function selfHost(s, latinOnly) {
  const res = await fetch(fontsUrl(s));
  if (!res.ok) throw new Error(`Google Fonts said ${res.status}: check the family names and weight`);
  const css = await res.text();
  const blocks = [...css.matchAll(/(?:\/\*\s*([\w-]+)\s*\*\/\s*)?@font-face\s*{([^}]*)}/g)].map((m) => ({ subset: m[1] || "all", body: m[2] }));
  const keep = blocks.filter((b) => !latinOnly || b.subset === "all" || b.subset === "latin" || b.subset === "latin-ext");
  if (!keep.length) throw new Error("Google Fonts returned no font files");
  const byUrl = new Map();
  const faces = [];
  for (const b of keep) {
    const get = (prop) => (new RegExp(`${prop}\\s*:\\s*([^;]+);`).exec(b.body)?.[1] || "").trim();
    const url = /url\(([^)]+)\)/.exec(b.body)?.[1]?.replace(/['"]/g, "");
    if (!url) continue;
    const family = get("font-family").replace(/['"]/g, "");
    const style = get("font-style") || "normal";
    const weight = get("font-weight") || "400";
    if (!byUrl.has(url)) byUrl.set(url, `assets/fonts/${family.replace(/\s+/g, "")}-${style}-${weight.replace(/\s+/g, "-")}${b.subset === "all" ? "" : `-${b.subset}`}.woff2`);
    const range = get("unicode-range");
    faces.push(`@font-face {\n  font-family: "${family}";\n  font-style: ${style};\n  font-weight: ${weight};\n  font-display: swap;\n  src: url("/${byUrl.get(url)}") format("woff2");${range ? `\n  unicode-range: ${range};` : ""}\n}`);
  }
  const files = await Promise.all([...byUrl].map(async ([url, path]) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Couldn't download ${path.split("/").pop()} (${r.status})`);
    return [path, new Uint8Array(await r.arrayBuffer())];
  }));
  return { files, css: `${faces.join("\n")}\n\n${varsCss(s)}` };
}

const pairing = {
  id: "font-pairing", name: "Font pairing", group: "Typography", blurb: "Heading and body fonts that work together, previewed with your site's name. Self-host them into assets/fonts or link Google Fonts.", keywords: "fonts google typeface pairing self-host webfont",
  render(t) {
    const host = t.host;
    const vars = fontVars(host);
    const guess = (re) => vars.find((v) => re.test(v)) || "";
    const s = { cat: "all", pick: 0, heading: PAIRS[0][0], hw: PAIRS[0][1], hk: PAIRS[0][2], body: PAIRS[0][3], bk: PAIRS[0][4], latin: true, busy: false, hv: guess(/display|head|title|serif/), bv: guess(/text|body|base|sans|copy/) };
    const list = h("div", { class: "tt-pairs" });
    const paintList = () => {
      const shown = PAIRS.map((p, i) => [p, i]).filter(([p]) => s.cat === "all" || p[5] === s.cat);
      list.replaceChildren(...shown.map(([p, i]) => {
        loadCss(`https://fonts.googleapis.com/css2?family=${fam(p[0])}:wght@${p[1]}&text=${encodeURIComponent(p[0])}`);
        loadCss(`https://fonts.googleapis.com/css2?family=${fam(p[3])}&text=${encodeURIComponent(p[3])}`);
        return h("button", { type: "button", class: "tt-pair", "aria-pressed": String(i === s.pick), onclick: () => {
          Object.assign(s, { pick: i, heading: p[0], hw: p[1], hk: p[2], body: p[3], bk: p[4] });
          t.sync(); t.draw();
        } }, h("span", { class: "tt-pair__h", style: { fontFamily: stack(p[0], p[2]), fontWeight: p[1] } }, p[0]), h("span", { class: "tt-pair__b", style: { fontFamily: stack(p[3], p[4]) } }, p[3]));
      }));
    };
    t.controls(
      t.seg(s, "cat", [["all", "All"], ["serif", "Serif"], ["sans", "Sans"], ["display", "Display"], ["mono", "Mono"]], { label: "Headings in" }),
      list,
      t.group("Or type your own (Google Fonts names)",
        t.text(s, "heading", { label: "Heading font" }),
        t.row(t.number(s, "hw", { label: "Heading weight", min: 100, max: 900, step: 100 }), t.select(s, "hk", ["serif", "sans", "display", "mono"], { label: "Fallback" })),
        t.text(s, "body", { label: "Body font" })),
      vars.length ? t.group("The site's own font variables",
        t.note("Pointing them at the new fonts restyles everything that already uses them."),
        t.row(t.select(s, "hv", [["", "None"], ...vars], { label: "Headings set" }), t.select(s, "bv", [["", "None"], ...vars], { label: "Body set" }))) : null,
      t.toggle(s, "latin", { label: "Self-host Latin characters only (smaller)" }),
    );
    const box = t.stage({ center: false });
    const run = async (how) => {
      if (s.busy) return;
      s.busy = true; t.draw();
      const file = host.defaultCss() || "assets/css/main.css";
      try {
        if (how === "self") {
          host.notify("Downloading fonts…", "busy");
          const { files, css } = await selfHost(s, s.latin);
          host.change(() => {
            for (const [p, bytes] of files) host.write(p, bytes);
            host.write(file, upsert(host.read(file), "font-pairing", css));
          });
          host.notify(`Added ${files.length} font file${files.length === 1 ? "" : "s"} to assets/fonts and the rules to ${file}`, "ok");
        } else {
          const href = fontsUrl(s).replaceAll("&", "&amp;");
          host.change(() => {
            host.addToHead(`<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${href}">`, "fonts");
            host.write(file, upsert(host.read(file), "font-pairing", varsCss(s)));
          });
          host.notify(`Linked Google Fonts in ${host.headTargets().join(", ")}; variables in ${file}`, "ok");
        }
      } catch (err) {
        host.notify(String(err.message || err), "error");
      } finally {
        s.busy = false; t.draw();
      }
    };
    let lastCat = null;
    return () => {
      if (s.cat !== lastCat) { lastCat = s.cat; paintList(); }
      list.querySelectorAll(".tt-pair").forEach((b, n) => b.setAttribute("aria-pressed", String(b.textContent === `${s.heading}${s.body}`)));
      const ok = s.heading.trim() && s.body.trim();
      if (ok) loadCss(fontsUrl(s));
      const name = host.site()?.name || "Your site's name";
      const hf = { fontFamily: stack(s.heading, s.hk), fontWeight: String(s.hw) };
      box.replaceChildren(h("div", { class: "tt-specimen" },
        h("p", { class: "tt-specimen__meta" }, `${s.heading} ${s.hw} · ${s.body}`),
        h("h1", { style: hf }, name),
        h("h2", { style: hf }, "A heading for the next section"),
        h("p", { style: { fontFamily: stack(s.body, s.bk) } }, "Body text sets the pace of a page. It should read easily at length, hold up in bold and small sizes, and sit comfortably under the headings without competing with them. ", h("strong", {}, "Bold for emphasis"), ", and numbers: 0123456789.")));
      const html = `<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="${fontsUrl(s).replaceAll("&", "&amp;")}">`;
      t.out({
        css: varsCss(s),
        tabs: [{ label: "Google Fonts <head>", code: html }],
        actions: [
          { label: s.busy ? "Working…" : "Use in site (self-host)", primary: true, disabled: s.busy || !ok, title: "Downloads the font files into assets/fonts and adds @font-face rules and variables to the stylesheet", run: () => run("self") },
          { label: "Use from Google Fonts", disabled: s.busy || !ok, title: "Adds Google Fonts links to the layout's <head> and the variables to the stylesheet", run: () => run("google") },
        ],
      });
    };
  },
};

// ---- Fluid type scale

export function fluidSteps(s) {
  const out = [];
  for (let i = -s.down; i <= s.up; i++) {
    const min = s.minBase * s.minRatio ** i, max = s.maxBase * s.maxRatio ** i;
    out.push({ i, min, max, expr: clampExpr(min, max, s.minVw, s.maxVw, s.unit) });
  }
  return out;
}

const fluidType = {
  id: "fluid-type", name: "Fluid type & space", group: "Typography", blurb: "A type scale that grows smoothly from small screens to large ones: one clamp() per step, as custom properties.", keywords: "type scale modular clamp responsive font-size utopia",
  render(t) {
    const s = { minVw: 360, maxVw: 1280, minBase: 16, maxBase: 19, minRatio: 1.2, maxRatio: 1.333, down: 2, up: 5, unit: "rem", prefix: "--step", vw: 800, sample: "Sphinx of black quartz" };
    const R = [["1.067", "Minor second"], ["1.125", "Major second"], ["1.2", "Minor third"], ["1.25", "Major third"], ["1.333", "Perfect fourth"], ["1.5", "Perfect fifth"], ["1.618", "Golden"]];
    t.controls(
      t.row(t.number(s, "minVw", { label: "Smallest screen", unit: "px", min: 200 }), t.number(s, "maxVw", { label: "Largest screen", unit: "px", min: 300 })),
      t.row(t.number(s, "minBase", { label: "Base size, small", unit: "px", min: 8 }), t.number(s, "maxBase", { label: "Base size, large", unit: "px", min: 8 })),
      t.row(t.select(s, "minRatio", R.map(([v, l]) => [v, `${v} ${l}`]), { label: "Ratio, small" }), t.select(s, "maxRatio", R.map(([v, l]) => [v, `${v} ${l}`]), { label: "Ratio, large" })),
      t.row(t.range(s, "down", { label: "Steps down", min: 0, max: 4 }), t.range(s, "up", { label: "Steps up", min: 1, max: 8 })),
      t.row(t.seg(s, "unit", ["rem", "px"], { label: "Unit" }), t.text(s, "prefix", { label: "Prefix", mono: true })),
      t.text(s, "sample", { label: "Sample text" }),
    );
    const width = h("div", {});
    const list = h("div", { class: "tt-steps" });
    t.add(width, list);
    const slider = h("input", { type: "range", class: "tt-vw" });
    slider.addEventListener("input", () => { s.vw = Number(slider.value); t.draw(); });
    return () => {
      s.minRatio = Number(s.minRatio); s.maxRatio = Number(s.maxRatio);
      slider.min = Math.min(s.minVw, s.maxVw); slider.max = Math.max(s.minVw, s.maxVw); slider.value = s.vw;
      width.replaceChildren(h("label", { class: "tk-field" }, h("span", { class: "tk-label" }, h("span", {}, "Preview at screen width"), h("span", { class: "tk-mono" }, `${s.vw}px`)), slider));
      const steps = fluidSteps(s);
      list.replaceChildren(...steps.slice().reverse().map((x) => {
        const size = clampAt(x.min, x.max, s.minVw, s.maxVw, s.vw);
        return h("div", { class: "tt-step" },
          h("p", { class: "tt-step__meta" }, h("code", {}, `${s.prefix}-${x.i}`), ` ${round(size, 1)}px · ${round(x.min, 1)} → ${round(x.max, 1)}`),
          h("p", { class: "tt-step__sample", style: { fontSize: `${size}px` } }, s.sample));
      }));
      t.out({ decl: steps.map((x) => `${s.prefix}-${x.i}: ${x.expr};`).join("\n"), root: true, name: "step" });
    };
  },
};

// ---- px ↔ rem

export function convertUnits(text, dir, root, keepHairlines) {
  if (dir === "px-rem") {
    return text.replace(/(^|[^\w.-])(-?\d*\.?\d+)px\b/g, (m, pre, n) => {
      const v = Number(n);
      if (v === 0) return `${pre}0`;
      if (keepHairlines && Math.abs(v) <= 1) return m;
      return `${pre}${round(v / root, 4)}rem`;
    });
  }
  return text.replace(/(^|[^\w.-])(-?\d*\.?\d+)rem\b/g, (m, pre, n) => `${pre}${round(Number(n) * root, 2)}px`);
}

const pxRem = {
  id: "px-rem", name: "PX ↔ REM", group: "Typography", blurb: "Convert single values, or every px in a whole stylesheet, to rem and back.", keywords: "convert units rem px em root font size",
  render(t) {
    const host = t.host;
    const s = { root: 16, px: 24, rem: 1.5, dir: "px-rem", batch: "", keep: true, file: host.defaultCss() || host.cssFiles()[0] || "", loaded: null };
    const last = { root: s.root, px: s.px, rem: s.rem };
    const files = host.cssFiles();
    const loadBtn = t.button("Load", () => { s.batch = host.read(s.file) || ""; s.loaded = s.file; t.sync(); t.draw(); });
    t.controls(
      t.number(s, "root", { label: "Root font size", unit: "px", min: 1 }),
      t.row(t.number(s, "px", { label: "Pixels", unit: "px" }), t.number(s, "rem", { label: "Rem", unit: "rem" })),
      t.group("Convert a whole stylesheet",
        t.seg(s, "dir", [["px-rem", "px → rem"], ["rem-px", "rem → px"]], { label: "Direction" }),
        t.toggle(s, "keep", { label: "Leave 1px and smaller alone (borders)" }),
        files.length ? h("div", { class: "tt-load" }, t.select(s, "file", files, { bare: true }), loadBtn) : null,
        t.text(s, "batch", { label: "CSS", area: true, rows: 7, mono: true, placeholder: "Paste CSS, or load one of the site's stylesheets" })),
    );
    const table = h("div", { class: "tt-table" });
    const box = t.stage({ center: false, plain: true });
    box.append(table);
    return () => {
      if (s.root <= 0) s.root = 16;
      if (s.px !== last.px) s.rem = round(s.px / s.root, 4);
      else if (s.rem !== last.rem) s.px = round(s.rem * s.root, 2);
      else if (s.root !== last.root) s.rem = round(s.px / s.root, 4);
      Object.assign(last, { root: s.root, px: s.px, rem: s.rem });
      t.sync();
      table.replaceChildren(h("p", { class: "tk-label" }, `At ${s.root}px`), h("div", { class: "tt-table__grid" }, [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 80, 96].map((v) =>
        h("button", { type: "button", title: "Copy", onclick: () => t.copy(`${round(v / s.root, 4)}rem`) }, h("span", {}, `${v}px`), h("code", {}, `${round(v / s.root, 4)}rem`)))));
      const batch = s.batch.trim();
      const converted = batch ? convertUnits(s.batch, s.dir, s.root, s.keep) : "";
      const canSave = batch && s.loaded && s.loaded === s.file && converted !== host.read(s.file);
      t.out({
        text: batch ? converted : `${s.px}px = ${s.rem}rem`, textLabel: batch ? "Converted CSS" : "Result",
        actions: s.loaded ? [{ label: `Save to ${s.loaded}`, primary: true, disabled: !canSave, run: () => { host.write(s.loaded, converted); host.notify(`Converted ${s.loaded}`, "ok"); s.batch = converted; t.sync(); t.draw(); } }] : [],
      });
    };
  },
};

// ---- clamp()

const clampTool = {
  id: "clamp", name: "Clamp", group: "Typography", blurb: "One value that scales between two screen widths and stops at both ends, for font sizes, padding, gaps or widths.", keywords: "clamp fluid responsive font-size padding vw",
  render(t) {
    const s = { prop: "font-size", min: 18, max: 40, minVw: 360, maxVw: 1280, unit: "rem", root: 16, vw: 800 };
    t.controls(
      t.select(s, "prop", ["font-size", "padding", "margin-block", "gap", "width", "border-radius"], { label: "Property" }),
      t.row(t.number(s, "min", { label: "Smallest", unit: "px" }), t.number(s, "max", { label: "Largest", unit: "px" })),
      t.row(t.number(s, "minVw", { label: "From screen", unit: "px", min: 1 }), t.number(s, "maxVw", { label: "To screen", unit: "px", min: 1 })),
      t.row(t.seg(s, "unit", ["rem", "px"], { label: "Unit" }), t.number(s, "root", { label: "Root size", unit: "px", min: 1 })),
    );
    const formula = h("div", { class: "tt-formula" });
    t.controls(formula);
    const slider = h("input", { type: "range", class: "tt-vw" });
    slider.addEventListener("input", () => { s.vw = Number(slider.value); t.draw(); });
    const label = h("span", { class: "tk-mono" });
    const box = t.stage({ center: false });
    return () => {
      const lo = Math.min(s.minVw, s.maxVw) - 200, hi = Math.max(s.minVw, s.maxVw) + 200;
      slider.min = Math.max(200, lo); slider.max = hi; slider.value = s.vw;
      const expr = clampExpr(s.min, s.max, s.minVw, s.maxVw, s.unit, s.root);
      const now = clampAt(s.min, s.max, s.minVw, s.maxVw, s.vw);
      label.textContent = `${s.vw}px wide → ${round(now, 1)}px`;
      const slope = s.maxVw === s.minVw ? 0 : (s.max - s.min) / (s.maxVw - s.minVw);
      formula.replaceChildren(t.note(`Grows ${round(slope * 100, 3)}px for every 100px of screen width, starting at ${round(s.min - slope * s.minVw, 2)}px on a 0px screen, and stays between ${Math.min(s.min, s.max)}px and ${Math.max(s.min, s.max)}px.`));
      const p = `${now}px`;
      const demo = s.prop === "font-size" ? h("p", { class: "tt-clamp__text", style: { fontSize: p } }, "Fluid heading")
        : s.prop === "padding" ? h("div", { class: "tt-clamp__pad", style: { padding: p } }, h("div", {}, "content"))
        : s.prop === "margin-block" ? h("div", { class: "tt-clamp__stack" }, h("div", {}, "A"), h("div", { style: { marginBlock: p } }, "B"), h("div", {}, "C"))
        : s.prop === "gap" ? h("div", { class: "tt-clamp__gap", style: { gap: p } }, h("div", {}), h("div", {}), h("div", {}))
        : s.prop === "width" ? h("div", { class: "tt-clamp__bar", style: { width: p } }, `${round(now)}px`)
        : h("div", { class: "tt-clamp__radius", style: { borderRadius: p } });
      box.replaceChildren(h("label", { class: "tk-field tt-clamp__vw" }, h("span", { class: "tk-label" }, h("span", {}, "Screen width"), label), slider), demo);
      t.out({ decl: `${s.prop}: ${expr};`, name: `fluid-${s.prop.replace(/-.*/, "")}` });
    };
  },
};

export const tools = [pairing, fluidType, pxRem, clampTool];

export const styles = `
.tt-pairs { display: grid; gap: 0.3rem; max-height: 21rem; overflow: auto; padding: 0.15rem; }
.tt-pair { display: grid; gap: 0.1rem; text-align: left; padding: 0.45rem 0.65rem; border-radius: 6px; }
.tt-pair[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--select); }
.tt-pair__h { font-size: 1.15rem; line-height: 1.15; }
.tt-pair__b { font-size: 0.82rem; color: var(--ink-soft); }
.tt-specimen { display: grid; gap: 0.6rem; }
.tt-specimen h1 { margin: 0; font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1.02; letter-spacing: -0.01em; }
.tt-specimen h2 { margin: 0.4rem 0 0; font-size: 1.45rem; line-height: 1.15; }
.tt-specimen p { margin: 0; font-size: 1rem; line-height: 1.6; max-width: 60ch; }
.tt-specimen__meta { font: 0.74rem var(--mono) !important; opacity: 0.6; }
.tt-steps { display: grid; gap: 0.2rem; overflow: hidden; border: 1px solid var(--rule); border-radius: 8px; padding: 0.75rem 1rem; background: var(--paper); }
.tt-step { display: grid; gap: 0.1rem; padding: 0.35rem 0; border-bottom: 1px solid var(--rule); }
.tt-step:last-child { border-bottom: 0; }
.tt-step__meta { margin: 0; font-size: 0.74rem; color: var(--ink-soft); }
.tt-step__meta code { font-family: var(--mono); color: var(--ink); }
.tt-step__sample { margin: 0; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--display); }
.tt-vw { width: 100%; accent-color: var(--accent); }
.tt-load { display: flex; gap: 0.35rem; }
.tt-load select { flex: 1; min-width: 0; font-family: var(--mono); font-size: 0.8rem; }
.tt-table { display: grid; gap: 0.4rem; width: 100%; }
.tt-table__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr)); gap: 0.3rem; }
.tt-table__grid button { display: flex; justify-content: space-between; gap: 0.4rem; padding: 0.3rem 0.5rem; font-size: 0.8rem; }
.tt-table__grid code { font-family: var(--mono); font-size: 0.76rem; color: var(--ink-soft); }
.tt-formula { padding: 0.6rem 0.7rem; background: var(--paper-2); border-radius: 6px; }
.tt-clamp__vw { width: 100%; margin-bottom: 1.25rem; }
.tt-clamp__text { margin: 0; font-weight: 700; line-height: 1.05; font-family: var(--display); }
.tt-clamp__pad { background: oklch(58% 0.17 40 / 0.18); border-radius: 4px; }
.tt-clamp__pad > div, .tt-clamp__stack > div, .tt-clamp__gap > div { padding: 0.6rem; background: currentColor; color: inherit; border-radius: 3px; }
.tt-clamp__pad > div { background: rgb(128 128 128 / 0.25); text-align: center; font-size: 0.8rem; }
.tt-clamp__stack > div { background: rgb(128 128 128 / 0.25); font-size: 0.8rem; }
.tt-clamp__gap { display: flex; }
.tt-clamp__gap > div { flex: 1; height: 4rem; background: oklch(58% 0.17 40 / 0.5); }
.tt-clamp__bar { max-width: 100%; padding: 0.5rem; background: oklch(58% 0.17 40 / 0.5); border-radius: 3px; font: 0.8rem var(--mono); }
.tt-clamp__radius { width: 10rem; height: 7rem; background: oklch(58% 0.17 40 / 0.5); }
`;
