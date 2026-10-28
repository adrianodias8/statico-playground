// The Statico Playground: a file tree, an editor and a live preview, plus a
// visual mode where the preview itself is the editor. Every change rebuilds
// the site with Statico itself, compiled to WebAssembly and running in a
// worker (worker.js); sw.js serves the result under preview/.
//
// Visual mode builds an annotated copy of the project (instrument.js) so the
// page in the preview knows where each piece came from; editor-frame.js runs
// inside the preview and sends edits back here, where they're written into
// the real source files: templates, JSON collections, front matter, Markdown.
import { instrument, parse, splitFrontMatter, fmValue } from "./instrument.js";
import { createTools } from "./tools/index.js";

const $ = (sel) => document.querySelector(sel);
const previewRoot = new URL("preview/", location.href);
const basePath = previewRoot.pathname.replace(/\/$/, "");
const encoder = new TextEncoder();
const TEMPLATES = { hello: "Hello (a tiny site)", blog: "Blog template", docs: "Docs template" };

// ---- Storage: IndexedDB, because sites carry fonts and images

const db = (() => {
  let opening = null;
  const open = () => (opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("statico-playground", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const run = async (mode, fn) => {
    const d = await open();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => resolve(req?.result);
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    get: (k) => run("readonly", (s) => s.get(k)).catch(() => null),
    set: (k, v) => run("readwrite", (s) => s.put(v, k)).catch(() => null),
    del: (k) => run("readwrite", (s) => s.delete(k)).catch(() => null),
  };
})();

// ---- The project: path → { text } or { base64 }, as the templates ship.
// Files are replaced, never changed in place, so undo can keep snapshots.

let template = "hello";
let files = {};
let shipped = {};
let current = null;
let pages = [];
let mode = "visual";
let version = 0;

const isText = (f) => typeof f?.text === "string";
const bytesOf = (f) => (isText(f) ? encoder.encode(f.text) : Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)));
const textOf = (p) => files[p]?.text ?? "";
function setText(p, text) { files[p] = { text }; }
function toBase64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function loadTemplate(name) {
  if (name === "import") {
    const imported = await db.get("import");
    if (!imported) throw new Error("The imported project is no longer stored here");
    files = structuredClone(imported.files);
  } else {
    const res = await fetch(`templates/${name}.json`);
    if (!res.ok) throw new Error(`Could not load the ${name} template`);
    files = await res.json();
  }
  template = name;
}
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const texts = {};
    const binaries = {};
    for (const [p, f] of Object.entries(files)) {
      if (isText(f)) { if (f.text !== shipped[p]?.text) texts[p] = f.text; }
      else if (f.base64 !== shipped[p]?.base64) binaries[p] = f.base64;
    }
    db.set("project", { template, texts, binaries, deleted: deletedFrom(), current, mode });
  }, 400);
}
function deletedFrom() { return Object.keys(shipped).filter((p) => !(p in files)); }
function touched() { version++; save(); }

// ---- Undo: snapshots of the file map, taken before each visual change

const history = [];
const future = [];
const snapshot = () => ({ ...files });
function checkpoint() {
  history.push(snapshot());
  if (history.length > 100) history.shift();
  future.length = 0;
  drawUndo();
}
function restore(snap) {
  files = snap;
  touched();
  if (current && !(current in files)) current = null;
  if (current && isText(files[current]) && editor && editor.getValue() !== files[current].text) {
    editor.swapDoc(CodeMirror.Doc(files[current].text, modeFor(current)));
  }
  drawTree();
  build({ keepScroll: true });
  drawUndo();
}
function undo() { if (!history.length) return; future.push(snapshot()); restore(history.pop()); }
function redo() { if (!future.length) return; history.push(snapshot()); restore(future.pop()); }
function drawUndo() {
  $("[data-undo]").disabled = !history.length;
  $("[data-redo]").disabled = !future.length;
}

// ---- File tree

const tree = $("[data-tree]");
function drawTree() {
  const paths = Object.keys(files).sort((a, b) => {
    const ra = !a.includes("/");
    const rb = !b.includes("/");
    if (ra !== rb) return ra ? 1 : -1;
    return a.localeCompare(b);
  });
  tree.replaceChildren();
  let lastDir = null;
  for (const p of paths) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
    if (dir !== lastDir && dir) {
      const li = document.createElement("li");
      li.className = "tree__dir";
      li.textContent = `${dir}/`;
      tree.append(li);
    }
    lastDir = dir;
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tree__file";
    if (dir) b.classList.add("tree__file--nested");
    if (!isText(files[p])) b.classList.add("tree__file--binary");
    b.textContent = p.slice(dir ? dir.length + 1 : 0);
    b.title = p;
    if (p === current) b.setAttribute("aria-current", "true");
    b.addEventListener("click", () => { setMode("code"); open(p); show("code"); });
    li.append(b);
    tree.append(li);
  }
}

// ---- Code editor

let editor = null;
const modeFor = (p) => {
  const ext = p.split(".").pop().toLowerCase();
  if (ext === "html" || ext === "htm") return "htmlmixed";
  if (ext === "md") return { name: "yaml-frontmatter", base: "markdown" };
  if (ext === "css") return "css";
  if (ext === "json") return { name: "javascript", json: true };
  if (ext === "js") return "javascript";
  if (ext === "svg" || ext === "xml") return "xml";
  return null;
};
function open(p, offset) {
  if (!(p in files)) return;
  current = p;
  $("[data-path]").textContent = p;
  const f = files[p];
  const binary = $("[data-binary]");
  if (isText(f)) {
    binary.hidden = true;
    $("[data-editor]").hidden = false;
    editor.setOption("mode", modeFor(p));
    editor.swapDoc(CodeMirror.Doc(f.text, modeFor(p)));
    editor.refresh();
    if (offset !== undefined) {
      const pos = editor.posFromIndex(offset);
      editor.setCursor(pos);
      editor.scrollIntoView(pos, 120);
    }
    editor.focus();
  } else {
    $("[data-editor]").hidden = true;
    binary.hidden = false;
    binary.textContent = `${p} is a binary file (${Math.round((f.base64.length * 3) / 4 / 1024)} KB). It is built into the site as it is.`;
  }
  drawTree();
  save();
}

// ---- Building, in the worker

const worker = new Worker("worker.js", { type: "module" });
const status = $("[data-status]");
let building = false;
let again = null;
let buildId = 0;
let map = { els: [], data: [] };
let mapVersion = -1;
const waiting = new Map();
const settled = [];
worker.onmessage = (e) => {
  const done = waiting.get(e.data.id);
  waiting.delete(e.data.id);
  done?.(e.data);
};
function runBuild(list, visual) {
  const id = ++buildId;
  const url = previewRoot.href.replace(/\/$/, "");
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker.postMessage({ id, files: list, url, previewRoot: previewRoot.href, visual }, list.map(([, b]) => b.buffer));
  });
}
// quiet: the preview already shows the change (an inline edit), so the page
// isn't reloaded. Otherwise it is, at the same scroll position.
async function build(opts = {}) {
  if (building) {
    again = again ? { quiet: again.quiet && opts.quiet, keepScroll: true } : opts;
    return;
  }
  building = true;
  status.textContent = "Building…";
  status.dataset.state = "busy";
  const visual = mode === "visual";
  const at = version;
  let source = files;
  let nextMap = null;
  if (visual) {
    const r = instrument(files);
    nextMap = r.map;
    source = { ...files };
    for (const [p, t] of Object.entries(r.files)) source[p] = { text: t };
  }
  const r = await runBuild(Object.entries(source).map(([p, f]) => [p, bytesOf(f)]), visual);
  building = false;
  if (r.ok) {
    if (nextMap) { map = nextMap; mapVersion = at; }
    pages = r.result?.pages || [];
    const report = r.result?.report;
    const warnings = report?.warnings || [];
    status.textContent = `Built ${report?.pages ?? pages.length} page${(report?.pages ?? pages.length) === 1 ? "" : "s"} in ${r.ms} ms${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`;
    status.dataset.state = warnings.length ? "warn" : "ok";
    problems(warnings.map((w) => ({ text: `${w.file ? `${w.file}${w.line ? `:${w.line}` : ""}: ` : ""}${w.message}`, file: w.file, line: w.line, level: w.level })), false);
    if (!opts.quiet && !again) reloadPreview(opts.keepScroll);
    renderInspector();
  } else {
    status.textContent = "The build failed: see below";
    status.dataset.state = "error";
    problems(r.log.filter((l) => l.trim()).map((text) => {
      const m = /([\w./[\]-]+\.(?:html|md|json|css|ya?ml|toml|csv)):(\d+)/.exec(text);
      return { text, file: m?.[1], line: m ? Number(m[2]) : null, level: "error" };
    }), true);
  }
  while (settled.length && mapVersion === version) settled.shift()();
  if (again) { const next = again; again = null; build(next); }
}
// The map must describe the files as they are now before an edit uses it
function fresh() {
  if (mode !== "visual" || (mapVersion === version && !building)) return Promise.resolve();
  return new Promise((resolve) => { settled.push(resolve); if (!building) build({ quiet: true }); });
}
let timer = 0;
const buildSoon = () => { clearTimeout(timer); timer = setTimeout(() => build({ keepScroll: true }), 350); };

// ---- Problems

const panel = $("[data-problems]");
function problems(list, force) {
  const ol = $("[data-problems-list]");
  ol.replaceChildren(...list.map((p) => {
    const li = document.createElement("li");
    li.className = `problems__item problems__item--${p.level || "warning"}`;
    if (p.file && files[p.file]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "link";
      b.textContent = p.text;
      b.addEventListener("click", () => {
        setMode("code");
        open(p.file);
        show("code");
        if (p.line) { editor.setCursor({ line: p.line - 1, ch: 0 }); editor.scrollIntoView(null, 120); }
      });
      li.append(b);
    } else li.textContent = p.text;
    return li;
  }));
  panel.hidden = !list.length || (!force && panel.dataset.closed === "1");
}
$("[data-close-problems]").addEventListener("click", () => { panel.hidden = true; panel.dataset.closed = "1"; });

// ---- Preview

const frame = $("[data-frame]");
const address = $("[data-address]");
let previewPath = "/";
let keptScroll = null;
let reselect = null;
const fullUrl = (p) => new URL(p.replace(/^\//, ""), previewRoot).href;
function reloadPreview(keepScroll) {
  const target = fullUrl(previewPath);
  try {
    if (keepScroll) keptScroll = frame.contentWindow.scrollY;
    if (selection && keepScroll) reselect = { kind: selection.kind, id: selection.id };
    if (frame.contentWindow.location.href === target) { frame.contentWindow.location.reload(); return; }
  } catch {}
  frame.src = target;
}
frame.addEventListener("load", () => {
  let samePage = false;
  try {
    const url = new URL(frame.contentWindow.location.href);
    if (url.href.startsWith(previewRoot.href)) {
      const next = `/${url.pathname.slice(previewRoot.pathname.length)}`;
      samePage = next === previewPath;
      previewPath = next;
    }
  } catch {}
  address.value = previewPath;
  $("[data-open-tab]").href = fullUrl(previewPath);
  const page = pages.find((p) => p.url === previewPath);
  $("[data-source]").hidden = !page;
  if (!samePage) { selection = null; reselect = null; keptScroll = null; }
  if (mode === "visual") attachEditor();
  renderInspector();
});
function attachEditor() {
  let doc;
  try { doc = frame.contentDocument; } catch { return; }
  if (!doc?.documentElement) return;
  const calm = doc.createElement("style");
  calm.id = "sx-calm";
  calm.textContent = "*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important;scroll-behavior:auto!important}";
  calm.disabled = interact;
  doc.head?.append(calm);
  const script = doc.createElement("script");
  script.src = new URL("editor-frame.js", location.href).href;
  script.onload = () => {
    const win = frame.contentWindow;
    if (keptScroll !== null) { win.scrollTo(0, keptScroll); keptScroll = null; }
    if (reselect) { win.__sxFrameApi?.selectById(reselect.kind, reselect.id); reselect = null; }
  };
  doc.body?.append(script);
}
$("[data-go]").addEventListener("submit", (e) => {
  e.preventDefault();
  previewPath = `/${address.value.trim().replace(/^\/+/, "")}`;
  frame.src = fullUrl(previewPath);
});
$("[data-back]").addEventListener("click", () => { try { frame.contentWindow.history.back(); } catch {} });
$("[data-forward]").addEventListener("click", () => { try { frame.contentWindow.history.forward(); } catch {} });
const sourceOfPage = (page) => markdownOf(page) || page.source;
function markdownOf(page) {
  if (!page || (page.kind !== "content" && page.kind !== "markdown")) return null;
  const exact = Object.keys(files).find((f) => f.endsWith(".md") && `/${f.replace(/^content\//, "").replace(/(\/index)?\.md$/, "")}/` === page.url);
  return exact || Object.keys(files).find((f) => f.endsWith(".md") && page.url.includes(f.split("/").pop().replace(/\.md$/, ""))) || null;
}
$("[data-source]").addEventListener("click", () => {
  const page = pages.find((p) => p.url === previewPath);
  if (!page) return;
  setMode("code");
  open(sourceOfPage(page));
  show("code");
});

// ---- Modes: visual (the preview is the editor) and code

const ide = $("[data-ide]");
function setMode(next) {
  if (next === mode) return;
  if (mode === "visual") frameApi()?.clear();
  mode = next;
  ide.dataset.mode = mode;
  document.body.dataset.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  selection = null;
  if (mode === "code") { show(current ? "code" : "files"); editor?.refresh(); }
  save();
  build({ keepScroll: true });
}
document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
let interact = false;
$("[data-interact]").addEventListener("click", (e) => {
  interact = !interact;
  e.currentTarget.setAttribute("aria-pressed", String(interact));
  try { frame.contentDocument.getElementById("sx-calm").disabled = interact; } catch {}
  if (interact) frameApi()?.clear();
});
document.querySelectorAll("[data-device]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-device]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  $("[data-stage]").dataset.device = b.dataset.device;
}));
$("[data-undo]").addEventListener("click", undo);
$("[data-redo]").addEventListener("click", redo);
document.addEventListener("keydown", (e) => {
  if (mode !== "visual" || !(e.metaKey || e.ctrlKey) || e.target.closest?.("input, textarea, .CodeMirror")) return;
  if (e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if (e.key === "y") { e.preventDefault(); redo(); }
});
const frameApi = () => { try { return frame.contentWindow.__sxFrameApi; } catch { return null; } };

// ---- Panels on small screens

function show(name) {
  ide.dataset.show = name;
  document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.tab === name)));
  if (name === "code") editor?.refresh();
}
document.querySelectorAll("[data-tab]").forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));

// ==== Writing changes back to the source ====================================

const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const unbase = (name, value) => ((name === "href" || name === "src") && value?.startsWith(`${basePath}/`) ? value.slice(basePath.length) : value);

function replaceRange(file, start, end, expected, text) {
  const src = textOf(file);
  if (expected !== undefined && src.slice(start, end) !== expected) throw new Error(`${file} changed underneath this edit; try again`);
  setText(file, src.slice(0, start) + text + src.slice(end));
}

// JSON keeps its indentation and trailing newline
function indentOf(text) {
  const m = /\n([ \t]+)\S/.exec(text);
  return m ? (m[1].includes("\t") ? "\t" : m[1].length) : 2;
}
function writeJson(file, data, like) {
  const out = JSON.stringify(data, null, indentOf(like));
  setText(file, like.endsWith("\n") ? `${out}\n` : out);
}
function getAt(obj, path) { return path.reduce((o, k) => o?.[k], obj); }
function setJsonAt(file, path, value) {
  const src = textOf(file);
  const data = JSON.parse(src);
  const parent = getAt(data, path.slice(0, -1));
  parent[path[path.length - 1]] = value;
  writeJson(file, data, src);
}
function editJson(file, fn) {
  const src = textOf(file);
  const data = JSON.parse(src);
  fn(data);
  writeJson(file, data, src);
}

const yamlScalar = (v) => (/^[^\s"'#&*!|>%@`{}[\],?:-][^:#]*$/.test(v) && !/\s$/.test(v) && fmValue(v) === v ? v : JSON.stringify(v));
function frontMatter(file) {
  const { fm } = splitFrontMatter(textOf(file));
  if (fm === null) return [];
  return fm.split(/\r?\n/).map((line) => /^([A-Za-z_][\w-]*):[ \t]*(.*)$/.exec(line)).filter(Boolean).map((m) => ({ key: m[1], raw: m[2], value: fmValue(m[2]) }));
}
function setFrontMatter(file, key, value) {
  const text = textOf(file);
  const { fm, bodyStart } = splitFrontMatter(text);
  const line = `${key}: ${yamlScalar(value)}`;
  if (fm === null) { setText(file, `---\n${line}\n---\n${text}`); return; }
  const lines = fm.split(/\r?\n/);
  const at = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (at === -1) lines.push(line); else lines[at] = line;
  setText(file, `---\n${lines.join("\n")}\n---\n${text.slice(bodyStart)}`);
}

// Markdown comes back from the editor as HTML; Turndown turns it into Markdown
let turndown = null;
const loadScript = (src) => new Promise((resolve, reject) => { const s = document.createElement("script"); s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Could not load ${src}`)); document.head.append(s); });
async function toMarkdown(html) {
  if (!turndown) {
    await loadScript("https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js");
    await loadScript("https://cdn.jsdelivr.net/npm/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js");
    turndown = new window.TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-", emDelimiter: "*" });
    turndown.use(window.turndownPluginGfm.gfm);
    // Highlighted code comes back as <pre data-lang> full of spans: keep the text and the language
    turndown.addRule("fencedCode", {
      filter: (n) => n.nodeName === "PRE",
      replacement: (_, n) => {
        const code = n.querySelector("code");
        const lang = n.getAttribute("data-lang") || (/language-(\S+)/.exec(code?.className || "") || [])[1] || "";
        return `\n\n\`\`\`${lang}\n${n.textContent.replace(/\n$/, "")}\n\`\`\`\n\n`;
      },
    });
  }
  // Links and images point inside the preview; the source points at the site
  html = html.split(` href="${basePath}/`).join(' href="/').split(` src="${basePath}/`).join(' src="/');
  return turndown.turndown(html);
}

// ---- What the editor in the preview calls

async function commit(t, value, html) {
  try {
    await fresh();
    checkpoint();
    if (t.kind === "field") writeData(t.id, value);
    else if (t.kind === "md") {
      const entry = map.data[t.id];
      const md = await toMarkdown(value);
      const text = textOf(entry.file);
      const { bodyStart } = splitFrontMatter(text);
      setText(entry.file, `${text.slice(0, bodyStart)}\n${md.trim()}\n`);
    } else {
      const entry = map.els[t.id];
      const lead = entry.original.match(/^\s*/)[0];
      const trail = entry.original.match(/\s*$/)[0];
      const body = html ? value.trim() : escText(value.trim());
      replaceRange(entry.file, entry.openEnd, entry.closeStart, entry.original, lead + body + trail);
    }
    touched();
    build({ quiet: t.kind !== "md" });
  } catch (err) {
    history.pop();
    drawUndo();
    status.textContent = String(err.message || err);
    status.dataset.state = "error";
    build({ keepScroll: true });
  }
}
function writeData(id, value) {
  const entry = map.data[id];
  if (!entry) throw new Error("That text isn't in the source any more");
  if (entry.kind === "json") {
    const old = getAt(JSON.parse(textOf(entry.file)), entry.path);
    setJsonAt(entry.file, entry.path, typeof old === "number" && value.trim() !== "" && !Number.isNaN(Number(value)) ? Number(value) : value);
  } else if (entry.kind === "fm") setFrontMatter(entry.file, entry.key, value);
}

// Item of a repeated JSON list that a field belongs to
function itemOf(t) {
  const entry = t.kind === "field" ? map.data[t.id] : null;
  if (!entry || entry.kind !== "json") return null;
  for (let i = entry.path.length - 1; i >= 0; i--) {
    if (typeof entry.path[i] === "number") return { file: entry.file, list: entry.path.slice(0, i), index: entry.path[i] };
  }
  return null;
}

function findNode(tree, start) {
  for (const c of tree.children || []) {
    if (c.text || c.comment) continue;
    if (c.start === start) return { node: c, parent: tree };
    if (c.start < start && start < c.end) { const r = findNode(c, start); if (r) return r; }
  }
  return null;
}
function lineSpan(src, start, end) {
  let a = start;
  while (a > 0 && (src[a - 1] === " " || src[a - 1] === "\t")) a--;
  let b = end;
  while (b < src.length && (src[b] === " " || src[b] === "\t")) b++;
  const ownLine = (a === 0 || src[a - 1] === "\n") && (b === src.length || src[b] === "\n" || src[b] === "\r");
  return ownLine ? { a, b: src[b] === "\r" ? b + 2 : b < src.length ? b + 1 : b, indent: src.slice(a, start), ownLine } : { a: start, b: end, indent: "", ownLine };
}

async function op(name, t) {
  try {
    await fresh();
    checkpoint();
    if (name.startsWith("item-")) {
      const item = itemOf(t);
      if (!item) throw new Error("This isn't part of a list");
      editJson(item.file, (data) => {
        const list = getAt(data, item.list);
        const i = item.index;
        if (name === "item-up" && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
        if (name === "item-down" && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
        if (name === "item-duplicate") list.splice(i + 1, 0, structuredClone(list[i]));
        if (name === "item-delete") list.splice(i, 1);
      });
    } else {
      const entry = map.els[t.id];
      const src = textOf(entry.file);
      if (src.slice(entry.start, entry.end).length !== entry.end - entry.start) throw new Error("The source changed; try again");
      if (name === "delete") {
        const s = lineSpan(src, entry.start, entry.end);
        setText(entry.file, src.slice(0, s.a) + src.slice(s.b));
      } else if (name === "duplicate") {
        const s = lineSpan(src, entry.start, entry.end);
        const copy = src.slice(entry.start, entry.end);
        setText(entry.file, s.ownLine ? `${src.slice(0, entry.end)}\n${s.indent}${copy}${src.slice(entry.end)}` : src.slice(0, entry.end) + copy + src.slice(entry.end));
      } else if (name === "up" || name === "down") {
        const found = findNode(parse(src), entry.start);
        if (!found) throw new Error("Couldn't find that element in its file");
        const sibs = found.parent.children.filter((c) => !c.text && !c.comment);
        const i = sibs.indexOf(found.node);
        const other = sibs[name === "up" ? i - 1 : i + 1];
        if (!other) { history.pop(); drawUndo(); status.textContent = `Already the ${name === "up" ? "first" : "last"} one here`; return; }
        const [A, B] = name === "up" ? [other, found.node] : [found.node, other];
        setText(entry.file, src.slice(0, A.start) + src.slice(B.start, B.end) + src.slice(A.end, B.start) + src.slice(A.start, A.end) + src.slice(B.end));
      }
    }
    selection = null;
    frameApi()?.clear();
    touched();
    build({ keepScroll: true });
  } catch (err) {
    history.pop();
    drawUndo();
    status.textContent = String(err.message || err);
    status.dataset.state = "error";
  }
}

function describe(t) {
  if (t.kind === "field") {
    const d = map.data[t.id];
    if (!d) return "data";
    if (d.kind === "fm") return `${d.key} · ${d.file}`;
    return `${d.file.replace(/^collections\//, "").replace(/\.json$/, "")} › ${d.path.join(" › ")}`;
  }
  if (t.kind === "md") return `Markdown · ${map.data[t.id]?.file}`;
  const e = map.els[t.id];
  if (!e) return t.kind;
  const what = t.kind === "run" ? "text" : t.kind === "image" ? "image" : e.tag;
  return `${what} · ${e.file}${e.loop ? " · repeats" : ""}`;
}

window.__sx = {
  get map() { return map; },
  get interact() { return interact; },
  describe, commit, op, itemOf, undo, redo, unbase,
  select(sel) { selection = sel; renderInspector(); },
};

// ==== The inspector ==========================================================

let selection = null;
let dataView = null; // { file, path } in the data editor

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  el.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return el;
}
const section = (title, ...kids) => h("section", { class: "insp" }, h("h2", { class: "insp__title" }, title), ...kids);
const note = (text) => h("p", { class: "insp__note" }, text);
const actions = (...btns) => h("div", { class: "insp__actions" }, ...btns);
const btn = (label, onclick, extra = {}) => h("button", { type: "button", onclick, ...extra }, label);
function field(label, value, onchange, opts = {}) {
  const id = `f${Math.random().toString(36).slice(2, 8)}`;
  const long = opts.long ?? (String(value ?? "").length > 48 || String(value ?? "").includes("\n"));
  const input = long ? h("textarea", { id, rows: Math.min(8, Math.max(2, Math.ceil(String(value ?? "").length / 38))) }) : h("input", { id, type: opts.type || "text" });
  if (opts.type === "checkbox") input.checked = !!value; else input.value = value ?? "";
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.addEventListener("change", () => onchange(opts.type === "checkbox" ? input.checked : input.value));
  if (!long) input.addEventListener("keydown", (e) => { if (e.key === "Enter") input.blur(); });
  return h("div", { class: `insp__field${opts.type === "checkbox" ? " insp__field--check" : ""}` }, h("label", { for: id }, label), input);
}
// One undoable change; if fn throws, whatever it wrote is rolled back.
// Returns whether it went through.
function change(fn) {
  checkpoint();
  try {
    fn();
  } catch (err) {
    files = history.pop();
    drawUndo();
    status.textContent = String(err.message || err);
    status.dataset.state = "error";
    return false;
  }
  touched();
  build({ keepScroll: true });
  return true;
}
function openCode(file, offset) {
  setMode("code");
  open(file, offset);
  show("code");
}

function renderInspector() {
  const root = $("[data-inspect]");
  tools.refresh();
  if (mode !== "visual") return;
  const focused = document.activeElement;
  if (root.contains(focused) && (focused.tagName === "INPUT" || focused.tagName === "TEXTAREA")) return;
  const tips = selection || dataView ? null : section("Editing", note("Click any text on the page to change it: Enter saves, Esc cancels. Alt-click selects the element around it, to move, copy or delete. ⌘/Ctrl-click follows a link; Interact turns editing off."), note("Text from collections, front matter and Markdown is saved back to those files; everything else to the template it came from."));
  root.replaceChildren(...[tips, dataView ? dataPanel() : null, selection ? selectionPanel(selection) : null, pagePanel(), sitePanel(), contentPanel()].filter(Boolean));
}

function selectionPanel(sel) {
  if (sel.kind === "field") {
    const d = map.data[sel.id];
    if (!d) return null;
    if (d.kind === "fm") return section("Front matter", note(d.file), ...frontMatterForm(d.file), actions(btn("Open in code", () => openCode(d.file))));
    const item = itemOf(sel);
    const objPath = item ? [...item.list, item.index] : d.path.slice(0, -1);
    const kids = [note(`${d.file} › ${d.path.join(" › ")}`)];
    if (item) {
      kids.push(objectForm(d.file, objPath));
      kids.push(actions(
        btn("Move up", () => op("item-up", sel)), btn("Move down", () => op("item-down", sel)),
        btn("Duplicate", () => op("item-duplicate", sel)), btn("Delete", () => op("item-delete", sel), { class: "danger" }),
      ));
      kids.push(actions(btn("Edit the whole list", () => { dataView = { file: d.file, path: item.list }; renderInspector(); })));
    } else kids.push(note("Edit it on the page, or here:"), field(String(d.path.at(-1)), getAt(JSON.parse(textOf(d.file)), d.path), (v) => change(() => setJsonAt(d.file, d.path, v))));
    return section(item ? "List item" : "Data", ...kids);
  }
  if (sel.kind === "md") {
    const d = map.data[sel.id];
    return section("Markdown", note(`The body of ${d.file}. Click into the text and write; it's saved as Markdown.`), ...frontMatterForm(d.file), actions(btn("Open in code", () => openCode(d.file, splitFrontMatter(textOf(d.file)).bodyStart))));
  }
  const e = map.els[sel.id];
  if (!e) return null;
  const kids = [h("p", { class: "insp__source" }, h("code", {}, `<${e.tag}>`), " in ", btn(e.file, () => openCode(e.file, e.start), { class: "link" }))];
  if (e.loop) kids.push(note("This sits inside a <ForEach>: it's the template for every item, so changes apply to all of them."));
  if (/^(layouts|includes)\//.test(e.file)) kids.push(note(`Shared: this comes from ${e.file}, so it changes everywhere that file is used.`));
  if (sel.kind === "run" || sel.kind === "block") kids.push(note("Click the text on the page to edit it. Enter saves, Esc cancels, Shift+Enter adds a line break."));
  // Attributes: written in the template, or coming from data
  const dyn = sel.attrs || {};
  const staticAttrs = Object.entries(e.attrs || {}).filter(([n]) => !n.startsWith("data-sx"));
  if (sel.kind === "image") {
    const src = sel.src ? unbase("src", sel.src) : "";
    kids.push(h("img", { class: "insp__thumb", src: sel.src || "", alt: "" }));
    kids.push(attrField(e, "alt", dyn.alt));
    kids.push(attrField(e, "src", dyn.src));
    kids.push(actions(btn("Replace image…", () => replaceImage(e, dyn.src, src))));
  }
  if (e.tag === "a") kids.push(attrField(e, "href", dyn.href));
  for (const [name] of staticAttrs) if (!(sel.kind === "image" && (name === "alt" || name === "src")) && !(e.tag === "a" && name === "href")) kids.push(attrField(e, name));
  for (const [name, id] of Object.entries(dyn)) if (!(sel.kind === "image" && (name === "alt" || name === "src")) && !(e.tag === "a" && name === "href")) kids.push(attrField(e, name, id));
  if (sel.kind !== "run") {
    kids.push(actions(
      btn("Move up", () => op("up", sel)), btn("Move down", () => op("down", sel)),
      btn("Duplicate", () => op("duplicate", sel)), btn("Delete", () => op("delete", sel), { class: "danger" }),
    ));
  }
  const title = { image: "Image", block: "Text", run: "Text", element: "Element" }[sel.kind] || "Element";
  return section(title, ...kids);
}

// One attribute: from data (edit the data) or written in the template
function attrField(e, name, dataId) {
  if (dataId !== undefined && map.data[dataId]) {
    const d = map.data[dataId];
    const value = d.kind === "json" ? getAt(JSON.parse(textOf(d.file)), d.path) : frontMatter(d.file).find((f) => f.key === d.key)?.value;
    const f = field(`${name} (from ${d.file.replace(/^collections\//, "")})`, value, (v) => change(() => writeData(dataId, v)));
    return f;
  }
  const a = e.attrs?.[name];
  if (!a) return field(name, "", (v) => { if (v) change(() => addAttr(e, name, v)); }, { placeholder: "Not set" });
  return field(name, a[2], (v) => change(() => replaceRange(e.file, a[0], a[1], a[2], escAttr(v))));
}
function addAttr(e, name, value) {
  const at = e.start + 1 + e.tag.length;
  replaceRange(e.file, at, at, "", ` ${name}="${escAttr(value)}"`);
}
function replaceImage(e, dataId, oldSrc) {
  const input = h("input", { type: "file", accept: "image/*" });
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const name = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const dir = oldSrc && oldSrc.startsWith("/assets/") ? oldSrc.slice(1, oldSrc.lastIndexOf("/")) : "assets/images";
    let path = `${dir}/${name}`;
    for (let n = 2; path in files; n++) path = `${dir}/${name.replace(/(\.[^.]+)?$/, `-${n}$1`)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    change(() => {
      files[path] = { base64: toBase64(bytes) };
      const url = `/${path}`;
      if (dataId !== undefined && map.data[dataId]) writeData(dataId, url);
      else if (e.attrs?.src) replaceRange(e.file, e.attrs.src[0], e.attrs.src[1], e.attrs.src[2], url);
      else addAttr(e, "src", url);
    });
    drawTree();
  });
  input.click();
}

// A JSON object as a form; lists and objects inside it open in the data editor
function objectForm(file, path) {
  let obj;
  try { obj = getAt(JSON.parse(textOf(file)), path); } catch { return note(`${file} isn't valid JSON right now.`); }
  if (!obj || typeof obj !== "object") return note("Nothing to edit here.");
  const box = h("div", { class: "insp__form" });
  for (const [k, v] of Object.entries(obj)) {
    const p = [...path, k];
    if (v === null || typeof v === "string" || typeof v === "number") {
      box.append(field(k, v ?? "", (val) => change(() => setJsonAt(file, p, typeof v === "number" && val.trim() !== "" && !Number.isNaN(Number(val)) ? Number(val) : val))));
    } else if (typeof v === "boolean") {
      box.append(field(k, v, (val) => change(() => setJsonAt(file, p, val)), { type: "checkbox" }));
    } else {
      box.append(h("div", { class: "insp__field" }, h("span", { class: "insp__label" }, k), btn(Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"} →` : "Open →", () => { dataView = { file, path: p }; renderInspector(); }, { class: "insp__nest" })));
    }
  }
  return box;
}
const labelOf = (v, i) => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const s = Object.values(v).find((x) => typeof x === "string" && x.trim());
    return s ? String(s).slice(0, 60) : `Item ${i + 1}`;
  }
  return typeof v === "string" ? v.slice(0, 60) : JSON.stringify(v).slice(0, 60);
};
function dataPanel() {
  const { file, path } = dataView;
  let value;
  try { value = getAt(JSON.parse(textOf(file)), path); } catch { value = undefined; }
  const crumbs = h("nav", { class: "insp__crumbs", "aria-label": "Where in the data" },
    btn(file.replace(/^collections\//, ""), () => { dataView = { file, path: [] }; renderInspector(); }, { class: "link" }),
    ...path.map((k, i) => [" › ", btn(String(k), () => { dataView = { file, path: path.slice(0, i + 1) }; renderInspector(); }, { class: "link" })]).flat());
  const kids = [crumbs];
  if (Array.isArray(value)) {
    const list = h("ol", { class: "insp__list" });
    value.forEach((v, i) => {
      const p = [...path, i];
      list.append(h("li", {},
        btn(labelOf(v, i), () => { dataView = { file, path: p }; renderInspector(); }, { class: "insp__item" }),
        h("span", { class: "insp__mini" },
          btn("↑", () => change(() => editJson(file, (d) => { const l = getAt(d, path); if (i > 0) [l[i - 1], l[i]] = [l[i], l[i - 1]]; })), { title: "Move up", "aria-label": "Move up", disabled: i === 0 }),
          btn("↓", () => change(() => editJson(file, (d) => { const l = getAt(d, path); if (i < l.length - 1) [l[i + 1], l[i]] = [l[i], l[i + 1]]; })), { title: "Move down", "aria-label": "Move down", disabled: i === value.length - 1 }),
          btn("Copy", () => change(() => editJson(file, (d) => { const l = getAt(d, path); l.splice(i + 1, 0, structuredClone(l[i])); })), { title: "Duplicate" }),
          btn("✕", () => change(() => editJson(file, (d) => getAt(d, path).splice(i, 1))), { title: "Delete", "aria-label": "Delete", class: "danger" }),
        )));
    });
    kids.push(list, actions(btn("Add item", () => change(() => editJson(file, (d) => { const l = getAt(d, path); l.push(blankLike(l[l.length - 1])); })))));
  } else if (value && typeof value === "object") kids.push(objectForm(file, path));
  else kids.push(note("Nothing here any more."));
  kids.push(actions(btn("Close", () => { dataView = null; renderInspector(); }), btn("Open in code", () => openCode(file))));
  return section("Data", ...kids);
}
// A new item shaped like its neighbour, with the text emptied
function blankLike(v) {
  if (typeof v === "string") return "";
  if (typeof v === "number") return 0;
  if (typeof v === "boolean") return false;
  if (Array.isArray(v)) return [];
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blankLike(x)]));
  return "";
}

function frontMatterForm(file) {
  return frontMatter(file).map(({ key, raw, value }) => (value === null && raw.trim() && !/^\d{4}-\d\d-\d\d/.test(raw.trim())
    ? field(`${key} (YAML)`, raw, (v) => change(() => { const t = textOf(file); const { fm, bodyStart } = splitFrontMatter(t); setText(file, `---\n${fm.split(/\r?\n/).map((l) => (l.startsWith(`${key}:`) ? `${key}: ${v}` : l)).join("\n")}\n---\n${t.slice(bodyStart)}`); }))
    : field(key, value ?? raw.trim(), (v) => change(() => setFrontMatter(file, key, v)), { type: /^\d{4}-\d\d-\d\d$/.test(raw.trim()) ? "date" : "text" })));
}

// The page in the preview: its <layout> attributes, or its front matter
function pagePanel() {
  const page = pages.find((p) => p.url === previewPath);
  if (!page) return section("Page", note(`Nothing built at ${previewPath}.`));
  const md = markdownOf(page);
  const kids = [h("p", { class: "insp__source" }, btn(md || page.source, () => openCode(md || page.source), { class: "link" }), ` → ${page.url}`)];
  if (md) {
    kids.push(...frontMatterForm(md));
    kids.push(actions(btn("Delete this post", () => { if (confirm(`Delete ${md}?`)) change(() => { delete files[md]; previewPath = "/"; }); }, { class: "danger" })));
    return section("Page", ...kids);
  }
  const src = textOf(page.source);
  const layoutTag = parse(src).children.find((c) => c.lname === "layout");
  if (layoutTag) {
    for (const a of layoutTag.attrs) {
      if (a.value === null) continue;
      if (a.name === "src") { kids.push(h("p", { class: "insp__note" }, "Layout: ", btn(a.value, () => openCode(`layouts/${a.value}`), { class: "link" }))); continue; }
      kids.push(field(a.name, a.value, (v) => change(() => replaceRange(page.source, a.vStart, a.vEnd, a.value, escAttr(v)))));
    }
    if (!layoutTag.attrs.some((a) => a.name === "description")) kids.push(field("description", "", (v) => { if (v) change(() => replaceRange(page.source, layoutTag.nameEnd, layoutTag.nameEnd, "", ` description="${escAttr(v)}"`)); }, { placeholder: "For search results and link previews" }));
  } else kids.push(note("This page has no <layout> tag: it is a whole HTML document."));
  kids.push(actions(
    btn("New page", () => newPage(page, false)),
    btn("Duplicate", () => newPage(page, true)),
    page.source.includes("[") ? null : btn("Delete", () => { if (confirm(`Delete ${page.source}?`)) change(() => { delete files[page.source]; previewPath = "/"; }); }, { class: "danger" }),
  ));
  return section("Page", ...kids);
}
function newPage(page, copy) {
  const name = prompt("Address of the new page, for example about or menu/autumn", copy ? `${page.url.replace(/^\/|\/$/g, "") || "home"}-copy` : "new-page");
  if (!name) return;
  const slug = name.trim().replace(/^\/+|\/+$/g, "").toLowerCase().replace(/[^a-z0-9/_-]+/g, "-");
  if (!slug) return;
  const path = `pages/${slug}.html`;
  if (path in files || `pages/${slug}/index.html` in files) { alert(`There is already a page at /${slug}/`); return; }
  const src = textOf(page.source);
  const layout = /<layout\b[^>]*\bsrc="([^"]+)"/.exec(src)?.[1];
  const title = slug.split("/").pop().replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
  const text = copy ? src : layout
    ? `<layout src="${layout}" title="${title}" description="">\n\n<section>\n    <h1>${title}</h1>\n    <p>Click here to write.</p>\n</section>\n\n</layout>\n`
    : `<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="utf-8">\n    <title>${title}</title>\n</head>\n<body>\n    <h1>${title}</h1>\n    <p>Click here to write.</p>\n</body>\n</html>\n`;
  change(() => { setText(path, text); previewPath = `/${slug}/`; });
  drawTree();
}

function sitePanel() {
  const cfgFile = "statico.json" in files ? "statico.json" : "static.json" in files ? "static.json" : null;
  if (!cfgFile) return null;
  let site;
  try { site = JSON.parse(textOf(cfgFile)).site || {}; } catch { return section("Site", note(`${cfgFile} isn't valid JSON right now.`)); }
  const kids = Object.entries(site).filter(([, v]) => typeof v === "string").map(([k, v]) => field(k, v, (val) => change(() => editJson(cfgFile, (d) => { d.site[k] = val; }))));
  return h("details", { class: "insp insp--fold" }, h("summary", { class: "insp__title" }, "Site settings"), ...kids);
}

function contentPanel() {
  const collections = Object.keys(files).filter((p) => /^collections\/.+\.json$/.test(p)).sort();
  const folders = {};
  for (const p of Object.keys(files)) { const m = /^content\/(.+)\/[^/]+\.md$/.exec(p); if (m) (folders[m[1]] ??= []).push(p); }
  if (!collections.length && !Object.keys(folders).length) return null;
  const kids = [];
  if (collections.length) {
    kids.push(h("p", { class: "insp__label" }, "Collections"));
    kids.push(h("ul", { class: "insp__links" }, ...collections.map((p) => h("li", {}, btn(p.replace(/^collections\//, ""), () => { dataView = { file: p, path: [] }; renderInspector(); }, { class: "link" })))));
  }
  for (const [folder, list] of Object.entries(folders)) {
    kids.push(h("p", { class: "insp__label" }, `content/${folder}`));
    kids.push(h("ul", { class: "insp__links" }, ...list.sort().map((p) => {
      const page = pages.find((x) => markdownOf(x) === p);
      return h("li", {}, btn(p.split("/").pop(), () => { if (page) { previewPath = page.url; frame.src = fullUrl(page.url); } else openCode(p); }, { class: "link" }));
    })));
    kids.push(actions(btn(`New in ${folder}`, () => newPost(folder, list))));
  }
  return h("details", { class: "insp insp--fold", open: !selection }, h("summary", { class: "insp__title" }, "Content"), ...kids);
}
function newPost(folder, siblings) {
  const name = prompt("File name for the new post", "my-new-post");
  if (!name) return;
  const slug = name.trim().toLowerCase().replace(/\.md$/, "").replace(/[^a-z0-9_-]+/g, "-");
  const path = `content/${folder}/${slug}.md`;
  if (path in files) { alert(`${path} already exists`); return; }
  // Same front matter fields as the newest neighbour, with fresh values
  const like = frontMatter(siblings.sort().at(-1) || "");
  const today = new Date().toISOString().slice(0, 10);
  const title = slug.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
  const fm = like.length
    ? like.map(({ key, raw }) => `${key}: ${key === "title" ? yamlScalar(title) : key === "date" ? today : key === "draft" ? "false" : /^\[/.test(raw.trim()) ? raw.trim() : key === "description" ? yamlScalar("A few words about this post.") : raw.trim()}`).join("\n")
    : `title: ${yamlScalar(title)}\ndate: ${today}\ndescription: A few words about this post.`;
  change(() => setText(path, `---\n${fm}\n---\n\nStart writing here.\n`));
  drawTree();
}

// ==== Files: new, delete, import, download, reset ============================

$("[data-new-file]").addEventListener("click", () => {
  const p = prompt("New file path, for example content/notes/my-note.md", "content/notes/my-note.md");
  if (!p) return;
  const path = p.trim().replace(/^\/+/, "");
  if (!path || path.endsWith("/")) return;
  if (!(path in files)) { setText(path, path.endsWith(".md") ? `---\ntitle: My note\ndate: ${new Date().toISOString().slice(0, 10)}\ndescription: Something new.\n---\n\nWrite here.\n` : ""); touched(); }
  setMode("code");
  open(path);
  show("code");
  buildSoon();
});
$("[data-delete-file]").addEventListener("click", () => {
  if (!current || !confirm(`Delete ${current}?`)) return;
  checkpoint();
  delete files[current];
  touched();
  current = Object.keys(files).find((p) => p.startsWith("pages/")) || Object.keys(files)[0];
  open(current);
  buildSoon();
});
$("[data-reset]").addEventListener("click", async () => {
  if (!confirm("Go back to the original files? Your changes will be lost.")) return;
  await db.del("project");
  await start(template, true);
});
$("[data-template]").addEventListener("change", async (e) => {
  const changed = Object.keys(files).some((p) => (isText(files[p]) ? files[p].text !== shipped[p]?.text : files[p].base64 !== shipped[p]?.base64)) || deletedFrom().length;
  if (changed && !confirm("Switch? Your changes to this project will be lost.")) { e.target.value = template; return; }
  await db.del("project");
  await start(e.target.value, true);
});

// Import a site made elsewhere (by hand, or generated): a folder or a .zip
const SKIP_DIRS = /(^|\/)(_site|node_modules|\.git|\.statico|\.claude|\.build)(\/|$)/;
async function importEntries(entries, name) {
  entries = entries.filter(([p]) => !SKIP_DIRS.test(p) && !/(^|\/)\.DS_Store$/.test(p));
  const cfg = entries.map(([p]) => p).filter((p) => /(^|\/)stati(c|co)\.json$/.test(p)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  let prefix = cfg ? cfg.slice(0, cfg.lastIndexOf("/") + 1) : "";
  if (!cfg) {
    const tops = new Set(entries.map(([p]) => p.split("/")[0]));
    if (tops.size === 1 && entries.every(([p]) => p.includes("/"))) prefix = `${[...tops][0]}/`;
  }
  const out = {};
  const dec = new TextDecoder("utf-8", { fatal: true });
  for (const [p, bytes] of entries) {
    if (!p.startsWith(prefix)) continue;
    const rel = p.slice(prefix.length);
    if (!rel || SKIP_DIRS.test(rel)) continue;
    try { out[rel] = { text: dec.decode(bytes) }; } catch { out[rel] = { base64: toBase64(bytes) }; }
  }
  if (!Object.keys(out).some((p) => p.startsWith("pages/"))) { alert("That doesn't look like a Statico site: there is no pages/ folder."); return; }
  const changed = Object.keys(files).some((p) => (isText(files[p]) ? files[p].text !== shipped[p]?.text : false)) || deletedFrom().length;
  if (changed && !confirm("Replace the current project with this one? Your changes will be lost.")) return;
  await db.set("import", { name, files: out });
  await db.del("project");
  drawTemplates(name);
  await start("import", true);
}
async function readZip(buf) {
  const view = new DataView(buf);
  let eocd = buf.byteLength - 22;
  while (eocd >= 0 && view.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("That isn't a .zip file");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true);
    const packed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extra = view.getUint16(at + 30, true);
    const comment = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = dec.decode(new Uint8Array(buf, at + 46, nameLen));
    at += 46 + nameLen + extra + comment;
    if (name.endsWith("/")) continue;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = new Uint8Array(buf, start, packed);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else continue;
    if (data.length === size) out.push([name, data]);
  }
  return out;
}
const pickFolder = h("input", { type: "file", webkitdirectory: true, multiple: true, hidden: true });
const pickZip = h("input", { type: "file", accept: ".zip,application/zip", hidden: true });
document.body.append(pickFolder, pickZip);
pickFolder.addEventListener("change", async () => {
  const list = [...pickFolder.files];
  if (!list.length) return;
  const entries = await Promise.all(list.map(async (f) => [f.webkitRelativePath || f.name, new Uint8Array(await f.arrayBuffer())]));
  await importEntries(entries, list[0].webkitRelativePath.split("/")[0] || "Imported site");
  pickFolder.value = "";
});
pickZip.addEventListener("change", async () => {
  const f = pickZip.files[0];
  if (!f) return;
  try { await importEntries(await readZip(await f.arrayBuffer()), f.name.replace(/\.zip$/i, "")); } catch (err) { alert(String(err.message || err)); }
  pickZip.value = "";
});
$("[data-import-folder]").addEventListener("click", () => { pickFolder.click(); closeMenus(); });
$("[data-import-zip]").addEventListener("click", () => { pickZip.click(); closeMenus(); });
const closeMenus = () => document.querySelectorAll("details.menu[open]").forEach((d) => d.removeAttribute("open"));
document.addEventListener("click", (e) => { if (!e.target.closest("details.menu")) closeMenus(); });

// A zip with no compression: small enough to write by hand, and any unzip
// tool opens it. Then `statico dev` builds it for real.
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const n = encoder.encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true);
    local.setUint32(14, crc, true); local.setUint32(18, data.length, true); local.setUint32(22, data.length, true); local.setUint16(26, n.length, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, data.length, true); cen.setUint32(24, data.length, true); cen.setUint16(28, n.length, true); cen.setUint32(42, offset, true);
    parts.push(local, n, data);
    central.push(cen, n);
    offset += 30 + n.length + data.length;
  }
  const size = central.reduce((s, c) => s + c.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true); end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
$("[data-download]").addEventListener("click", () => {
  closeMenus();
  const blob = zip(Object.entries(files).map(([p, f]) => [`my-site/${p}`, bytesOf(f)]));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my-site.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// ==== Tools: what the Tools drawer (tools/) may read and write ============

let batching = false;
// Tools' writes: nested calls join the outer change(); returns success
function inBatch(fn) {
  if (batching) { fn(); return true; }
  batching = true;
  let ok;
  try { ok = change(fn); } finally { batching = false; }
  drawTree();
  return ok;
}
const selectedEl = () => (mode === "visual" && selection && ["element", "block", "image"].includes(selection.kind) ? map.els[selection.id] : null);
function headTargets() {
  const has = (p) => isText(files[p]) && /<\/head>/i.test(files[p].text);
  const layouts = Object.keys(files).filter((p) => p.startsWith("layouts/") && has(p));
  return layouts.length ? layouts : Object.keys(files).filter((p) => p.startsWith("pages/") && has(p));
}
const tools = createTools({
  files: () => Object.keys(files).sort(),
  read: (p) => (isText(files[p]) ? files[p].text : null),
  bytes: (p) => (p in files ? bytesOf(files[p]) : null),
  // Text or bytes; several writes inside change() are one undo step
  write(p, data) { return inBatch(() => { files[p] = typeof data === "string" ? { text: data } : { base64: toBase64(data) }; }); },
  remove(p) { return inBatch(() => { delete files[p]; }); },
  change: inBatch,
  cssFiles: () => Object.keys(files).filter((p) => p.endsWith(".css") && isText(files[p])).sort(),
  defaultCss() {
    for (const p of Object.keys(files).filter((f) => f.startsWith("layouts/"))) {
      for (const m of textOf(p).matchAll(/<link[^>]+href="\/?([^"{]+\.css)"/g)) if (isText(files[m[1]])) return m[1];
    }
    return Object.keys(files).find((p) => p.endsWith(".css")) || null;
  },
  selection() {
    const e = selectedEl();
    return e ? { tag: e.tag, file: e.file, label: `<${e.tag}> in ${e.file}`, short: `<${e.tag}>`, classes: (e.attrs?.class?.[2] || "").split(/\s+/).filter(Boolean) } : null;
  },
  addClass(name) {
    const e = selectedEl();
    if (!e) throw new Error("Select an element in the preview first");
    if (textOf(e.file).slice(e.start, e.start + 1 + e.tag.length).toLowerCase() !== `<${e.tag}`) throw new Error("The page is still rebuilding; try again in a moment");
    const a = e.attrs?.class;
    if (!a) { addAttr(e, "class", name); return; }
    if (a[2].split(/\s+/).includes(name)) return;
    replaceRange(e.file, a[0], a[1], a[2], a[2].trim() ? `${a[2]} ${name}` : name);
  },
  // Sets an attribute written in the template (one that comes from data is
  // changed in the data instead)
  setAttr(name, value) {
    const e = selectedEl();
    if (!e) throw new Error("Select an element in the preview first");
    const dataId = selection.attrs?.[name];
    return inBatch(() => {
      if (dataId !== undefined && map.data[dataId]) writeData(dataId, value);
      else if (e.attrs?.[name]) replaceRange(e.file, e.attrs[name][0], e.attrs[name][1], e.attrs[name][2], escAttr(value));
      else addAttr(e, name, value);
    });
  },
  insertAfter(html) {
    const e = selectedEl();
    if (!e) throw new Error("Select an element in the preview first");
    const { indent } = lineSpan(textOf(e.file), e.start, e.end);
    replaceRange(e.file, e.end, e.end, "", `\n${html.split("\n").map((l) => (l ? indent + l : l)).join("\n")}`);
  },
  // Into the <head> of every layout (or full-document page), between
  // tools:key comments so a second call replaces the first
  addToHead(html, key) {
    const targets = headTargets();
    if (!targets.length) throw new Error("No layout with a <head> to add to");
    const ok = inBatch(() => {
      for (const p of targets) {
        let src = textOf(p);
        const begin = `<!-- tools:${key} -->`;
        const end = `<!-- /tools:${key} -->`;
        const i = src.indexOf(begin);
        const j = i >= 0 ? src.indexOf(end, i) : -1;
        if (i >= 0 && j >= 0) { const s = lineSpan(src, i, j + end.length); src = src.slice(0, s.a) + src.slice(s.b); }
        const at = src.search(/[ \t]*<\/head>/i);
        const close = /^[ \t]*/.exec(src.slice(at))[0];
        const before = src.slice(0, at).trimEnd().split("\n").at(-1);
        const pad = /^[ \t]*/.exec(before)[0] || `${close}    `;
        const block = [begin, ...html.trim().split("\n"), end].map((l) => pad + l.trim()).join("\n");
        setText(p, `${src.slice(0, at)}${block}\n${src.slice(at)}`);
      }
    });
    return ok ? targets : null;
  },
  headTargets,
  site() {
    const cfg = "statico.json" in files ? "statico.json" : "static.json" in files ? "static.json" : null;
    try { return cfg ? JSON.parse(textOf(cfg)).site || {} : {}; } catch { return {}; }
  },
  setSite(patch) {
    const cfg = "statico.json" in files ? "statico.json" : "static.json" in files ? "static.json" : null;
    if (!cfg) throw new Error("This project has no statico.json");
    return inBatch(() => editJson(cfg, (d) => {
      d.site ??= {};
      for (const [k, v] of Object.entries(patch)) if (v === "" || v == null) delete d.site[k]; else d.site[k] = v;
    }));
  },
  // The page in the preview: its source file and the fields it sets
  // (front matter for Markdown, attributes of <layout> otherwise)
  page() {
    const page = pages.find((p) => p.url === previewPath);
    if (!page) return null;
    const md = markdownOf(page);
    if (md) return { url: page.url, file: md, kind: "markdown", fields: Object.fromEntries(frontMatter(md).map((f) => [f.key, f.value])) };
    const tag = parse(textOf(page.source)).children.find((c) => c.lname === "layout");
    return { url: page.url, file: page.source, kind: tag ? "layout" : "html", fields: tag ? Object.fromEntries(tag.attrs.filter((a) => a.value !== null && a.name !== "src").map((a) => [a.name, a.value])) : {} };
  },
  setPage(key, value) {
    const page = pages.find((p) => p.url === previewPath);
    if (!page) throw new Error(`Nothing built at ${previewPath}`);
    const md = markdownOf(page);
    return inBatch(() => {
      if (md) { setFrontMatter(md, key, value); return; }
      const tag = parse(textOf(page.source)).children.find((c) => c.lname === "layout");
      if (!tag) throw new Error(`${page.source} has no <layout> tag to set ${key} on`);
      const a = tag.attrs.find((x) => x.name === key && x.value !== null);
      if (a) replaceRange(page.source, a.vStart, a.vEnd, a.value, escAttr(value));
      else replaceRange(page.source, tag.nameEnd, tag.nameEnd, "", ` ${key}="${escAttr(value)}"`);
    });
  },
  pages: () => pages.map((p) => ({ url: p.url, source: p.source })),
  previewPath: () => previewPath,
  previewUrl: (p = previewPath) => fullUrl(p),
  notify(msg, state = "ok") { status.textContent = msg; status.dataset.state = state; },
  openFile: (p) => openCode(p),
  closed() { $("[data-tools]").setAttribute("aria-expanded", "false"); },
});
$("[data-tools]").addEventListener("click", () => {
  tools.toggle();
  $("[data-tools]").setAttribute("aria-expanded", String(tools.isOpen));
});

// ---- Start

function drawTemplates(importName) {
  const select = $("[data-template]");
  select.replaceChildren(...Object.entries(TEMPLATES).map(([v, label]) => h("option", { value: v }, label)));
  if (importName) select.append(h("option", { value: "import" }, `Imported: ${importName}`));
}

async function start(name, fresh) {
  await loadTemplate(name);
  shipped = { ...files };
  history.length = 0;
  future.length = 0;
  drawUndo();
  const saved = fresh ? null : await db.get("project");
  if (saved && saved.template === name) {
    for (const [p, t] of Object.entries(saved.texts || {})) files[p] = { text: t };
    for (const [p, b] of Object.entries(saved.binaries || {})) files[p] = { base64: b };
    for (const p of saved.deleted || []) delete files[p];
  }
  $("[data-template]").value = name;
  previewPath = "/";
  selection = null;
  dataView = null;
  touched();
  const first = (saved && !fresh && saved.current in files && saved.current) || Object.keys(files).find((p) => p === "pages/index.html") || Object.keys(files)[0];
  open(first);
  if (mode === "code") show("code");
  await build();
}

async function boot() {
  editor = CodeMirror($("[data-editor]"), {
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 4,
    indentUnit: 4,
    extraKeys: { Tab: (cm) => cm.replaceSelection("    ") },
  });
  // Switching files swaps documents, which fires no change: every change
  // here is an edit.
  editor.on("change", (cm) => {
    if (!current || !isText(files[current])) return;
    setText(current, cm.getValue());
    touched();
    buildSoon();
  });
  if (!("serviceWorker" in navigator)) {
    status.textContent = "This browser cannot show the preview (no service workers).";
    return;
  }
  await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  const imported = await db.get("import");
  drawTemplates(imported?.name);
  let saved = await db.get("project");
  // Projects saved by earlier versions of the playground, in localStorage
  if (!saved) {
    try {
      const old = JSON.parse(localStorage.getItem("statico-playground") || "null");
      if (old) saved = { template: old.template, texts: old.edits ? Object.fromEntries(Object.entries(old.edits).map(([p, f]) => [p, f.text])) : {}, deleted: old.deleted, current: old.current };
      if (saved) await db.set("project", saved);
    } catch {}
  }
  mode = saved?.mode === "code" ? "code" : "visual";
  ide.dataset.mode = mode;
  document.body.dataset.mode = mode;
  document.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  const wanted = new URLSearchParams(location.search).get("template");
  try {
    if (wanted && (wanted in TEMPLATES) && wanted !== saved?.template) await start(wanted, true);
    else if (saved?.template === "import" ? imported : saved?.template in TEMPLATES) await start(saved.template, false);
    else await start("hello", true);
  } catch (err) {
    status.textContent = String(err.message || err);
    status.dataset.state = "error";
  }
  const tool = new URLSearchParams(location.search).get("tool");
  if (tool !== null) { tools.open(tool || undefined); $("[data-tools]").setAttribute("aria-expanded", "true"); }
}
boot();
