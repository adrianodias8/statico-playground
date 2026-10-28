// What every tool is made of: controls bound to a plain state object, a
// preview stage, and an output the drawer can copy, add to the project's
// stylesheet or apply to the element selected in the preview (index.js).
// Also the colour maths several tools share.
//
// A tool is { id, name, group, blurb, keywords?, styles?, render(t) }.
// render builds the controls once and returns draw(), which runs after every
// change and ends with t.out({...}).

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}

let uid = 0;
const nextId = () => `tk${++uid}`;
export const round = (n, d = 2) => { const f = 10 ** d; const r = Math.round(n * f) / f; return Object.is(r, -0) ? 0 : r; };
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
// "box-shadow: a; color: b;" → "  box-shadow: a;\n  color: b;"
export const indent = (decl, pad = "  ") => decl.trim().split("\n").map((l) => pad + l.trim()).join("\n");
export const rule = (selector, decl) => `${selector} {\n${indent(decl)}\n}`;

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = h("textarea", { style: { position: "fixed", opacity: "0" } });
  ta.value = text;
  document.body.append(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  return ok;
}
export function download(name, data, type = "application/octet-stream") {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const readFileAs = (file, how = "arrayBuffer") => (how === "text" ? file.text() : how === "dataURL" ? new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); }) : file.arrayBuffer().then((b) => new Uint8Array(b)));

export class Kit {
  constructor(host, tool, slots) {
    this.host = host;
    this.tool = tool;
    this.slots = slots; // { controls, stage, body }
    this.syncs = [];
    this.draw = () => {};
    this.onOut = () => {};
  }

  // ---- Layout
  controls(...els) { this.slots.controls.append(...els.flat().filter(Boolean)); return this; }
  add(...els) { this.slots.body.append(...els.flat().filter(Boolean)); return this; }
  group(title, ...els) { return h("div", { class: "tk-group" }, title ? h("p", { class: "tk-group__title" }, title) : null, ...els); }
  row(...els) { return h("div", { class: "tk-row" }, ...els); }
  note(text) { return h("p", { class: "tk-note" }, text); }
  button(label, onclick, extra = {}) { return h("button", { type: "button", onclick, ...extra }, label); }

  // A preview area. Light / dark / checker backgrounds unless o.plain.
  stage(o = {}) {
    const inner = h("div", { class: `tk-stage__inner${o.center === false ? "" : " tk-stage__inner--center"}`, style: o.height ? { minHeight: o.height } : null });
    const wrap = h("div", { class: "tk-stage", "data-bg": o.bg || "light" }, inner);
    if (!o.plain) {
      const sw = h("div", { class: "tk-stage__bg", role: "group", "aria-label": "Preview background" });
      for (const bg of ["light", "dark", "checker"]) {
        sw.append(h("button", { type: "button", title: `${bg[0].toUpperCase()}${bg.slice(1)} background`, "aria-pressed": String(bg === (o.bg || "light")), "data-swatch": bg, onclick: () => { wrap.dataset.bg = bg; sw.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.swatch === bg))); } }));
      }
      wrap.append(sw);
    }
    this.slots.stage.append(wrap);
    return inner;
  }

  // ---- Controls. Each reads s[key], writes it back on input, then redraws.
  field(label, input, extra) {
    return h("label", { class: "tk-field" }, h("span", { class: "tk-label" }, h("span", {}, label), extra || null), input);
  }
  range(s, key, o = {}) {
    const { min = 0, max = 100, step = 1, unit = "" } = o;
    const slider = h("input", { type: "range", min, max, step });
    const num = h("input", { type: "number", class: "tk-num", step: "any", "aria-label": `${o.label || key} value` });
    const set = (v) => { s[key] = v; slider.value = v; num.value = v; };
    slider.addEventListener("input", () => { set(Number(slider.value)); this.draw(); });
    num.addEventListener("input", () => { if (num.value === "" || Number.isNaN(Number(num.value))) return; s[key] = Number(num.value); slider.value = s[key]; this.draw(); });
    this.syncs.push(() => { slider.value = s[key]; num.value = s[key]; });
    slider.value = s[key]; num.value = s[key];
    return h("div", { class: "tk-field" }, h("span", { class: "tk-label" }, h("span", {}, o.label ?? key)), h("div", { class: "tk-range" }, slider, h("span", { class: "tk-numwrap" }, num, unit ? h("span", { class: "tk-unit" }, unit) : null)));
  }
  number(s, key, o = {}) {
    const input = h("input", { type: "number", step: o.step ?? "any", min: o.min, max: o.max, class: "tk-input" });
    input.value = s[key];
    input.addEventListener("input", () => { if (input.value === "" || Number.isNaN(Number(input.value))) return; s[key] = Number(input.value); this.draw(); });
    this.syncs.push(() => { input.value = s[key]; });
    return this.field(o.label ?? key, o.unit ? h("span", { class: "tk-numwrap tk-numwrap--wide" }, input, h("span", { class: "tk-unit" }, o.unit)) : input);
  }
  text(s, key, o = {}) {
    const input = o.area ? h("textarea", { rows: o.rows || 4, class: `tk-input${o.mono ? " tk-mono" : ""}`, spellcheck: o.mono ? "false" : null }) : h("input", { type: "text", class: `tk-input${o.mono ? " tk-mono" : ""}`, spellcheck: o.mono ? "false" : null });
    input.value = s[key] ?? "";
    if (o.placeholder) input.placeholder = o.placeholder;
    input.addEventListener("input", () => { s[key] = input.value; this.draw(); });
    this.syncs.push(() => { if (input.value !== (s[key] ?? "")) input.value = s[key] ?? ""; });
    return o.bare ? input : this.field(o.label ?? key, input);
  }
  select(s, key, options, o = {}) {
    const sel = h("select", { class: "tk-input" }, options.map((op) => { const [v, l] = Array.isArray(op) ? op : [op, op]; return h("option", { value: v }, l); }));
    sel.value = s[key];
    sel.addEventListener("change", () => { s[key] = typeof s[key] === "number" ? Number(sel.value) : sel.value; this.draw(); });
    this.syncs.push(() => { sel.value = s[key]; });
    return o.bare ? sel : this.field(o.label ?? key, sel);
  }
  seg(s, key, options, o = {}) {
    const box = h("div", { class: "tk-seg", role: "group", "aria-label": o.label ?? key });
    const paint = () => box.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === String(s[key]))));
    for (const op of options) {
      const [v, l] = Array.isArray(op) ? op : [op, op];
      box.append(h("button", { type: "button", "data-v": String(v), onclick: () => { s[key] = v; paint(); this.draw(); } }, l));
    }
    paint();
    this.syncs.push(paint);
    return o.bare ? box : h("div", { class: "tk-field" }, h("span", { class: "tk-label" }, o.label ?? key), box);
  }
  toggle(s, key, o = {}) {
    const input = h("input", { type: "checkbox" });
    input.checked = !!s[key];
    input.addEventListener("change", () => { s[key] = input.checked; this.draw(); });
    this.syncs.push(() => { input.checked = !!s[key]; });
    return h("label", { class: "tk-toggle" }, input, h("span", {}, o.label ?? key));
  }
  // Any CSS colour in the text box; the swatch picks in hex.
  color(s, key, o = {}) {
    const swatch = h("input", { type: "color", "aria-label": `${o.label ?? key} picker` });
    const input = h("input", { type: "text", class: "tk-input tk-mono", spellcheck: "false" });
    const paint = () => { const c = parseColor(s[key]); if (c) swatch.value = toHex({ ...c, a: 1 }); input.value = s[key]; input.classList.remove("tk-bad"); };
    swatch.addEventListener("input", () => { const old = parseColor(s[key]); s[key] = old && old.a < 1 ? toHex({ ...parseColor(swatch.value), a: old.a }) : swatch.value; input.value = s[key]; this.draw(); });
    input.addEventListener("input", () => {
      const c = parseColor(input.value);
      input.classList.toggle("tk-bad", !c);
      if (!c) return;
      s[key] = input.value.trim();
      swatch.value = toHex({ ...c, a: 1 });
      this.draw();
    });
    paint();
    this.syncs.push(paint);
    return this.field(o.label ?? key, h("span", { class: "tk-color" }, swatch, input));
  }
  // Preset buttons: apply(s) changes the state, then every control catches up.
  presets(items, o = {}) {
    return h("div", { class: "tk-presets", role: "group", "aria-label": o.label || "Presets" }, o.label === false ? null : h("span", { class: "tk-label" }, o.label || "Presets"), h("div", { class: "tk-presets__list" }, items.map((p) => h("button", { type: "button", title: p.title || p.label, onclick: () => { p.apply(); this.sync(); this.draw(); } }, p.swatch ? h("span", { class: "tk-presets__swatch", style: { background: p.swatch } }) : null, p.label))));
  }
  // A list of items with add and remove: item(entry, i) returns its controls.
  repeat(list, { make, item, min = 1, max = 12, label = "Add" }) {
    const box = h("div", { class: "tk-repeat" });
    const paint = () => {
      box.replaceChildren(...list.map((entry, i) => h("div", { class: "tk-repeat__item" },
        h("div", { class: "tk-repeat__head" }, h("span", { class: "tk-label" }, `${i + 1}`),
          list.length > min ? h("button", { type: "button", class: "tk-x", "aria-label": `Remove ${i + 1}`, onclick: () => { list.splice(i, 1); paint(); this.draw(); } }, "✕") : null),
        item(entry, i))));
      if (list.length < max) box.append(h("button", { type: "button", class: "tk-add", onclick: () => { list.push(make(list)); paint(); this.draw(); } }, `+ ${label}`));
    };
    paint();
    this.syncs.push(paint);
    return box;
  }
  sync() { for (const f of this.syncs) f(); }

  // ---- Output: see index.js for what the drawer does with each part.
  //   decl  declarations for one element; shown as .name { decl }
  //   css   more rules; ".{cls}" in them becomes the class name
  //   name  suggested class name;  root: true → decl goes in :root
  //   html  a snippet;  tabs [{label, code}] more views;  text  a plain result
  //   actions [{label, run, primary?}] buttons of the tool's own
  out(o) { this.onOut(o); }
  copy(text) { return copyText(text).then((ok) => this.host.notify(ok ? "Copied" : "Couldn't copy", ok ? "ok" : "error")); }
  download(name, data, type) { download(name, data, type); }
}

// ==== Colour ==================================================================
// Colours are { r, g, b, a }: sRGB channels 0–255 (not rounded), alpha 0–1.

let namer = null;
export function parseColor(input) {
  if (input == null) return null;
  const str = String(input).trim().toLowerCase();
  if (!str) return null;
  let m;
  if ((m = str.match(/^#([0-9a-f]{3,8})$/)) && [3, 4, 6, 8].includes(m[1].length)) {
    let hex = m[1];
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
    const n = (i) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? round(n(6) / 255, 3) : 1 };
  }
  if ((m = str.match(/^([a-z]+)\((.*)\)$/))) {
    const fn = m[1];
    const parts = m[2].replace(/,/g, " ").replace(/\//g, " / ").trim().split(/\s+/);
    const slash = parts.indexOf("/");
    let alphaStr = null;
    if (slash >= 0) { alphaStr = parts[slash + 1]; parts.splice(slash); }
    else if (parts.length === 4) alphaStr = parts.pop();
    if (parts.length !== 3) return null;
    const a = alphaStr == null ? 1 : alphaStr.endsWith("%") ? parseFloat(alphaStr) / 100 : parseFloat(alphaStr);
    const pct = (v, scale) => (v.endsWith("%") ? (parseFloat(v) / 100) * scale : parseFloat(v));
    const hue = (v) => (v.endsWith("turn") ? parseFloat(v) * 360 : v.endsWith("rad") ? (parseFloat(v) * 180) / Math.PI : parseFloat(v));
    let c = null;
    if (fn === "rgb" || fn === "rgba") c = { r: pct(parts[0], 255), g: pct(parts[1], 255), b: pct(parts[2], 255) };
    else if (fn === "hsl" || fn === "hsla") c = hslToRgb(hue(parts[0]), pct(parts[1], 100), pct(parts[2], 100));
    else if (fn === "hwb") c = hwbToRgb(hue(parts[0]), pct(parts[1], 100), pct(parts[2], 100));
    else if (fn === "oklch") c = oklchToRgb(pct(parts[0], 1), pct(parts[1], 0.4), parts[2] === "none" ? 0 : hue(parts[2]));
    else if (fn === "oklab") c = oklabToRgb(pct(parts[0], 1), pct(parts[1], 0.4), pct(parts[2], 0.4));
    if (!c || [c.r, c.g, c.b, a].some((x) => Number.isNaN(x))) return null;
    return { ...c, a: clamp(a, 0, 1) };
  }
  if (/^[a-z]+$/.test(str)) {
    if (str === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    namer ??= document.createElement("canvas").getContext("2d");
    namer.fillStyle = "#010203";
    namer.fillStyle = str;
    if (namer.fillStyle === "#010203" && str !== "#010203") return null;
    return parseColor(namer.fillStyle);
  }
  return null;
}

const to255 = (x) => clamp(Math.round(x), 0, 255);
const hex2 = (n) => to255(n).toString(16).padStart(2, "0");
export const toHex = ({ r, g, b, a = 1 }) => `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 1 ? hex2(a * 255) : ""}`;
export const toRgbString = ({ r, g, b, a = 1 }) => (a < 1 ? `rgb(${to255(r)} ${to255(g)} ${to255(b)} / ${round(a, 3)})` : `rgb(${to255(r)} ${to255(g)} ${to255(b)})`);
export function toHslString(c) {
  const { h: hh, s, l } = rgbToHsl(c);
  return `hsl(${round(hh, 1)} ${round(s, 1)}% ${round(l, 1)}%${c.a < 1 ? ` / ${round(c.a, 3)}` : ""})`;
}
export function toOklchString(c) {
  const { l, c: ch, h: hh } = rgbToOklch(c);
  return `oklch(${round(l * 100, 2)}% ${round(ch, 4)} ${ch < 0.0002 ? 0 : round(hh, 2)}${c.a < 1 ? ` / ${round(c.a, 3)}` : ""})`;
}
export function toOklabString(c) {
  const { l, a, b } = rgbToOklab(c);
  return `oklab(${round(l * 100, 2)}% ${round(a, 4)} ${round(b, 4)}${c.a < 1 ? ` / ${round(c.a, 3)}` : ""})`;
}
export const formatColor = (c, as = "hex") => ({ hex: toHex, rgb: toRgbString, hsl: toHslString, oklch: toOklchString, oklab: toOklabString }[as] || toHex)(c);

export function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let hh = 0, s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    hh = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh = (hh * 60 + 360) % 360;
  }
  return { h: hh, s: s * 100, l: l * 100 };
}
export function hslToRgb(hh, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + hh / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: 1 };
}
function hwbToRgb(hh, w, bl) {
  w /= 100; bl /= 100;
  if (w + bl >= 1) { const g = (w / (w + bl)) * 255; return { r: g, g, b: g, a: 1 }; }
  const c = hslToRgb(hh, 100, 50);
  const f = (x) => (x / 255) * (1 - w - bl) * 255 + w * 255;
  return { r: f(c.r), g: f(c.g), b: f(c.b), a: 1 };
}

const lin = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const gam = (x) => 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
export function rgbToOklab({ r, g, b }) {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return { l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s };
}
// Unclamped linear sRGB, so callers can tell when a colour is out of gamut
function oklabToLinear(L, A, B) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
export function oklabToRgb(L, A, B) {
  const [r, g, b] = oklabToLinear(L, A, B).map((x) => clamp(gam(clamp(x, 0, 1)), 0, 255));
  return { r, g, b, a: 1 };
}
export function rgbToOklch(c) {
  const { l, a, b } = rgbToOklab(c);
  return { l, c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
}
export function inGamut(l, c, hh) {
  const rad = (hh * Math.PI) / 180;
  return oklabToLinear(l, c * Math.cos(rad), c * Math.sin(rad)).every((x) => x >= -0.0001 && x <= 1.0001);
}
// OKLCH to sRGB; out-of-gamut colours keep lightness and hue and lose chroma
export function oklchToRgb(l, c, hh) {
  l = clamp(l, 0, 1);
  if (!inGamut(l, c, hh)) {
    let lo = 0, hi = c;
    for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(l, mid, hh)) lo = mid; else hi = mid; }
    c = lo;
  }
  const rad = (hh * Math.PI) / 180;
  return oklabToRgb(l, c * Math.cos(rad), c * Math.sin(rad));
}
export function maxChroma(l, hh) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(l, mid, hh)) lo = mid; else hi = mid; }
  return lo;
}

// WCAG 2 relative luminance and contrast; a translucent foreground is
// composited over the background first.
export const luminance = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export function over(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}
export function contrast(fg, bg) {
  const solidBg = (bg.a ?? 1) < 1 ? over(bg, { r: 255, g: 255, b: 255 }) : bg;
  const f = luminance(over(fg, solidBg)), b = luminance(solidBg);
  return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
}
// Mix in OKLab, t = 0 → a, t = 1 → b
export function mix(c1, c2, t) {
  const x = rgbToOklab(c1), y = rgbToOklab(c2);
  return { ...oklabToRgb(x.l + (y.l - x.l) * t, x.a + (y.a - x.a) * t, x.b + (y.b - x.b) * t), a: (c1.a ?? 1) + ((c2.a ?? 1) - (c1.a ?? 1)) * t };
}
export const readableOn = (bg) => (contrast({ r: 255, g: 255, b: 255, a: 1 }, bg) >= contrast({ r: 0, g: 0, b: 0, a: 1 }, bg) ? "#fff" : "#000");

// The colours a project's stylesheets define: custom properties first, then
// hex literals, so colour tools can start from the site's own palette.
export function projectColors(host, limit = 24) {
  const found = new Map();
  const files = host.cssFiles();
  for (const f of files) {
    for (const m of (host.read(f) || "").matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) {
      const v = m[2].trim();
      if (!found.has(v) && !/var\(/.test(v) && parseColor(v)) found.set(v, { name: m[1], value: v, file: f });
    }
  }
  for (const f of files) {
    for (const m of (host.read(f) || "").matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      if (!found.has(m[0]) && parseColor(m[0])) found.set(m[0], { name: m[0], value: m[0], file: f });
    }
  }
  return [...found.values()].slice(0, limit);
}
