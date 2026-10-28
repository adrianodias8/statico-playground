// Utilities: an SVG optimizer, Base64 and data URIs, lorem ipsum, placeholder
// images, favicons (written into public/ with their <head> tags) and CSS
// loaders. The string work is plain functions, exported for tests.
import { h, readFileAs, parseColor, toHex, round } from "./kit.js";

const MIME = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", ico: "image/x-icon", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf", css: "text/css", js: "text/javascript", json: "application/json", html: "text/html", txt: "text/plain", md: "text/markdown", xml: "application/xml", pdf: "application/pdf", mp4: "video/mp4", webm: "video/webm" };
const extOf = (p) => (p.match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
export const mimeOf = (p) => MIME[extOf(p)] || "application/octet-stream";
const kb = (n) => (n < 1024 ? `${n} B` : `${round(n / 1024, 1)} KB`);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
const freePath = (host, path) => { let p = path; for (let n = 2; host.read(p) !== null || host.bytes(p); n++) p = path.replace(/(\.[^.]+)?$/, `-${n}$1`); return p; };

// A hidden file input behind a button
function uploader(label, accept, onfile) {
  const input = h("input", { type: "file", accept, hidden: true });
  input.addEventListener("change", () => { if (input.files[0]) onfile(input.files[0]); input.value = ""; });
  return h("span", {}, h("button", { type: "button", onclick: () => input.click() }, label), input);
}
// A select of project files, refreshed whenever it's opened
function projectPicker(host, test, placeholder, onpick) {
  const sel = h("select", { class: "tk-input" });
  const fill = () => {
    const keep = sel.value;
    sel.replaceChildren(h("option", { value: "" }, placeholder), ...host.files().filter(test).map((p) => h("option", { value: p }, p)));
    sel.value = keep;
  };
  fill();
  sel.addEventListener("focus", fill);
  sel.addEventListener("pointerdown", fill);
  sel.addEventListener("change", () => { if (sel.value) onpick(sel.value); });
  return sel;
}
const imageTest = (p) => /\.(png|jpe?g|svg|webp|gif|avif)$/i.test(p);

// ==== SVG optimizer ===========================================================

export function fmtNum(n, d, compact) {
  let s = d == null ? String(n) : String(+n.toFixed(d));
  if (s === "-0") s = "0";
  return compact ? s.replace(/^(-?)0\./, "$1.") : s;
}
// Numbers only: never digits that belong to a word, an id or a hex colour
export const roundNums = (str, d, compact) => str.replace(/(?<![#a-z_])-?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi, (m) => fmtNum(parseFloat(m), d, compact));

const ARGC = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
export function parsePath(d) {
  const segs = [];
  const num = /[\s,]*([-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?)/y;
  const flag = /[\s,]*([01])/y;
  const cmdRe = /[\s,]*([MmZzLlHhVvCcSsQqTtAa])/y;
  let i = 0, cmd = null;
  while (i < d.length) {
    if (/^[\s,]*$/.test(d.slice(i))) break;
    cmdRe.lastIndex = i;
    const c = cmdRe.exec(d);
    if (c) {
      i = cmdRe.lastIndex;
      cmd = c[1];
      if (cmd === "z" || cmd === "Z") { segs.push({ cmd, args: [] }); continue; }
    } else if (!cmd || cmd === "z" || cmd === "Z") throw new Error(`Bad path data near “${d.slice(i, i + 12)}”`);
    const n = ARGC[cmd.toLowerCase()];
    const args = [];
    for (let k = 0; k < n; k++) {
      const re = cmd.toLowerCase() === "a" && (k === 3 || k === 4) ? flag : num;
      re.lastIndex = i;
      const m = re.exec(d);
      if (!m) throw new Error(`Bad path data near “${d.slice(i, i + 12)}”`);
      args.push(parseFloat(m[1]));
      i = re.lastIndex;
    }
    segs.push({ cmd, args });
    if (cmd === "M") cmd = "L"; else if (cmd === "m") cmd = "l"; // pairs after a moveto are linetos
  }
  return segs;
}
export function formatPath(d, decimals, compact) {
  let out = "", prev = null, last = null;
  for (const { cmd, args } of parsePath(d)) {
    const implicit = compact && !/[mMzZ]/.test(cmd) && (cmd === prev || (cmd === "L" && prev === "M") || (cmd === "l" && prev === "m"));
    if (!implicit) { out += (compact || !out ? "" : " ") + cmd; last = null; }
    for (const [k, v] of args.entries()) {
      const s = cmd.toLowerCase() === "a" && (k === 3 || k === 4) ? String(v) : fmtNum(v, decimals, compact);
      // A space between numbers, unless a sign or a second decimal point already separates them
      if (last !== null && !(compact && (s.startsWith("-") || (s.startsWith(".") && /[.e]/i.test(last))))) out += " ";
      out += s;
      last = s;
    }
    prev = cmd;
  }
  return out;
}
export function shortColor(v) {
  return v.replace(/rgba?\([^)]*\)/gi, (m) => { const c = parseColor(m); return c ? toHex(c) : m; })
    .replace(/#([0-9a-f]{6}|[0-9a-f]{8})\b/gi, (m, hex) => {
      const x = hex.toLowerCase();
      return /^(.)\1(.)\2(.)\3(?:(.)\4)?$/.test(x) ? `#${x[0]}${x[2]}${x[4]}${x.length === 8 ? x[6] : ""}` : `#${x}`;
    })
    .replace(/#([0-9a-f]{3,4})\b/gi, (m) => m.toLowerCase());
}
export function stripText(src, o) {
  let s = src;
  if (o.prolog) s = s.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[^>[]*(\[[\s\S]*?\])?\s*>/gi, "");
  if (o.comments) s = s.replace(/<!--[\s\S]*?-->/g, "");
  return s.trim();
}

const EDITOR_NS = /inkscape|sodipodi|sketch|serif|figma|adobe|illustrator|bohemian/i;
const DEFAULTS = { "fill-opacity": "1", "stroke-opacity": "1", opacity: "1", "stroke-width": "1", "fill-rule": "nonzero", "clip-rule": "nonzero", "stroke-linecap": "butt", "stroke-linejoin": "miter", "stroke-miterlimit": "4", "stroke-dasharray": "none", "stroke-dashoffset": "0", display: "inline", visibility: "visible", "font-style": "normal", "font-weight": "normal" };
const COLOR_ATTRS = ["fill", "stroke", "stop-color", "color", "flood-color", "lighting-color"];
const NUM_ATTRS = ["x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "fx", "fy", "points", "viewBox", "transform", "gradientTransform", "patternTransform", "offset", "stroke-width", "font-size", "stroke-dashoffset", "stroke-dasharray", "opacity", "fill-opacity", "stroke-opacity", "stop-opacity"];

export function optimizeSvg(src, o) {
  const doc = new DOMParser().parseFromString(stripText(src, o), "image/svg+xml");
  const err = doc.querySelector("parsererror");
  const root = doc.documentElement;
  if (err || root.localName !== "svg") throw new Error(err ? "This isn't valid SVG (the XML doesn't parse)." : "There's no <svg> element here.");
  const els = () => [root, ...root.querySelectorAll("*")];
  if (o.metadata) for (const el of els()) if (el.localName === "metadata" || el.localName === "namedview" || (el.namespaceURI && EDITOR_NS.test(el.namespaceURI))) el.remove();
  if (o.editors) {
    for (const el of els()) {
      for (const a of [...el.attributes]) {
        const editorNs = (a.prefix && EDITOR_NS.test(a.prefix)) || (a.namespaceURI && EDITOR_NS.test(a.namespaceURI) && a.namespaceURI !== "http://www.w3.org/2000/xmlns/");
        const decl = a.prefix === "xmlns" && EDITOR_NS.test(a.value + a.localName);
        if (editorNs || decl || /^data-(figma|name|sketch)/.test(a.name) || a.name === "enable-background" || a.name === "xml:space" && !root.querySelector("text")) el.removeAttribute(a.name);
      }
    }
    for (const n of ["version", "baseProfile"]) root.removeAttribute(n);
    if (!root.querySelector("[*|href]") && !/xlink:/.test(root.innerHTML)) root.removeAttribute("xmlns:xlink");
  }
  if (o.defaults) {
    for (const el of els()) {
      for (const [name, def] of Object.entries(DEFAULTS)) {
        if (el.getAttribute(name) !== def) continue;
        let p = el.parentElement, inherited = false;
        while (p) { if (p.hasAttribute(name)) { inherited = true; break; } p = p.parentElement; }
        if (!inherited) el.removeAttribute(name);
      }
    }
    if (root.getAttribute("x") === "0") root.removeAttribute("x");
    if (root.getAttribute("y") === "0") root.removeAttribute("y");
  }
  if (o.empties) {
    for (const el of els()) for (const a of [...el.attributes]) if (a.value.trim() === "" && a.name !== "alt") el.removeAttribute(a.name);
    let changed = true;
    while (changed) {
      changed = false;
      for (const el of [...root.querySelectorAll("g, defs, symbol:not([id]), style")]) {
        if (!el.children.length && !el.textContent.trim()) { el.remove(); changed = true; }
        else if (el.localName === "g" && !el.attributes.length) { el.replaceWith(...el.childNodes); changed = true; }
      }
    }
  }
  if (o.dims) {
    const w = root.getAttribute("width"), hh = root.getAttribute("height");
    if (!root.hasAttribute("viewBox") && /^[\d.]+(px)?$/.test(w || "") && /^[\d.]+(px)?$/.test(hh || "")) root.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(hh)}`);
    if (root.hasAttribute("viewBox")) { root.removeAttribute("width"); root.removeAttribute("height"); }
  }
  for (const el of els()) {
    if (o.colors) {
      for (const n of COLOR_ATTRS) if (el.hasAttribute(n)) el.setAttribute(n, shortColor(el.getAttribute(n)));
      if (el.hasAttribute("style")) el.setAttribute("style", shortColor(el.getAttribute("style")));
    }
    if (el.hasAttribute("style")) {
      const st = el.getAttribute("style").split(";").map((x) => x.trim().replace(/\s*:\s*/, ":")).filter(Boolean).join(";");
      if (st) el.setAttribute("style", o.round ? roundNums(st, o.decimals, o.paths) : st); else el.removeAttribute("style");
    }
    if (el.hasAttribute("d") && (o.round || o.paths)) {
      try { el.setAttribute("d", formatPath(el.getAttribute("d"), o.round ? o.decimals : null, o.paths)); } catch {}
    }
    if (o.round) for (const n of NUM_ATTRS) if (el.hasAttribute(n)) el.setAttribute(n, roundNums(el.getAttribute(n), o.decimals, o.paths));
  }
  let out = new XMLSerializer().serializeToString(root);
  if (o.whitespace) {
    out = root.querySelector("text, textPath, tspan")
      ? out.replace(/>\s*\n\s*</g, "><")
      : out.replace(/>\s+</g, "><").replace(/\s+\/>/g, "/>").replace(/[ \t\r\n]{2,}/g, " ");
  }
  return out.trim();
}

const svgOptimizer = {
  id: "svg-optimizer",
  name: "SVG optimizer",
  group: "Utilities",
  blurb: "Shrink an SVG: drop editor leftovers, round numbers, tighten path data. Paste it, upload it, or pick one from the project and save it back.",
  keywords: "svg minify compress icon",
  wide: true,
  render(t) {
    const s = { src: "", from: "", name: "image.svg", prolog: true, comments: true, metadata: true, editors: true, defaults: true, empties: true, whitespace: true, colors: true, round: true, decimals: 2, paths: true, dims: false };
    const load = (text, from, name) => { s.src = text; s.from = from; s.name = name; t.sync(); t.draw(); };
    const picker = projectPicker(t.host, (p) => p.endsWith(".svg"), "Pick an SVG from the project…", (p) => load(t.host.read(p) ?? new TextDecoder().decode(t.host.bytes(p)), p, p.split("/").pop()));
    t.controls(t.row(
      h("div", { class: "tk-field" }, h("span", { class: "tk-label" }, "From the project"), picker),
      h("div", { class: "tk-field" }, h("span", { class: "tk-label" }, "Or a file"), uploader("Upload an SVG…", ".svg,image/svg+xml", async (f) => load(await f.text(), "", f.name))),
    ));
    const src = t.text(s, "src", { label: "SVG source", area: true, rows: 7, mono: true, placeholder: "<svg …>…</svg>" });
    src.querySelector("textarea").addEventListener("input", () => { s.from = ""; });
    t.controls(src, t.row(
      t.group("Remove", t.toggle(s, "prolog", { label: "XML prolog and doctype" }), t.toggle(s, "comments", { label: "Comments" }), t.toggle(s, "metadata", { label: "Metadata elements" }), t.toggle(s, "editors", { label: "Editor data (Inkscape, Sketch, Figma…)" }), t.toggle(s, "defaults", { label: "Attributes set to their default" }), t.toggle(s, "empties", { label: "Empty groups and attributes" }), t.toggle(s, "dims", { label: "width and height (keeps viewBox)" })),
      t.group("Tighten", t.toggle(s, "whitespace", { label: "Collapse whitespace" }), t.toggle(s, "colors", { label: "Shorten colours" }), t.toggle(s, "paths", { label: "Minify path data" }), t.toggle(s, "round", { label: "Round numbers" }), t.range(s, "decimals", { label: "Decimals", min: 0, max: 5 })),
    ));
    const stats = h("p", { class: "tu-stats" });
    const before = h("div", { class: "tu-svgbox" }), after = h("div", { class: "tu-svgbox" });
    const stage = t.stage({ center: false });
    stage.append(stats, h("div", { class: "tu-compare" }, h("figure", {}, before, h("figcaption", {}, "Before")), h("figure", {}, after, h("figcaption", {}, "After"))));
    const show = (box, svg) => { box.replaceChildren(); if (svg) box.append(h("img", { alt: "", src: URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })) })); };
    let lastSrc = null;
    return () => {
      if (!s.src.trim()) { stats.textContent = "Paste an SVG, upload one, or pick one from the project."; before.replaceChildren(); after.replaceChildren(); t.out({}); return; }
      let out;
      try { out = optimizeSvg(s.src, s); } catch (err) { stats.textContent = err.message; after.replaceChildren(); t.out({}); return; }
      const a = new Blob([s.src]).size, b = new Blob([out]).size;
      stats.replaceChildren(h("strong", {}, `${kb(a)} → ${kb(b)}`), `  ${a ? round((1 - b / a) * 100, 1) : 0}% smaller`);
      if (lastSrc !== s.src) { show(before, s.src); lastSrc = s.src; }
      show(after, out);
      const target = s.from || `assets/images/${slug(s.name.replace(/\.svg$/i, "")) || "image"}.svg`;
      t.out({
        text: out, textLabel: "SVG", tabs: [{ label: "Data URI", code: `data:image/svg+xml,${encodeURIComponent(out).replace(/%20/g, " ").replace(/%3D/g, "=").replace(/%3A/g, ":").replace(/%2F/g, "/")}` }],
        actions: [
          s.from
            ? { label: `Save back to ${s.from}`, primary: true, run: () => { t.host.write(s.from, out); s.src = out; t.sync(); t.host.notify(`Saved ${s.from}: ${kb(a)} → ${kb(b)}`); t.draw(); } }
            : { label: `Save to ${target}`, primary: true, run: () => { const p = freePath(t.host, target); t.host.write(p, out); s.from = p; s.src = out; t.sync(); t.host.notify(`Saved ${p}`); t.draw(); } },
          { label: "Download", run: () => t.download(s.name.endsWith(".svg") ? s.name : `${s.name}.svg`, out, "image/svg+xml") },
        ],
      });
    };
  },
};

// ==== Base64 ==================================================================

export function encodeBase64(text, urlSafe) {
  const bytes = new TextEncoder().encode(text);
  return toB64(bytes, urlSafe);
}
export function toB64(bytes, urlSafe) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  const b = btoa(s);
  return urlSafe ? b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : b;
}
export function fromB64(b64) {
  let s = b64.trim().replace(/^data:[^,]*,/, "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export const decodeBase64 = (b64) => new TextDecoder("utf-8", { fatal: true }).decode(fromB64(b64));

const base64 = {
  id: "base64",
  name: "Base64",
  group: "Utilities",
  blurb: "Encode and decode Base64 text, turn any file into a data URI, or turn a data URI back into a file in the project.",
  keywords: "data uri encode decode inline",
  render(t) {
    const s = { mode: "text", dir: "encode", urlSafe: false, input: "Hello, Statico ✨", file: null, name: "", uri: "", savePath: "" };
    const textBox = t.group(null, t.seg(s, "dir", [["encode", "Encode"], ["decode", "Decode"]], { label: "Direction" }), t.toggle(s, "urlSafe", { label: "URL-safe alphabet (- and _, no padding)" }), t.text(s, "input", { label: "Input", area: true, rows: 6, mono: true }));
    const setFile = (bytes, name) => { s.file = bytes; s.name = name; t.draw(); };
    const fileBox = t.group(null,
      h("div", { class: "tk-field" }, h("span", { class: "tk-label" }, "From the project"), projectPicker(t.host, () => true, "Pick a file…", (p) => setFile(t.host.bytes(p), p))),
      h("div", { class: "tk-field" }, h("span", { class: "tk-label" }, "Or from your computer"), uploader("Choose a file…", "", async (f) => setFile(await readFileAs(f), f.name))));
    const uriBox = t.group(null, t.text(s, "uri", { label: "Data URI or Base64", area: true, rows: 6, mono: true, placeholder: "data:image/png;base64,iVBOR…" }), t.text(s, "savePath", { label: "Save as", mono: true, placeholder: "assets/images/decoded.png" }));
    t.controls(t.seg(s, "mode", [["text", "Text"], ["file", "File → data URI"], ["uri", "Data URI → file"]], { label: "What" }), textBox, fileBox, uriBox);
    const stage = t.stage({ height: "10rem" });
    return () => {
      textBox.hidden = s.mode !== "text"; fileBox.hidden = s.mode !== "file"; uriBox.hidden = s.mode !== "uri";
      stage.replaceChildren();
      if (s.mode === "text") {
        let out;
        try { out = s.dir === "encode" ? encodeBase64(s.input, s.urlSafe) : decodeBase64(s.input); } catch { out = null; }
        stage.append(h("p", { class: "tu-stats" }, out === null ? "That isn't Base64 for UTF-8 text." : `${new TextEncoder().encode(s.input).length} → ${new TextEncoder().encode(out).length} bytes`));
        t.out(out === null ? {} : { text: out, textLabel: s.dir === "encode" ? "Base64" : "Text" });
        return;
      }
      if (s.mode === "file") {
        if (!s.file) { stage.append(h("p", { class: "tu-stats" }, "Pick a file to encode.")); t.out({}); return; }
        const type = mimeOf(s.name);
        const uri = `data:${type};base64,${toB64(s.file)}`;
        if (type.startsWith("image/")) stage.append(h("img", { class: "tu-thumb", src: uri, alt: "" }));
        stage.append(h("p", { class: "tu-stats" }, `${s.name}: ${kb(s.file.length)} → ${kb(uri.length)} as a data URI`, uri.length > 32768 ? h("span", { class: "tu-warn" }, " — big for inlining; a file is usually better past ~10 KB.") : null));
        const img = type.startsWith("image/");
        t.out({ text: uri, textLabel: "Data URI", decl: img ? `background-image: url("${uri}");` : undefined, name: "inline-bg", html: img ? `<img src="${uri}" alt="">` : undefined, insert: img });
        return;
      }
      if (!s.uri.trim()) { stage.append(h("p", { class: "tu-stats" }, "Paste a data URI to see and save the file.")); t.out({}); return; }
      let bytes;
      try { bytes = fromB64(s.uri); } catch { stage.append(h("p", { class: "tu-stats tu-warn" }, "That isn't valid Base64.")); t.out({}); return; }
      const type = s.uri.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream";
      const ext = Object.entries(MIME).find(([, v]) => v === type)?.[0] || "bin";
      const path = s.savePath.trim() || `assets/${type.startsWith("image/") ? "images" : "files"}/decoded.${ext}`;
      if (type.startsWith("image/")) stage.append(h("img", { class: "tu-thumb", src: URL.createObjectURL(new Blob([bytes], { type })), alt: "" }));
      stage.append(h("p", { class: "tu-stats" }, `${type}, ${kb(bytes.length)}`));
      t.out({ actions: [
        { label: `Save to ${path}`, primary: true, run: () => { const p = freePath(t.host, path); t.host.write(p, bytes); t.host.notify(`Saved ${p}`); } },
        { label: "Download", run: () => t.download(path.split("/").pop(), new Blob([bytes], { type })) },
      ] });
    };
  },
};

// ==== Lorem ipsum =============================================================

const WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium tincidunt lacus nunc pulvinar sapien ligula scelerisque blandit mauris vitae ultricies leo integer malesuada odio morbi tristique senectus netus fames ac turpis egestas porta nibh venenatis cras semper auctor neque volutpat facilisis viverra feugiat pellentesque habitant vestibulum quam praesent elementum mi proin sagittis nisl rhoncus mattis donec massa tortor condimentum lacinia gravida arcu cursus euismod faucibus vel eros fringilla varius quisque sagittis purus".split(" ");
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}
export function lorem({ unit = "paragraphs", count = 3, start = true, seed = 1 } = {}) {
  const r = rng(seed);
  const pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  let first = start;
  const words = (n) => {
    const out = [];
    if (first) { out.push(..."lorem ipsum dolor sit amet".split(" ").slice(0, n)); first = false; }
    while (out.length < n) { const w = WORDS[Math.floor(r() * WORDS.length)]; if (w !== out.at(-1)) out.push(w); }
    return out;
  };
  const sentence = () => {
    const w = words(pick(6, 14));
    if (w.length > 8 && r() < 0.5) w[pick(3, w.length - 4)] += ",";
    const s = w.join(" ");
    return `${s[0].toUpperCase()}${s.slice(1)}.`;
  };
  const paragraph = () => Array.from({ length: pick(3, 6) }, sentence).join(" ");
  if (unit === "words") { const w = words(count).join(" "); return [w[0].toUpperCase() + w.slice(1)]; }
  if (unit === "sentences") return [Array.from({ length: count }, sentence).join(" ")];
  if (unit === "list") return Array.from({ length: count }, () => sentence().replace(/\.$/, "").split(" ").slice(0, pick(3, 7)).join(" ").replace(/,$/, ""));
  return Array.from({ length: count }, paragraph);
}

const loremTool = {
  id: "lorem",
  name: "Lorem ipsum",
  group: "Utilities",
  blurb: "Placeholder text in words, sentences, paragraphs or list items — as plain text, HTML or Markdown, ready to drop in after the selected element.",
  keywords: "placeholder text dummy filler",
  render(t) {
    const s = { unit: "paragraphs", count: 3, start: true, format: "html", seed: 7 };
    t.controls(
      t.seg(s, "unit", [["paragraphs", "Paragraphs"], ["sentences", "Sentences"], ["words", "Words"], ["list", "List items"]], { label: "Unit" }),
      t.range(s, "count", { label: "How many", min: 1, max: 40 }),
      t.toggle(s, "start", { label: "Start with “Lorem ipsum dolor sit amet”" }),
      t.seg(s, "format", [["plain", "Plain"], ["html", "HTML"], ["markdown", "Markdown"]], { label: "Format" }),
      t.button("Shuffle", () => { s.seed = Math.floor(Math.random() * 1e9); t.draw(); }),
    );
    const stage = t.stage({ center: false });
    return () => {
      const parts = lorem(s);
      const list = s.unit === "list";
      const html = list ? `<ul>\n${parts.map((p) => `  <li>${p}</li>`).join("\n")}\n</ul>` : parts.map((p) => `<p>${p}</p>`).join("\n");
      stage.innerHTML = `<div class="tu-lorem">${html}</div>`;
      const words = parts.join(" ").split(/\s+/).length;
      if (s.format === "html") t.out({ html, tabs: [{ label: "Stats", code: `${words} words, ${parts.join(" ").length} characters` }] });
      else t.out({ text: s.format === "markdown" ? (list ? parts.map((p) => `- ${p}`).join("\n") : parts.join("\n\n")) : (list ? parts.join("\n") : parts.join("\n\n")), textLabel: s.format === "markdown" ? "Markdown" : "Text" });
    };
  },
};

// ==== Placeholder images ======================================================

const xmlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export function placeholderSvg({ w, h: hh, bg, fg, label, size }) {
  const text = label || `${w}×${hh}`;
  const fs = size || Math.max(10, Math.round(Math.min((w * 0.6) / Math.max(text.length * 0.6, 1), hh / 4)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}"><rect width="100%" height="100%" fill="${xmlEsc(bg)}"/><text x="50%" y="50%" fill="${xmlEsc(fg)}" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="${fs}" font-weight="600" text-anchor="middle" dominant-baseline="central">${xmlEsc(text)}</text></svg>`;
}
const canvasBytes = (canvas, type = "image/png", q) => new Promise((res) => canvas.toBlob(async (b) => res(new Uint8Array(await b.arrayBuffer())), type, q));
async function svgToPng(svg, w, hh) {
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  await img.decode();
  const c = h("canvas", { width: w, height: hh });
  c.getContext("2d").drawImage(img, 0, 0, w, hh);
  URL.revokeObjectURL(img.src);
  return canvasBytes(c);
}

const placeholder = {
  id: "placeholder",
  name: "Placeholder",
  group: "Utilities",
  blurb: "Placeholder images at any size and colour, as SVG or PNG, saved straight into assets/images.",
  keywords: "image dummy mock size",
  render(t) {
    const s = { w: 1200, hh: 800, bg: "#e7e5e4", fg: "#78716c", label: "", size: 0, format: "svg" };
    t.controls(
      t.row(t.number(s, "w", { label: "Width", min: 1, unit: "px" }), t.number(s, "hh", { label: "Height", min: 1, unit: "px" })),
      t.presets([[1200, 800, "3:2"], [1600, 900, "16:9"], [1080, 1080, "Square"], [1200, 630, "Social card"], [800, 1000, "Portrait"], [400, 400, "Avatar"]].map(([w, hh, label]) => ({ label, title: `${w}×${hh}`, apply: () => { s.w = w; s.hh = hh; } })), { label: "Sizes" }),
      t.row(t.color(s, "bg", { label: "Background" }), t.color(s, "fg", { label: "Text" })),
      t.text(s, "label", { label: "Text", placeholder: "Width × height" }),
      t.range(s, "size", { label: "Font size (0 = fit)", min: 0, max: 200, unit: "px" }),
      t.seg(s, "format", [["svg", "SVG"], ["png", "PNG"]], { label: "Format" }),
    );
    const stage = t.stage({ plain: true });
    const save = async (use) => {
      const opts = { w: Math.max(1, Math.round(s.w)), h: Math.max(1, Math.round(s.hh)), bg: s.bg, fg: s.fg, label: s.label, size: s.size };
      const svg = placeholderSvg(opts);
      const data = s.format === "png" ? await svgToPng(svg, opts.w, opts.h) : svg;
      const path = freePath(t.host, `assets/images/placeholder-${opts.w}x${opts.h}.${s.format}`);
      t.host.change(() => {
        t.host.write(path, data);
        if (use && t.host.setAttr) t.host.setAttr("src", `/${path}`);
      });
      if (use && !t.host.setAttr) t.host.notify(`Saved ${path}. Set the image's src to /${path} in the inspector.`, "warn");
      else t.host.notify(use ? `Saved ${path} and used it for the image` : `Saved ${path}`);
      return path;
    };
    return () => {
      const opts = { w: Math.max(1, Math.round(s.w)), h: Math.max(1, Math.round(s.hh)), bg: s.bg, fg: s.fg, label: s.label, size: s.size };
      const svg = placeholderSvg(opts);
      stage.replaceChildren(h("img", { class: "tu-ph", src: URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" })), alt: "" }));
      const path = `/assets/images/placeholder-${opts.w}x${opts.h}.${s.format}`;
      const sel = t.host.selection();
      t.out({
        html: `<img src="${path}" width="${opts.w}" height="${opts.h}" alt="" loading="lazy">`,
        insert: false,
        tabs: s.format === "svg" ? [{ label: "SVG", code: svg }] : [],
        actions: [
          { label: "Save to assets/images", primary: true, run: () => save(false) },
          { label: sel?.tag === "img" ? "Use for the selected image" : "Use for selected image", disabled: sel?.tag !== "img", title: sel?.tag === "img" ? `Saves it and points ${sel.label} at it` : "Select an image in the preview first", run: () => save(true) },
          { label: "Download", run: async () => { const svg2 = placeholderSvg(opts); t.download(`placeholder-${opts.w}x${opts.h}.${s.format}`, s.format === "png" ? new Blob([await svgToPng(svg2, opts.w, opts.h)], { type: "image/png" }) : svg2, "image/svg+xml"); } },
        ],
      });
    };
  },
};

// ==== Favicons ================================================================

// An .ico holding PNG images: a 6-byte header, a 16-byte entry per image, then the PNGs
export function buildIco(images) {
  const head = 6 + 16 * images.length;
  const total = head + images.reduce((n, i) => n + i.bytes.length, 0);
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint16(0, 0, true); v.setUint16(2, 1, true); v.setUint16(4, images.length, true);
  let offset = head;
  images.forEach(({ size, bytes }, i) => {
    const e = 6 + 16 * i;
    out[e] = size >= 256 ? 0 : size; out[e + 1] = size >= 256 ? 0 : size; out[e + 2] = 0; out[e + 3] = 0;
    v.setUint16(e + 4, 1, true); v.setUint16(e + 6, 32, true);
    v.setUint32(e + 8, bytes.length, true); v.setUint32(e + 12, offset, true);
    out.set(bytes, offset);
    offset += bytes.length;
  });
  return out;
}

const favicon = {
  id: "favicon",
  name: "Favicons",
  group: "Utilities",
  blurb: "One image in, every icon out: favicon.ico, the Apple touch icon, Android icons and a web manifest, written to public/ with the <head> tags added to your layouts.",
  keywords: "icon ico apple touch manifest pwa",
  render(t) {
    const s = { name: "", type: "", fill: false, bg: "#ffffff", pad: 0, radius: 0, theme: "#ffffff", appName: t.host.site().name || "" };
    let img = null, svgText = null;
    const setSource = async (bytes, name) => {
      const type = mimeOf(name);
      svgText = type === "image/svg+xml" ? new TextDecoder().decode(bytes) : null;
      const el = new Image();
      el.src = URL.createObjectURL(new Blob([bytes], { type }));
      try { await el.decode(); } catch { t.host.notify(`Couldn't read ${name} as an image`, "error"); return; }
      img = el; s.name = name; s.type = type;
      t.draw();
    };
    t.controls(
      h("div", { class: "tk-field" }, h("span", { class: "tk-label" }, "From the project"), projectPicker(t.host, imageTest, "Pick an image…", (p) => setSource(t.host.bytes(p), p))),
      h("div", { class: "tk-field" }, h("span", { class: "tk-label" }, "Or from your computer"), uploader("Upload an image…", "image/*", async (f) => setSource(await readFileAs(f), f.name))),
      t.note("Square works best: at least 512 px, or an SVG."),
      t.toggle(s, "fill", { label: "Fill a background" }),
      t.color(s, "bg", { label: "Background" }),
      t.range(s, "pad", { label: "Padding", min: 0, max: 30, unit: "%" }),
      t.range(s, "radius", { label: "Corner radius", min: 0, max: 50, unit: "%" }),
      t.color(s, "theme", { label: "Theme colour (browser UI)" }),
      t.text(s, "appName", { label: "App name in the manifest" }),
    );
    const stage = t.stage({ center: false });

    const render = (size, solid) => {
      const c = h("canvas", { width: size, height: size });
      const g = c.getContext("2d");
      const r = (s.radius / 100) * size;
      const fill = s.fill || solid;
      if (fill || r) { g.beginPath(); g.roundRect(0, 0, size, size, r); g.clip(); }
      if (fill) { g.fillStyle = s.fill ? s.bg : "#ffffff"; g.fillRect(0, 0, size, size); }
      const box = size * (1 - (2 * s.pad) / 100);
      const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
      const k = Math.min(box / iw, box / ih);
      const w = iw * k, hh = ih * k;
      g.imageSmoothingQuality = "high";
      g.drawImage(img, (size - w) / 2, (size - hh) / 2, w, hh);
      return c;
    };
    const plainSvg = () => svgText && !s.fill && !s.pad && !s.radius;
    async function generate() {
      const png = async (n, solid) => canvasBytes(render(n, solid));
      const [p16, p32, p48, apple, a192, a512] = await Promise.all([png(16), png(32), png(48), png(180, true), png(192), png(512)]);
      const manifest = JSON.stringify({ name: s.appName || "Site", short_name: (s.appName || "Site").slice(0, 12), icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }], theme_color: s.theme, background_color: s.fill ? s.bg : "#ffffff", display: "standalone" }, null, 2);
      return { "public/favicon.ico": buildIco([{ size: 16, bytes: p16 }, { size: 32, bytes: p32 }, { size: 48, bytes: p48 }]), "public/apple-touch-icon.png": apple, "public/icon-192.png": a192, "public/icon-512.png": a512, "public/manifest.webmanifest": `${manifest}\n`, ...(plainSvg() ? { "public/favicon.svg": svgText } : {}) };
    }
    const tags = () => [
      `<link rel="icon" href="/favicon.ico" sizes="32x32">`,
      plainSvg() ? `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` : null,
      `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`,
      `<link rel="manifest" href="/manifest.webmanifest">`,
      `<meta name="theme-color" content="${s.theme}">`,
    ].filter(Boolean).join("\n");
    async function addToSite() {
      const out = await generate();
      const existing = t.host.headTargets().filter((p) => /<link[^>]+rel="(shortcut )?icon"/i.test((t.host.read(p) || "").replace(/<!-- tools:favicon -->[\s\S]*?<!-- \/tools:favicon -->/g, "")));
      try {
        t.host.change(() => {
          for (const [p, data] of Object.entries(out)) t.host.write(p, data);
          t.host.addToHead(tags(), "favicon");
        });
        if (!t.host.bytes("public/favicon.ico")) return; // the host reported why
        t.host.notify(`Wrote ${Object.keys(out).length} icon files to public/ and added the tags${existing.length ? `; ${existing.join(", ")} already link an icon too — remove that one` : ""}`, existing.length ? "warn" : "ok");
      } catch (err) { t.host.notify(err.message, "error"); }
    }
    return () => {
      stage.replaceChildren();
      if (!img) { stage.append(h("p", { class: "tu-stats" }, "Pick or upload an image to start.")); t.out({}); return; }
      const name = t.host.site().name || s.appName || "Your site";
      stage.append(
        h("div", { class: "tu-tab" }, h("span", { class: "tu-tab__icon" }, render(32)), h("span", {}, name), h("span", { class: "tu-tab__x" }, "×")),
        h("div", { class: "tu-icons" },
          ...[[16, "16"], [32, "32"], [48, "48"], [180, "Apple 180", true], [192, "Android 192"], [512, "512"]].map(([n, label, solid]) => {
            const c = render(n, solid);
            c.style.width = c.style.height = `${Math.min(n, 96)}px`;
            if (n <= 48) c.style.imageRendering = "pixelated";
            return h("figure", { class: n === 180 ? "tu-apple" : null }, c, h("figcaption", {}, label));
          })));
      const files = ["favicon.ico", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "manifest.webmanifest", ...(plainSvg() ? ["favicon.svg"] : [])];
      t.out({
        html: tags(), insert: false,
        tabs: [{ label: "Files", code: files.map((f) => `public/${f}`).join("\n") }],
        actions: [
          { label: "Add to site", primary: true, title: "Writes the files to public/ and the tags to every layout's <head>", run: addToSite },
          { label: "Download favicon.ico", run: async () => t.download("favicon.ico", new Blob([(await generate())["public/favicon.ico"]], { type: "image/x-icon" })) },
          { label: "Download PNGs", run: async () => { const g = await generate(); for (const f of ["apple-touch-icon.png", "icon-192.png", "icon-512.png"]) t.download(f, new Blob([g[`public/${f}`]], { type: "image/png" })); } },
        ],
      });
    };
  },
};

// ==== CSS loaders =============================================================

const LOADERS = {
  ring: ["Ring", 0, (S, T, D) => `.{cls} { display: inline-block; width: ${S}px; height: ${S}px; border: ${T}px solid color-mix(in srgb, currentColor 20%, transparent); border-top-color: currentColor; border-radius: 50%; animation: {cls}-spin ${D}s linear infinite; }
@keyframes {cls}-spin { to { transform: rotate(1turn); } }`],
  dual: ["Dual ring", 0, (S, T, D) => `.{cls} { display: inline-block; width: ${S}px; height: ${S}px; border: ${T}px solid; border-color: currentColor transparent; border-radius: 50%; animation: {cls}-spin ${D}s linear infinite; }
@keyframes {cls}-spin { to { transform: rotate(1turn); } }`],
  bounce: ["Bouncing dots", 3, (S, T, D) => `.{cls} { display: inline-flex; align-items: flex-end; gap: ${round(S / 6)}px; height: ${round(S * 0.7)}px; }
.{cls} span { width: ${round(S / 4)}px; height: ${round(S / 4)}px; border-radius: 50%; background: currentColor; animation: {cls}-bounce ${D}s ease-in-out infinite; }
.{cls} span:nth-child(2) { animation-delay: ${round(D * 0.16, 3)}s; }
.{cls} span:nth-child(3) { animation-delay: ${round(D * 0.32, 3)}s; }
@keyframes {cls}-bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-${round(S * 0.45)}px); } }`],
  pulse: ["Pulsing dots", 3, (S, T, D) => `.{cls} { display: inline-flex; align-items: center; gap: ${round(S / 6)}px; }
.{cls} span { width: ${round(S / 4)}px; height: ${round(S / 4)}px; border-radius: 50%; background: currentColor; animation: {cls}-pulse ${D}s ease-in-out infinite both; }
.{cls} span:nth-child(2) { animation-delay: ${round(D * 0.16, 3)}s; }
.{cls} span:nth-child(3) { animation-delay: ${round(D * 0.32, 3)}s; }
@keyframes {cls}-pulse { 0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; } 40% { transform: scale(1); opacity: 1; } }`],
  bars: ["Bars", 5, (S, T, D) => `.{cls} { display: inline-flex; align-items: center; gap: ${round(S / 12, 1)}px; height: ${S}px; }
.{cls} span { width: ${round(S / 8, 1)}px; height: 100%; border-radius: ${round(S / 16, 1)}px; background: currentColor; animation: {cls}-bars ${D}s ease-in-out infinite; }
${[2, 3, 4, 5].map((n) => `.{cls} span:nth-child(${n}) { animation-delay: ${round(D * 0.1 * (n - 1), 3)}s; }`).join("\n")}
@keyframes {cls}-bars { 0%, 40%, 100% { transform: scaleY(0.35); } 20% { transform: scaleY(1); } }`],
  ripple: ["Ripple", 2, (S, T, D) => `.{cls} { position: relative; display: inline-block; width: ${S}px; height: ${S}px; }
.{cls} span { position: absolute; inset: 0; border: ${T}px solid currentColor; border-radius: 50%; opacity: 0; animation: {cls}-ripple ${D}s cubic-bezier(0, 0.2, 0.8, 1) infinite; }
.{cls} span:nth-child(2) { animation-delay: ${round(-D / 2, 3)}s; }
@keyframes {cls}-ripple { from { transform: scale(0); opacity: 1; } to { transform: scale(1); opacity: 0; } }`],
  flip: ["Flipping square", 0, (S, T, D) => `.{cls} { display: inline-block; width: ${S}px; height: ${S}px; background: currentColor; border-radius: ${round(S / 10)}px; animation: {cls}-flip ${D}s ease-in-out infinite; }
@keyframes {cls}-flip { 0% { transform: perspective(${S * 3}px) rotateX(0) rotateY(0); } 50% { transform: perspective(${S * 3}px) rotateX(-180deg) rotateY(0); } 100% { transform: perspective(${S * 3}px) rotateX(-180deg) rotateY(-180deg); } }`],
  progress: ["Progress bar", 0, (S, T, D) => `.{cls} { position: relative; display: block; width: ${S * 4}px; max-width: 100%; height: ${T}px; overflow: hidden; border-radius: ${T}px; background: color-mix(in srgb, currentColor 18%, transparent); }
.{cls}::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 40%; border-radius: inherit; background: currentColor; animation: {cls}-slide ${D}s ease-in-out infinite; }
@keyframes {cls}-slide { from { transform: translateX(-100%); } to { transform: translateX(250%); } }`],
  orbit: ["Orbit", 2, (S, T, D) => `.{cls} { position: relative; display: inline-block; width: ${S}px; height: ${S}px; animation: {cls}-spin ${D}s linear infinite; }
.{cls} span { position: absolute; left: 50%; width: ${round(S / 4)}px; height: ${round(S / 4)}px; margin-left: -${round(S / 8)}px; border-radius: 50%; background: currentColor; }
.{cls} span:first-child { top: 0; }
.{cls} span:last-child { bottom: 0; transform: scale(0.6); opacity: 0.5; }
@keyframes {cls}-spin { to { transform: rotate(1turn); } }`],
  typing: ["Typing", 3, (S, T, D) => `.{cls} { display: inline-flex; align-items: center; gap: ${round(S / 10)}px; padding: ${round(S / 5)}px ${round(S / 3)}px; border-radius: 999px; background: color-mix(in srgb, currentColor 12%, transparent); }
.{cls} span { width: ${round(S / 5)}px; height: ${round(S / 5)}px; border-radius: 50%; background: currentColor; animation: {cls}-type ${D}s ease-in-out infinite; }
.{cls} span:nth-child(2) { animation-delay: ${round(D * 0.15, 3)}s; }
.{cls} span:nth-child(3) { animation-delay: ${round(D * 0.3, 3)}s; }
@keyframes {cls}-type { 0%, 60%, 100% { opacity: 0.25; transform: none; } 30% { opacity: 1; transform: translateY(-30%); } }`],
};
export function loaderCss(type, { size = 48, color = "#111", speed = 1 } = {}) {
  const [, , css] = LOADERS[type];
  const S = Math.round(size), T = Math.max(2, Math.round(size / 10));
  return `${css(S, T, speed).replace(".{cls} {", `.{cls} { color: ${color};`)}
@media (prefers-reduced-motion: reduce) {
  .{cls}, .{cls} span, .{cls}::before { animation-duration: ${round(speed * 3, 2)}s; }
}`;
}
export const loaderHtml = (type) => `<div class="{cls}" role="status" aria-label="Loading">${"<span></span>".repeat(LOADERS[type][1])}</div>`;

const loader = {
  id: "loader",
  name: "Loaders",
  group: "Utilities",
  blurb: "Loading indicators in pure CSS — rings, dots, bars, ripples and more — with size, colour and speed, and a slower pace for people who prefer reduced motion.",
  keywords: "spinner loading animation progress",
  render(t) {
    const s = { type: "ring", size: 48, color: "#1c1917", speed: 1 };
    const gallery = h("div", { class: "tu-loaders", role: "group", "aria-label": "Loader" });
    const miniCss = Object.keys(LOADERS).map((k) => loaderCss(k, { size: 22, color: "currentColor", speed: 1 }).replaceAll("{cls}", `tu-mini-${k}`)).join("\n");
    const buttons = Object.entries(LOADERS).map(([k, [label]]) => h("button", { type: "button", title: label, "data-k": k, onclick: () => { s.type = k; t.draw(); } }, h("span", { class: "tu-loaders__demo" }), h("span", { class: "tu-loaders__name" }, label)));
    buttons.forEach((b) => { b.querySelector(".tu-loaders__demo").innerHTML = loaderHtml(b.dataset.k).replace("{cls}", `tu-mini-${b.dataset.k}`); });
    gallery.append(h("style", {}, miniCss), ...buttons);
    t.controls(gallery, t.range(s, "size", { label: "Size", min: 12, max: 160, unit: "px" }), t.color(s, "color", { label: "Colour" }), t.range(s, "speed", { label: "One cycle", min: 0.3, max: 4, step: 0.1, unit: "s" }));
    const stage = t.stage();
    const style = h("style");
    gallery.append(style);
    return () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.k === s.type)));
      const css = loaderCss(s.type, s);
      style.textContent = css.replaceAll("{cls}", "tu-loader-preview");
      stage.innerHTML = loaderHtml(s.type).replace("{cls}", "tu-loader-preview");
      t.out({ css, html: loaderHtml(s.type), name: "loader" });
    };
  },
};

export const tools = [svgOptimizer, base64, loremTool, placeholder, favicon, loader];

export const styles = `
.tu-stats { margin: 0; font-size: 0.88rem; color: var(--ink-soft); }
.tu-stats strong { color: var(--ink); font-family: var(--mono); font-size: 0.86rem; }
.tu-warn { color: var(--error); }
.tu-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-top: 0.75rem; }
.tu-compare figure { margin: 0; display: grid; gap: 0.3rem; }
.tu-compare figcaption { font-size: 0.75rem; color: var(--ink-soft); text-align: center; }
.tu-svgbox { display: grid; place-items: center; aspect-ratio: 4 / 3; padding: 0.75rem; background: repeating-conic-gradient(#ececec 0 25%, #fff 0 50%) 0 0 / 14px 14px; border: 1px solid var(--rule); border-radius: 6px; }
.tu-svgbox img { max-width: 100%; max-height: 100%; }
.tu-thumb { display: block; max-width: 100%; max-height: 12rem; margin: 0 auto 0.6rem; }
.tu-lorem { font: 0.95rem/1.6 Georgia, serif; max-width: 62ch; }
.tu-lorem p { margin: 0 0 0.8em; }
.tu-ph { display: block; max-width: 100%; max-height: 22rem; margin: auto; box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); }
.tu-tab { display: inline-flex; align-items: center; gap: 0.5rem; max-width: 100%; padding: 0.45rem 0.8rem; background: #f1f1f1; color: #222; border-radius: 9px 9px 0 0; font: 0.8rem system-ui, sans-serif; box-shadow: inset 0 -1px #ddd; }
.tu-tab__icon canvas { display: block; width: 16px; height: 16px; }
.tu-tab__x { color: #888; margin-left: 1.5rem; }
.tu-icons { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 1rem; margin-top: 1rem; }
.tu-icons figure { margin: 0; display: grid; justify-items: center; gap: 0.3rem; }
.tu-icons figcaption { font-size: 0.72rem; color: inherit; opacity: 0.65; }
.tu-icons canvas { box-shadow: 0 0 0 1px rgb(0 0 0 / 0.08); }
.tu-apple canvas { border-radius: 22%; }
.tu-loaders { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.2rem, 1fr)); gap: 0.35rem; }
.tu-loaders button { display: grid; justify-items: center; gap: 0.35rem; padding: 0.55rem 0.3rem 0.4rem; }
.tu-loaders button[aria-pressed="true"] { border-color: var(--accent); box-shadow: 0 0 0 2px var(--select); }
.tu-loaders__demo { display: grid; place-items: center; height: 30px; color: var(--ink); }
.tu-loaders__demo > * { max-width: 70px; }
.tu-loaders__name { font-size: 0.7rem; color: var(--ink-soft); line-height: 1.2; text-align: center; }
`;
