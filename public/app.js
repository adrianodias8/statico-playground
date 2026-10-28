// The Statico Playground: a file tree, an editor and a live preview. Every
// edit rebuilds the site with Statico itself, compiled to WebAssembly and
// running in a worker (worker.js); sw.js serves the result under preview/.
const $ = (sel) => document.querySelector(sel);
const STORE = "statico-playground";
const store = {
  get: () => { try { return JSON.parse(localStorage.getItem(STORE) || "null"); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} },
  clear: () => { try { localStorage.removeItem(STORE); } catch {} },
};

const previewRoot = new URL("preview/", location.href);
const decoder = new TextDecoder();
const encoder = new TextEncoder();

// ---- The project: path → { text } or { base64 }, as the templates ship.

let template = "hello";
let files = {};
let current = null;
let pages = [];

const isText = (f) => typeof f?.text === "string";
const bytesOf = (f) => (isText(f) ? encoder.encode(f.text) : Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)));

async function loadTemplate(name) {
  const res = await fetch(`templates/${name}.json`);
  if (!res.ok) throw new Error(`Could not load the ${name} template`);
  template = name;
  files = await res.json();
  save();
}
function save() {
  // Fonts and images are not saved: they come back from the template.
  const edits = Object.fromEntries(Object.entries(files).filter(([, f]) => isText(f)));
  store.set({ template, edits, deleted: deletedFrom(), current });
}
let shipped = {};
function deletedFrom() { return Object.keys(shipped).filter((p) => !(p in files)); }

// ---- File tree

const tree = $("[data-tree]");
function drawTree() {
  const paths = Object.keys(files).sort((a, b) => {
    const da = a.split("/").length;
    const db = b.split("/").length;
    const ra = !a.includes("/");
    const rb = !b.includes("/");
    if (ra !== rb) return ra ? 1 : -1;
    return a.localeCompare(b) || da - db;
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
    b.addEventListener("click", () => { open(p); show("code"); });
    li.append(b);
    tree.append(li);
  }
}

// ---- Editor

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
function open(p) {
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
let again = false;
let buildId = 0;
const waiting = new Map();
worker.onmessage = (e) => {
  const done = waiting.get(e.data.id);
  waiting.delete(e.data.id);
  done?.(e.data);
};
function runBuild() {
  const id = ++buildId;
  const list = Object.entries(files).map(([p, f]) => [p, bytesOf(f)]);
  const url = previewRoot.href.replace(/\/$/, "");
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker.postMessage({ id, files: list, url, previewRoot: previewRoot.href }, list.map(([, b]) => b.buffer));
  });
}
async function build() {
  if (building) { again = true; return; }
  building = true;
  status.textContent = "Building…";
  status.dataset.state = "busy";
  const r = await runBuild();
  building = false;
  if (r.ok) {
    pages = r.result?.pages || [];
    const report = r.result?.report;
    const warnings = report?.warnings || [];
    status.textContent = `Built ${report?.pages ?? pages.length} page${(report?.pages ?? pages.length) === 1 ? "" : "s"} in ${r.ms} ms${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`;
    status.dataset.state = warnings.length ? "warn" : "ok";
    problems(warnings.map((w) => ({ text: `${w.file ? `${w.file}${w.line ? `:${w.line}` : ""}: ` : ""}${w.message}`, file: w.file, line: w.line, level: w.level })), false);
    reloadPreview();
  } else {
    status.textContent = "The build failed: see below";
    status.dataset.state = "error";
    problems(r.log.filter((l) => l.trim()).map((text) => {
      const m = /([\w./[\]-]+\.(?:html|md|json|css|ya?ml|toml|csv)):(\d+)/.exec(text);
      return { text, file: m?.[1], line: m ? Number(m[2]) : null, level: "error" };
    }), true);
  }
  if (again) { again = false; build(); }
}
let timer = 0;
const buildSoon = () => { clearTimeout(timer); timer = setTimeout(build, 350); };

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
const fullUrl = (p) => new URL(p.replace(/^\//, ""), previewRoot).href;
function reloadPreview() {
  const target = fullUrl(previewPath);
  try {
    if (frame.contentWindow.location.href === target) { frame.contentWindow.location.reload(); return; }
  } catch {}
  frame.src = target;
}
frame.addEventListener("load", () => {
  try {
    const url = new URL(frame.contentWindow.location.href);
    if (url.href.startsWith(previewRoot.href)) previewPath = `/${url.pathname.slice(previewRoot.pathname.length)}`;
  } catch {}
  address.value = previewPath;
  $("[data-open-tab]").href = fullUrl(previewPath);
  const page = pages.find((p) => p.url === previewPath);
  $("[data-source]").hidden = !page;
});
$("[data-go]").addEventListener("submit", (e) => {
  e.preventDefault();
  previewPath = `/${address.value.trim().replace(/^\/+/, "")}`;
  frame.src = fullUrl(previewPath);
});
$("[data-back]").addEventListener("click", () => { try { frame.contentWindow.history.back(); } catch {} });
$("[data-forward]").addEventListener("click", () => { try { frame.contentWindow.history.forward(); } catch {} });
$("[data-source]").addEventListener("click", () => {
  const page = pages.find((p) => p.url === previewPath);
  if (!page) return;
  // A page made from Markdown: open the Markdown, it is what you would edit.
  const md = page.kind === "content" || page.kind === "markdown" ? Object.keys(files).find((f) => f.endsWith(".md") && previewPath.includes(f.split("/").pop().replace(/\.md$/, ""))) : null;
  open(md || page.source);
  show("code");
});

// ---- Panels on small screens

const ide = $("[data-ide]");
function show(name) {
  ide.dataset.show = name;
  document.querySelectorAll("[data-tab]").forEach((t) => t.setAttribute("aria-pressed", String(t.dataset.tab === name)));
  if (name === "code") editor?.refresh();
}
document.querySelectorAll("[data-tab]").forEach((t) => t.addEventListener("click", () => show(t.dataset.tab)));

// ---- Files: new, delete, download, reset

$("[data-new-file]").addEventListener("click", () => {
  const p = prompt("New file path, for example content/notes/my-note.md", "content/notes/my-note.md");
  if (!p) return;
  const path = p.trim().replace(/^\/+/, "");
  if (!path || path.endsWith("/")) return;
  if (!(path in files)) files[path] = { text: path.endsWith(".md") ? `---\ntitle: My note\ndate: ${new Date().toISOString().slice(0, 10)}\ndescription: Something new.\n---\n\nWrite here.\n` : "" };
  open(path);
  show("code");
  buildSoon();
});
$("[data-delete-file]").addEventListener("click", () => {
  if (!current || !confirm(`Delete ${current}?`)) return;
  delete files[current];
  current = Object.keys(files).find((p) => p.startsWith("pages/")) || Object.keys(files)[0];
  open(current);
  buildSoon();
});
$("[data-reset]").addEventListener("click", async () => {
  if (!confirm("Go back to the original template? Your changes will be lost.")) return;
  store.clear();
  await start(template, true);
});
$("[data-template]").addEventListener("change", async (e) => {
  const changed = Object.keys(files).some((p) => isText(files[p]) && files[p].text !== shipped[p]?.text) || deletedFrom().length;
  if (changed && !confirm("Switch template? Your changes to this one will be lost.")) { e.target.value = template; return; }
  await start(e.target.value, true);
});

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
  const blob = zip(Object.entries(files).map(([p, f]) => [`my-site/${p}`, bytesOf(f)]));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my-site.zip";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

// ---- Start

async function start(name, fresh) {
  await loadTemplate(name);
  shipped = structuredClone(files);
  const saved = fresh ? null : store.get();
  if (saved && saved.template === name) {
    Object.assign(files, saved.edits || {});
    for (const p of saved.deleted || []) delete files[p];
  }
  $("[data-template]").value = name;
  previewPath = "/";
  const first = (saved && !fresh && saved.current in files && saved.current) || Object.keys(files).find((p) => p === "pages/index.html") || Object.keys(files)[0];
  open(first);
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
    files[current].text = cm.getValue();
    save();
    buildSoon();
  });
  if (!("serviceWorker" in navigator)) {
    status.textContent = "This browser cannot show the preview (no service workers).";
    return;
  }
  await navigator.serviceWorker.register("sw.js");
  await navigator.serviceWorker.ready;
  const saved = store.get();
  try {
    await start(saved?.template || "hello", false);
  } catch (err) {
    status.textContent = String(err.message || err);
    status.dataset.state = "error";
  }
}
boot();
