// Source tracking for the visual editor. Before a visual build, a copy of
// the project is annotated so every piece of the built page can be traced
// back to where it came from:
//
// - elements in pages, layouts and includes get data-sx="<id>", and the map
//   remembers the file and the exact offsets of their tags and contents;
// - loose text inside mixed elements is wrapped in <sx-t data-sx="<id>">;
// - strings in JSON collections, statico.json's `site` and Markdown front
//   matter are wrapped in invisible markers (U+E000 id U+E001 … U+E002) that
//   the worker turns into <sx-f data-sxf="<id>"> after the build;
// - Markdown bodies are fenced with <!--sx-md:<id>--> … <!--/sx-md-->.
//
// Ids are counters in a fixed order (files sorted, then document order), so
// a text edit doesn't change them: the preview can keep its page while the
// site rebuilds underneath.

export const OPEN = "", MID = "", CLOSE = "";
export const stripMarkers = (s) => s.replace(/\d+/g, "").replace(//g, "");

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr", "include", "else", "elseif", "page"]);
const RAW = new Set(["script", "style", "textarea", "title"]);
const STATICO = new Set(["foreach", "if", "elseif", "else", "layout", "include", "page"]);
const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "data", "del", "dfn", "em", "i", "ins", "kbd", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup", "time", "u", "var", "wbr"]);
// Containers that are never edited as one piece of text
const CONTAINER = new Set(["html", "head", "body", "svg", "ul", "ol", "dl", "table", "thead", "tbody", "tfoot", "tr", "select", "template", "iframe", "picture", "video", "audio", "canvas", "noscript", "form", "main", "header", "footer", "nav", "section", "article", "aside", "figure", "colgroup", "datalist", "optgroup", "option", "textarea"]);
// Where loose text can't take a wrapper element
const NO_RUN_PARENT = new Set(["table", "thead", "tbody", "tfoot", "tr", "select", "ul", "ol", "dl", "colgroup", "html", "head", "option", "datalist", "optgroup", "svg"]);
// Never tag these, or anything inside them
const SKIP = new Set(["head", "script", "style", "template", "noscript", "title", "svg", "math"]);
const PLACEHOLDER = /\{[^{}\s][^{}]*\}/;
const WORDY = /[A-Za-z0-9À-\uDFFF豈-￯]/;

// ---- A forgiving HTML parser that keeps offsets. Statico tags are elements
// like any other, and an <If> inside a start tag (attributes that come and
// go) stays part of that tag.

export function parse(src) {
  const root = { name: "#root", lname: "#root", children: [], start: 0, openEnd: 0, closeStart: src.length, end: src.length, attrs: [] };
  const stack = [root];
  const n = src.length;
  const top = () => stack[stack.length - 1];
  const addText = (start, end) => {
    const kids = top().children;
    const last = kids[kids.length - 1];
    if (last?.text && last.end === start) last.end = end;
    else kids.push({ text: true, start, end });
  };
  let i = 0;
  while (i < n) {
    const lt = src.indexOf("<", i);
    const stop = lt === -1 ? n : lt;
    if (stop > i) addText(i, stop);
    if (lt === -1) break;
    i = lt;
    if (src.startsWith("<!--", i)) {
      const e = src.indexOf("-->", i + 4);
      const end = e === -1 ? n : e + 3;
      top().children.push({ comment: true, start: i, end });
      i = end;
      continue;
    }
    if (src[i + 1] === "!" || src[i + 1] === "?") { const e = src.indexOf(">", i); i = e === -1 ? n : e + 1; continue; }
    const closing = src[i + 1] === "/";
    const nameStart = i + (closing ? 2 : 1);
    const m = /^[A-Za-z][\w:.-]*/.exec(src.slice(nameStart, nameStart + 64));
    if (!m) { addText(i, i + 1); i++; continue; }
    const name = m[0];
    const lname = name.toLowerCase();
    if (closing) {
      const e = src.indexOf(">", i);
      const end = e === -1 ? n : e + 1;
      let k = stack.length - 1;
      while (k > 0 && stack[k].lname !== lname) k--;
      if (k > 0) {
        for (let j = stack.length - 1; j > k; j--) { stack[j].closeStart = i; stack[j].end = i; stack[j].broken = true; }
        stack[k].closeStart = i;
        stack[k].end = end;
        stack.length = k;
      }
      i = end;
      continue;
    }
    // Start tag: find its end, skipping quotes and nested <…> (Statico tags)
    let j = nameStart + name.length;
    let depth = 0;
    let quote = null;
    const nested = [];
    let nestStart = -1;
    for (; j < n; j++) {
      const c = src[j];
      if (quote) { if (c === quote) quote = null; continue; }
      if (depth === 0 && (c === '"' || c === "'")) { quote = c; continue; }
      if (c === "<") { if (depth === 0) nestStart = j; depth++; continue; }
      if (c === ">") { if (depth > 0) { depth--; if (depth === 0) nested.push([nestStart, j + 1]); continue; } break; }
    }
    const openEnd = Math.min(j + 1, n);
    const selfClose = src[j - 1] === "/";
    const node = {
      name, lname, start: i, nameEnd: nameStart + name.length, openEnd, children: [],
      closeStart: openEnd, end: openEnd, attrs: parseAttrs(src, nameStart + name.length, j, nested), dynamicTag: nested.length > 0,
    };
    top().children.push(node);
    i = openEnd;
    if (VOID.has(lname) || selfClose) continue;
    if (RAW.has(lname)) {
      const close = src.toLowerCase().indexOf(`</${lname}`, i);
      const cs = close === -1 ? n : close;
      if (cs > i) node.children.push({ text: true, raw: true, start: i, end: cs });
      const e = close === -1 ? n : src.indexOf(">", close);
      node.closeStart = cs;
      node.end = e === -1 ? n : e + 1;
      i = node.end;
      continue;
    }
    stack.push(node);
  }
  for (let k = stack.length - 1; k > 0; k--) { stack[k].closeStart = n; stack[k].end = n; stack[k].broken = true; }
  return root;
}

function parseAttrs(src, from, to, nested) {
  // Blank out nested Statico tags so they don't read as attributes
  let seg = src.slice(from, to);
  for (const [a, b] of nested) seg = seg.slice(0, a - from) + " ".repeat(b - a) + seg.slice(b - from);
  const attrs = [];
  const re = /([^\s=/>"'<]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
  let m;
  while ((m = re.exec(seg))) {
    const value = m[2] ?? m[3] ?? m[4] ?? null;
    let vStart = -1;
    if (value !== null) {
      const q = m[2] !== undefined || m[3] !== undefined ? 1 : 0;
      vStart = from + m.index + m[0].length - value.length - q;
    }
    attrs.push({ name: m[1].toLowerCase(), value, vStart, vEnd: vStart < 0 ? -1 : vStart + value.length });
  }
  return attrs;
}

export const attr = (node, name) => node.attrs?.find((a) => a.name === name);

// ---- What can be edited as text

function pure(node, src) {
  for (const c of node.children) {
    if (c.comment) return false;
    if (c.text) { if (PLACEHOLDER.test(src.slice(c.start, c.end))) return false; continue; }
    if (c.broken || c.dynamicTag || STATICO.has(c.lname) || !INLINE.has(c.lname)) return false;
    if (c.attrs.some((a) => a.value && PLACEHOLDER.test(a.value))) return false;
    if (!pure(c, src)) return false;
  }
  return true;
}
function hasWords(node, src) {
  return node.children.some((c) => (c.text ? WORDY.test(src.slice(c.start, c.end)) : c.children && hasWords(c, src)));
}

// ---- Templates: tag elements and text

function tagTemplate(path, src, map, ids) {
  const tree = parse(src);
  const inserts = [];
  const isLayout = path.startsWith("layouts/");
  // In a layout, only what's inside <body> is the page
  let inBody = !isLayout || !/<body[\s>]/i.test(src);
  const walk = (node, loop, parentTagged) => {
    for (const c of node.children) {
      if (c.comment) continue;
      if (c.text) {
        if (!inBody || c.raw || NO_RUN_PARENT.has(node.lname)) continue;
        const s = src.slice(c.start, c.end);
        if (!WORDY.test(s) || PLACEHOLDER.test(s) || node.textBlock) continue;
        const lead = s.length - s.trimStart().length;
        const trail = s.length - s.trimEnd().length;
        const id = ids.el++;
        const start = c.start + lead;
        const end = c.end - trail;
        map.els[id] = { file: path, run: true, start, end, openEnd: start, closeStart: end, loop, plain: true, original: src.slice(start, end) };
        inserts.push([start, `<sx-t data-sx="${id}">`], [end, "</sx-t>"]);
        continue;
      }
      if (c.lname === "body") inBody = true;
      if (STATICO.has(c.lname)) { walk(c, loop || c.lname === "foreach", parentTagged); continue; }
      if (SKIP.has(c.lname)) {
        if (c.lname === "svg" && inBody && !c.dynamicTag) {
          const id = ids.el++;
          map.els[id] = elementEntry(path, c, src, loop, false);
          inserts.push([c.nameEnd, ` data-sx="${id}"`]);
        }
        continue;
      }
      if (!inBody || c.lname === "html" || c.lname === "body") { walk(c, loop, parentTagged); continue; }
      const id = ids.el++;
      const text = !c.broken && !CONTAINER.has(c.lname) && !VOID.has(c.lname) && pure(c, src) && hasWords(c, src);
      map.els[id] = elementEntry(path, c, src, loop, text);
      inserts.push([c.nameEnd, ` data-sx="${id}"`]);
      if (text) { c.textBlock = true; continue; }
      walk(c, loop, true);
    }
  };
  walk(tree, false, false);
  return applyInserts(src, inserts);
}

function elementEntry(file, c, src, loop, text) {
  const statics = {};
  for (const a of c.attrs) if (a.value !== null && !PLACEHOLDER.test(a.value)) statics[a.name] = [a.vStart, a.vEnd, a.value];
  const inner = text ? src.slice(c.openEnd, c.closeStart) : null;
  return {
    file, tag: c.lname, start: c.start, openEnd: c.openEnd, closeStart: c.closeStart, end: c.end, loop, text,
    plain: text ? !/[<&]/.test(inner) : false, original: inner, attrs: statics,
  };
}

function applyInserts(src, inserts) {
  inserts.sort((a, b) => a[0] - b[0]);
  let out = "";
  let at = 0;
  for (const [pos, s] of inserts) { out += src.slice(at, pos) + s; at = pos; }
  return out + src.slice(at);
}

// ---- Which data fields must stay exactly as they are: anything compared,
// sorted on or run through a filter that would trip over the markers.

const SAFE_FILTERS = new Set(["escape", "upper", "lower", "capitalize", "default"]);
const IDENT = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g;
const KEYWORDS = new Set(["and", "or", "not", "contains", "true", "false", "null", "loop"]);

function exclusions(templates) {
  // as-variable → the collection (or content folder) it walks
  const vars = new Map();
  const pairs = [];
  for (const src of templates) {
    for (const m of src.matchAll(/<ForEach\b([^>]*)>/gi)) {
      const a = Object.fromEntries([...m[1].matchAll(/(\w+)\s*=\s*"([^"]*)"/g)].map((x) => [x[1].toLowerCase(), x[2]]));
      const as = a.as || a.collection || a.content;
      if (a.content) pairs.push([as, "fm"]);
      else if (a.collection) pairs.push([as, a.collection]);
    }
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const [as, from] of pairs) {
      const head = from.split(/[./]/)[0];
      const roots = from === "fm" ? ["fm"] : from.includes(".") ? [...(vars.get(head) || (head === "frontmatter" ? ["fm"] : ["*"]))] : [head];
      const set = vars.get(as) || new Set();
      roots.forEach((r) => set.add(r));
      vars.set(as, set);
    }
  }
  const out = new Set(["*:date"]);
  const add = (ident) => {
    const segs = ident.split(".").filter((s) => s !== "length");
    if (segs.length < 2 || KEYWORDS.has(segs[0])) return;
    const key = segs[segs.length - 1];
    const v = segs[0];
    const roots = v === "frontmatter" ? ["fm"] : v === "site" ? ["site"] : v === "page" || v === "pagination" || v === "$loop" ? [] : [...(vars.get(v) || ["*"])];
    roots.forEach((r) => out.add(`${r}:${key}`));
  };
  for (const src of templates) {
    for (const m of src.matchAll(/\b(condition|where|orderBy)\s*=\s*"([^"]*)"/gi)) {
      const kind = m[1].toLowerCase();
      if (kind === "orderby") { m[2].split(",").forEach((f) => { const k = f.trim().split(/\s+/)[0]; if (k) out.add(`*:${k}`); }); continue; }
      if (!/==|!=|<|>|\bcontains\b/.test(m[2])) continue;
      for (const id of m[2].replace(/'[^']*'|"[^"]*"/g, "").matchAll(IDENT)) add(id[0]);
    }
    for (const m of src.matchAll(/\{\s*([A-Za-z_$][\w$.]*)\s*\|([^}]*)\}/g)) {
      const filters = m[2].split("|").map((f) => f.split(":")[0].trim());
      if (filters.some((f) => !SAFE_FILTERS.has(f))) add(m[1]);
    }
  }
  return out;
}
const excluded = (ex, root, key) => ex.has(`*:${key}`) || ex.has(`${root}:${key}`);

// ---- Data: JSON collections, site settings, front matter

const mark = (id, s) => `${OPEN}${id}${MID}${s}${CLOSE}`;

function markJson(file, value, root, ex, map, ids, path = [], key = null) {
  if (typeof value === "string") {
    if (!value.trim() || key === null || excluded(ex, root, key)) return value;
    const id = ids.data++;
    map.data[id] = { file, kind: "json", path, html: /<[a-z]/i.test(value) };
    return mark(id, value);
  }
  if (Array.isArray(value)) return value.map((v, i) => markJson(file, v, root, ex, map, ids, [...path, i], key));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = markJson(file, v, root, ex, map, ids, [...path, k], k);
    return out;
  }
  return value;
}

export function splitFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/.exec(text);
  if (!m) return { fm: null, body: text, bodyStart: 0 };
  return { fm: m[1], body: text.slice(m[0].length), bodyStart: m[0].length, fmStart: 4 };
}
const SCALAR = /^([A-Za-z_][\w-]*):[ \t]*(.*)$/;
export function fmValue(raw) {
  const v = raw.trim();
  if (!v || /^[[{|>&*!#]/.test(v)) return null;
  if (v.startsWith('"')) { try { return JSON.parse(v); } catch { return null; } }
  if (v.startsWith("'")) return v.endsWith("'") ? v.slice(1, -1).replace(/''/g, "'") : null;
  if (/^(true|false|yes|no|null|~|-?\d+(\.\d+)?|\d{4}-\d\d-\d\d.*)$/i.test(v)) return null;
  return v.replace(/\s+#.*$/, "");
}

function markMarkdown(file, text, ex, map, ids) {
  const { fm, body, bodyStart } = splitFrontMatter(text);
  let head = "";
  if (fm !== null) {
    const lines = fm.split(/\r?\n/).map((line) => {
      const m = SCALAR.exec(line);
      if (!m || excluded(ex, "fm", m[1])) return line;
      const v = fmValue(m[2]);
      if (v === null || !v.trim()) return line;
      const id = ids.data++;
      map.data[id] = { file, kind: "fm", key: m[1] };
      return `${m[1]}: ${JSON.stringify(mark(id, v))}`;
    });
    head = `---\n${lines.join("\n")}\n---\n`;
  }
  const id = ids.data++;
  map.data[id] = { file, kind: "md", bodyStart };
  return `${head}<!--sx-md:${id}-->\n\n${body}\n\n<!--/sx-md-->\n`;
}

// ---- Everything together

const isTemplate = (p) => /^(pages|layouts|includes)\/.+\.html?$/i.test(p);

// files: { path: { text } | { base64 } }. Returns the annotated text files
// (only those that changed) and the map.
export function instrument(files) {
  const map = { els: [], data: [] };
  const ids = { el: 0, data: 0 };
  const paths = Object.keys(files).sort();
  const text = (p) => files[p]?.text;
  const templates = paths.filter((p) => typeof text(p) === "string" && (isTemplate(p) || p.endsWith(".md"))).map(text);
  const ex = exclusions(templates);
  const out = {};
  for (const p of paths) {
    const t = text(p);
    if (typeof t !== "string") continue;
    try {
      if (isTemplate(p)) out[p] = tagTemplate(p, t, map, ids);
      else if (/^collections\/.+\.json$/i.test(p)) {
        const root = p.slice(12).replace(/\.json$/i, "").split("/").pop();
        out[p] = JSON.stringify(markJson(p, JSON.parse(t), root, ex, map, ids));
      } else if (p === "statico.json" || p === "static.json") {
        const cfg = JSON.parse(t);
        if (cfg.site && typeof cfg.site === "object") {
          const site = {};
          for (const [k, v] of Object.entries(cfg.site)) site[k] = k === "image" || k === "language" || k === "twitter" ? v : markJson(p, v, "site", ex, map, ids, ["site", k], k);
          cfg.site = site;
        }
        out[p] = JSON.stringify(cfg);
      } else if (/^content\/.+\.md$/i.test(p)) out[p] = markMarkdown(p, t, ex, map, ids);
    } catch {
      // A file that doesn't parse builds as it is; the build will say why.
    }
  }
  return { files: out, map };
}

// ---- After the build (runs in the worker): markers in text become
// <sx-f>, markers in attributes become data-sxa-<attr>, and anything in
// <head>, <script> or <title> is simply cleaned.

const URL_ATTRS = new Set(["src", "href", "srcset", "poster", "action", "data"]);

export function postprocess(html, base) {
  if (!html.includes(OPEN)) return html;
  const lower = html.toLowerCase();
  let out = "";
  let i = 0;
  const n = html.length;
  const text = (s) => s.replace(/(\d+)([\s\S]*?)/g, (_, id, v) => `<sx-f data-sxf="${id}">${v}</sx-f>`).replace(/[-]/g, "");
  let inHead = false;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) { out += inHead ? stripMarkers(html.slice(i)) : text(html.slice(i)); break; }
    out += inHead ? stripMarkers(html.slice(i, lt)) : text(html.slice(i, lt));
    i = lt;
    if (html.startsWith("<!--", i)) { const e = html.indexOf("-->", i); const end = e === -1 ? n : e + 3; out += html.slice(i, end); i = end; continue; }
    let j = i + 1;
    let quote = null;
    for (; j < n; j++) {
      const c = html[j];
      if (quote) { if (c === quote) quote = null; } else if (c === '"' || c === "'") quote = c; else if (c === ">") break;
    }
    let tag = html.slice(i, j + 1);
    const name = (/^<\/?([a-zA-Z][\w:-]*)/.exec(tag) || [])[1]?.toLowerCase();
    if (name === "head") inHead = !tag.startsWith("</");
    if (tag.includes(OPEN)) {
      const found = [];
      tag = tag.replace(/([^\s=/>"']+)(\s*=\s*)(["'])([\s\S]*?)\3/g, (all, a, eq, q, v) => {
        if (!v.includes(OPEN)) return all;
        const id = /(\d+)/.exec(v)?.[1];
        let clean = stripMarkers(v);
        const an = a.toLowerCase();
        if (URL_ATTRS.has(an) && clean.startsWith("/") && !clean.startsWith("//") && base && !clean.startsWith(`${base}/`)) clean = base + clean;
        if (id !== undefined) found.push(`data-sxa-${an}="${id}"`);
        return `${a}${eq}${q}${clean}${q}`;
      });
      tag = stripMarkers(tag);
      if (found.length && !inHead) tag = tag.replace(/\s*(\/?)>$/, ` ${found.join(" ")}$1>`);
    }
    out += tag;
    i = j + 1;
    if (name && (name === "script" || name === "style" || name === "title" || name === "textarea") && !tag.startsWith("</") && !tag.endsWith("/>")) {
      const close = lower.indexOf(`</${name}`, i);
      const end = close === -1 ? n : close;
      out += stripMarkers(html.slice(i, end));
      i = end;
    }
  }
  return out;
}
