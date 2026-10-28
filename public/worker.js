// Runs Statico, compiled to WebAssembly, on the playground's files. The
// files live in an in-memory filesystem (browser_wasi_shim); the built site
// goes into the Cache API, where sw.js serves it under preview/.
import { WASI, WASIProcExit, File, Directory, OpenFile, ConsoleStdout, PreopenDirectory } from "https://cdn.jsdelivr.net/npm/@bjorn3/browser_wasi_shim@0.4.2/dist/index.js";
import { postprocess, stripMarkers } from "./instrument.js";

const CACHE = "statico-preview";
const TYPES = {
  html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8",
  json: "application/json", xml: "application/xml", txt: "text/plain; charset=utf-8", md: "text/markdown; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  avif: "image/avif", ico: "image/x-icon", woff2: "font/woff2", woff: "font/woff", pdf: "application/pdf",
};
const typeOf = (path) => TYPES[path.split(".").pop().toLowerCase()] || "application/octet-stream";

let module = null;

// Directories are made from the leaves up, so each knows its parent.
function tree(files) {
  const root = {};
  for (const [path, bytes] of files) {
    const parts = path.split("/");
    let dir = root;
    for (const p of parts.slice(0, -1)) dir = dir[p] ??= {};
    dir[parts.at(-1)] = bytes;
  }
  const toMap = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, v instanceof Uint8Array ? new File(v) : new Directory(toMap(v))]));
  return toMap(root);
}

function collect(dir, prefix = "", out = []) {
  for (const [name, node] of dir.contents) {
    if (node instanceof Directory) collect(node, `${prefix}${name}/`, out);
    else out.push([prefix + name, node.data]);
  }
  return out;
}

self.onmessage = async (e) => {
  const { id, files, url, previewRoot, visual } = e.data;
  try {
    module ??= await WebAssembly.compileStreaming(fetch("statico.wasm"));
    const stdout = [];
    const stderr = [];
    const site = new PreopenDirectory("/site", tree(files));
    const wasi = new WASI(["statico", "/site", url], [], [
      new OpenFile(new File([])),
      ConsoleStdout.lineBuffered((l) => stdout.push(l)),
      ConsoleStdout.lineBuffered((l) => stderr.push(l)),
      site,
    ]);
    const instance = await WebAssembly.instantiate(module, { wasi_snapshot_preview1: wasi.wasiImport });
    const started = performance.now();
    let code = 0;
    try {
      code = wasi.start(instance);
    } catch (err) {
      if (err instanceof WASIProcExit) code = err.code;
      else throw err;
    }
    const ms = Math.round(performance.now() - started);
    const out = site.dir.contents.get("_site");
    let built = out instanceof Directory ? collect(out) : [];
    // A visual build carries source markers: turn them into elements the
    // editor can find, and keep them out of attributes and <head>.
    if (visual && code === 0) {
      const base = new URL(url).pathname.replace(/\/$/, "");
      const dec = new TextDecoder();
      const enc = new TextEncoder();
      built = built.map(([p, data]) => {
        if (p.endsWith(".html")) return [p, enc.encode(postprocess(dec.decode(data), base))];
        if (/\.(txt|xml|json|md)$/.test(p)) return [p, enc.encode(stripMarkers(dec.decode(data)))];
        return [p, data];
      });
    }
    if (code === 0) {
      const cache = await caches.open(CACHE);
      const base = new URL(previewRoot, self.location.href);
      const wanted = new Set(built.map(([p]) => new URL(p, base).href));
      for (const req of await cache.keys()) if (!wanted.has(req.url)) await cache.delete(req);
      await Promise.all(built.map(([p, data]) => cache.put(new URL(p, base).href, new Response(data, { headers: { "Content-Type": typeOf(p), "Cache-Control": "no-store" } }))));
    }
    const line = stdout.find((l) => l.startsWith("{"));
    postMessage({ id, ok: code === 0, ms, result: line ? JSON.parse(line) : null, log: [...stderr, ...stdout.filter((l) => !l.startsWith("{"))] });
  } catch (err) {
    postMessage({ id, ok: false, log: [String(err?.message || err)] });
  }
};
