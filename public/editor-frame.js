// The visual editor, inside the preview. app.js adds this script to every
// page of a visual build. It finds what the build annotated (instrument.js),
// draws outlines and a small toolbar in a shadow root (so the site's CSS and
// the editor's never meet), edits text in place, and hands every change to
// the playground through parent.__sx, which writes it to the source files.
(() => {
  const host = window.parent?.__sx;
  if (!host || window.__sxFrame) return;
  window.__sxFrame = true;
  const doc = document;

  // ---- Markdown bodies: wrap what sits between <!--sx-md:id--> and <!--/sx-md-->

  function wrapMarkdown() {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
    const starts = [];
    while (walker.nextNode()) if (/^sx-md:\d+$/.test(walker.currentNode.data)) starts.push(walker.currentNode);
    for (const start of starts) {
      let end = start.nextSibling;
      while (end && !(end.nodeType === 8 && end.data === "/sx-md")) end = end.nextSibling;
      if (!end) continue;
      // When the body fills its parent, edit the parent itself, so the
      // site's CSS (often `.column > p`) still applies while editing
      const blank = (n) => n.nodeType === 3 ? !n.data.trim() : n.nodeType === 8;
      let alone = true;
      for (let n = start.previousSibling; n; n = n.previousSibling) if (!blank(n)) alone = false;
      for (let n = end.nextSibling; n; n = n.nextSibling) if (!blank(n)) alone = false;
      if (alone && start.parentElement !== doc.body) { start.parentElement.dataset.sxmd = start.data.slice(6); continue; }
      const box = doc.createElement("sx-md");
      box.dataset.sxmd = start.data.slice(6);
      box.style.display = "block";
      while (start.nextSibling !== end) box.append(start.nextSibling);
      start.after(box);
    }
  }
  wrapMarkdown();

  // ---- The UI layer

  const layer = doc.createElement("sx-ui");
  layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;display:block;";
  const shadow = layer.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>
    :host { all: initial; }
    .box { position: fixed; pointer-events: none; border-radius: 2px; display: none; }
    .hover { outline: 1px dashed oklch(58% 0.17 40); outline-offset: 1px; }
    .hover.data { outline-color: oklch(55% 0.14 150); }
    .sel { outline: 2px solid oklch(58% 0.17 40); outline-offset: 1px; }
    .sel.data { outline-color: oklch(55% 0.14 150); }
    .sel.editing { outline-style: solid; background: oklch(58% 0.17 40 / .05); }
    .tag { position: absolute; left: -2px; bottom: 100%; margin-bottom: 4px; white-space: nowrap; font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
      background: oklch(58% 0.17 40); color: #fff; padding: 4px 6px; border-radius: 3px; letter-spacing: .01em; }
    .data .tag { background: oklch(48% 0.12 150); }
    .tag.below { bottom: auto; top: 100%; margin: 4px 0 0; }
    .bar { position: fixed; display: none; pointer-events: auto; gap: 2px; padding: 3px; border-radius: 6px; background: #17171a; box-shadow: 0 6px 24px rgba(0,0,0,.25);
      font: 500 12px/1 ui-sans-serif, system-ui, sans-serif; }
    .bar button { all: unset; cursor: pointer; color: #f3f2ee; padding: 6px 8px; border-radius: 4px; }
    .bar button:hover { background: #303036; }
    .bar button:focus-visible { outline: 2px solid oklch(72% 0.15 45); }
    .bar .sep { width: 1px; background: #3a3a40; margin: 3px 2px; }
    .bar b { font-weight: 800; } .bar i { font-family: Georgia, serif; font-style: italic; }
  </style>
  <div class="box hover"><span class="tag"></span></div>
  <div class="box sel"><span class="tag"></span></div>
  <div class="bar" role="toolbar" aria-label="Edit"></div>`;
  doc.documentElement.append(layer);
  const hoverBox = shadow.querySelector(".hover");
  const selBox = shadow.querySelector(".sel");
  const bar = shadow.querySelector(".bar");

  // ---- What's under the pointer

  const isEditableKind = (k) => k === "field" || k === "run" || k === "block" || k === "md";
  function targetOf(node, structural) {
    let el = node?.nodeType === 1 ? node : node?.parentElement;
    if (!el || el.closest("sx-ui")) return null;
    if (!structural) {
      const field = el.closest("sx-f");
      if (field) return { kind: "field", el: field, id: +field.dataset.sxf };
      const run = el.closest("sx-t");
      if (run) return { kind: "run", el: run, id: +run.dataset.sx };
      const md = el.closest("[data-sxmd]");
      if (md) return { kind: "md", el: md, id: +md.dataset.sxmd };
    }
    const tagged = el.closest("[data-sx]");
    if (!tagged) return null;
    const id = +tagged.dataset.sx;
    const entry = host.map.els[id];
    if (!entry) return null;
    if (tagged.tagName === "IMG") return { kind: "image", el: tagged, id };
    if (entry.text && !entry.run && !structural) return { kind: "block", el: tagged, id };
    return { kind: "element", el: tagged, id };
  }
  const same = (a, b) => a && b && a.kind === b.kind && a.id === b.id && a.el === b.el;

  // ---- Boxes follow their element

  let hovered = null;
  let selected = null;
  let editing = null;
  function place(box, t) {
    if (!t || !t.el.isConnected) { box.style.display = "none"; return; }
    const r = t.el.getBoundingClientRect();
    box.style.display = "block";
    box.style.left = `${r.left}px`;
    box.style.top = `${r.top}px`;
    box.style.width = `${Math.max(r.width, 2)}px`;
    box.style.height = `${Math.max(r.height, 2)}px`;
    box.classList.toggle("data", t.kind === "field" || t.kind === "md");
    const tag = box.querySelector(".tag");
    tag.textContent = host.describe(t);
    tag.classList.toggle("below", r.top < 28);
  }
  function placeBar() {
    if (!selected || !selected.el.isConnected) { bar.style.display = "none"; return; }
    const r = selected.el.getBoundingClientRect();
    bar.style.display = "flex";
    const bw = bar.offsetWidth;
    const bh = bar.offsetHeight;
    let top = r.bottom + 8;
    if (top + bh > innerHeight - 8) top = Math.max(8, r.top - bh - 30);
    bar.style.top = `${top}px`;
    bar.style.left = `${Math.min(Math.max(8, r.left), innerWidth - bw - 8)}px`;
  }
  let raf = 0;
  function redraw() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      place(hoverBox, hovered && !same(hovered, selected) ? hovered : null);
      place(selBox, selected);
      selBox.classList.toggle("editing", !!editing);
      placeBar();
    });
  }
  addEventListener("scroll", redraw, { passive: true, capture: true });
  addEventListener("resize", redraw);
  new ResizeObserver(redraw).observe(doc.documentElement);

  // ---- Toolbar

  function button(label, title, fn) {
    const b = doc.createElement("button");
    b.type = "button";
    b.innerHTML = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the text selection
    b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  const sep = () => Object.assign(doc.createElement("span"), { className: "sep" });
  function drawBar() {
    bar.replaceChildren();
    if (!selected) return;
    const t = selected;
    const rich = t.kind === "block" || t.kind === "md" || (t.kind === "field" && host.map.data[t.id]?.html);
    if (editing && rich) {
      bar.append(button("<b>B</b>", "Bold", () => wrap("strong")), button("<i>I</i>", "Italic", () => wrap("em")), button("Link", "Link", link));
      if (t.kind === "md") bar.append(button("H2", "Heading", () => block("h2")), button("H3", "Subheading", () => block("h3")), button("¶", "Paragraph", () => block("p")), button("List", "Bulleted list", () => doc.execCommand("insertUnorderedList")), button("Quote", "Quote", () => block("blockquote")));
      bar.append(sep());
    }
    if (editing) bar.append(button("Done", "Save (Enter)", () => commit()), button("Cancel", "Undo this edit (Esc)", () => cancel()));
    if (!editing && isEditableKind(t.kind)) bar.append(button("Edit", "Edit text", () => startEditing(t)));
    if (t.kind === "element" || t.kind === "image" || t.kind === "block") {
      if (bar.childNodes.length) bar.append(sep());
      bar.append(
        button("↑", "Move up", () => host.op("up", t)),
        button("↓", "Move down", () => host.op("down", t)),
        button("Duplicate", "Duplicate", () => host.op("duplicate", t)),
        button("Delete", "Delete", () => host.op("delete", t)),
      );
    }
    if (t.kind === "field" && host.itemOf(t)) {
      if (bar.childNodes.length) bar.append(sep());
      bar.append(
        button("↑", "Move item up", () => host.op("item-up", t)),
        button("↓", "Move item down", () => host.op("item-down", t)),
        button("Duplicate", "Duplicate item", () => host.op("item-duplicate", t)),
        button("Delete", "Delete item", () => host.op("item-delete", t)),
      );
    }
    const parent = parentTarget(t);
    if (parent) bar.append(sep(), button("Parent", "Select the element around this", () => select(parent)));
  }
  function parentTarget(t) {
    const p = t.el.parentElement && targetOf(t.el.parentElement, true);
    return p && p.el !== t.el ? p : null;
  }

  // ---- Selecting

  function select(t, fromHost) {
    if (editing && !same(editing, t)) commit();
    selected = t;
    drawBar();
    redraw();
    if (!fromHost) host.select(t ? { kind: t.kind, id: t.id, tag: t.el.tagName.toLowerCase(), attrs: dynamicAttrs(t.el), src: t.el.getAttribute?.("src"), href: t.el.closest?.("a")?.getAttribute("href") } : null);
  }
  const dynamicAttrs = (el) => Object.fromEntries([...el.attributes].filter((a) => a.name.startsWith("data-sxa-")).map((a) => [a.name.slice(9), +a.value]));

  // ---- Editing text in place

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
  const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const VOIDS = new Set(["br", "img", "wbr", "hr"]);
  function serialize(node) {
    let s = "";
    for (const c of node.childNodes) {
      if (c.nodeType === 3) s += esc(c.data);
      else if (c.nodeType === 1) {
        const t = c.tagName.toLowerCase();
        if (t === "sx-ui") continue;
        if (t === "sx-f" || t === "sx-t" || t === "sx-md") { s += serialize(c); continue; }
        const attrs = [...c.attributes]
          .filter((a) => !a.name.startsWith("data-sx") && a.name !== "contenteditable" && a.name !== "spellcheck")
          .map((a) => ` ${a.name}="${escAttr(host.unbase(a.name, a.value))}"`).join("");
        s += VOIDS.has(t) ? `<${t}${attrs}>` : `<${t}${attrs}>${serialize(c)}</${t}>`;
      }
    }
    return s;
  }

  let before = "";
  let formatted = false;
  function caretAt(x, y) {
    const r = doc.caretRangeFromPoint?.(x, y) || (() => { const p = doc.caretPositionFromPoint?.(x, y); if (!p) return null; const r = doc.createRange(); r.setStart(p.offsetNode, p.offset); return r; })();
    if (!r) return;
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }
  function startEditing(t, x, y) {
    if (editing && same(editing, t)) return;
    if (editing) commit();
    select(t);
    editing = t;
    before = t.el.innerHTML;
    formatted = false;
    const rich = t.kind === "block" || t.kind === "md" || (t.kind === "field" && host.map.data[t.id]?.html);
    t.el.setAttribute("contenteditable", rich ? "true" : "plaintext-only");
    if (t.el.contentEditable !== "true" && t.el.contentEditable !== "plaintext-only") t.el.setAttribute("contenteditable", "true");
    t.el.spellcheck = true;
    t.el.focus({ preventScroll: true });
    if (x !== undefined) caretAt(x, y);
    drawBar();
    redraw();
  }
  function stopEditing() {
    if (!editing) return null;
    const t = editing;
    editing = null;
    t.el.removeAttribute("contenteditable");
    t.el.removeAttribute("spellcheck");
    t.el.blur();
    drawBar();
    redraw();
    return t;
  }
  function commit() {
    const t = stopEditing();
    if (!t || t.el.innerHTML === before) return;
    let value;
    let html = true;
    if (t.kind === "md") value = t.el.innerHTML;
    else if (t.kind === "field") { html = !!host.map.data[t.id]?.html; value = html ? serialize(t.el) : t.el.textContent; }
    else if (t.kind === "run") { html = false; value = t.el.textContent; }
    else {
      const entry = host.map.els[t.id];
      // Plain text in the source stays plain, even if the site's own script
      // has since split it into letters.
      html = !(entry.plain && !formatted);
      value = html ? serialize(t.el) : t.el.textContent;
    }
    // Every copy of the same source (includes, loops, repeated data) follows
    const twins = t.kind === "field" ? `sx-f[data-sxf="${t.id}"]` : t.kind === "md" ? null : `[data-sx="${t.id}"]`;
    if (twins) doc.querySelectorAll(twins).forEach((n) => { if (n !== t.el) n.innerHTML = t.el.innerHTML; });
    host.commit({ kind: t.kind, id: t.id }, value, html);
  }
  function cancel() {
    const t = stopEditing();
    if (t) t.el.innerHTML = before;
  }

  function wrap(tagName) {
    const s = getSelection();
    if (!s.rangeCount || s.isCollapsed) return;
    const range = s.getRangeAt(0);
    const inside = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement).closest(tagName);
    if (inside && editing?.el.contains(inside) && inside !== editing.el) {
      inside.replaceWith(...inside.childNodes);
    } else {
      const el = doc.createElement(tagName);
      el.append(range.extractContents());
      range.insertNode(el);
      s.removeAllRanges();
      const r = doc.createRange();
      r.selectNodeContents(el);
      s.addRange(r);
    }
    formatted = true;
    redraw();
  }
  function link() {
    const s = getSelection();
    if (!s.rangeCount) return;
    const node = s.anchorNode?.nodeType === 1 ? s.anchorNode : s.anchorNode?.parentElement;
    const existing = node?.closest("a");
    const href = prompt("Link to (leave empty to remove the link)", existing ? host.unbase("href", existing.getAttribute("href")) : "/");
    if (href === null) return;
    if (existing && editing?.el.contains(existing)) {
      if (!href) existing.replaceWith(...existing.childNodes); else existing.setAttribute("href", href);
    } else if (href && !s.isCollapsed) {
      const range = s.getRangeAt(0);
      const a = doc.createElement("a");
      a.setAttribute("href", href);
      a.append(range.extractContents());
      range.insertNode(a);
    }
    formatted = true;
  }
  function block(tag) {
    doc.execCommand("formatBlock", false, tag);
    formatted = true;
  }

  // ---- Pointer and keys. In edit mode the site doesn't get clicks (so
  // links don't navigate and buttons don't fire); ⌘/Ctrl-click passes them on.

  const passThrough = (e) => host.interact || e.metaKey || e.ctrlKey;
  addEventListener("mousemove", (e) => {
    if (passThrough(e)) { if (hovered) { hovered = null; redraw(); } return; }
    const t = targetOf(e.target, e.altKey);
    if (!same(t, hovered)) { hovered = t; redraw(); }
  }, true);
  doc.addEventListener("mouseleave", () => { hovered = null; redraw(); });
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick"]) {
    addEventListener(type, (e) => {
      if (passThrough(e) || e.target === layer) return;
      if (editing && editing.el.contains(e.target)) return;
      e.stopPropagation();
      if (type !== "pointerdown" && type !== "mousedown") return;
      e.preventDefault();
    }, true);
  }
  addEventListener("click", (e) => {
    if (passThrough(e)) return;
    if (e.target === layer) return;
    if (editing && editing.el.contains(e.target)) { e.preventDefault(); return; }
    e.preventDefault();
    e.stopPropagation();
    const t = targetOf(e.target, e.altKey);
    if (!t) { select(null); return; }
    if (isEditableKind(t.kind)) startEditing(t, e.clientX, e.clientY);
    else select(t);
  }, true);
  addEventListener("submit", (e) => { if (!host.interact) e.preventDefault(); }, true);

  doc.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (editing) {
      const t = editing;
      const multiline = t.kind === "md";
      if (e.key === "Escape") { e.preventDefault(); cancel(); return; }
      if (e.key === "Enter" && !multiline && !e.shiftKey) { e.preventDefault(); commit(); return; }
      if (e.key === "Enter" && !multiline && e.shiftKey) {
        e.preventDefault();
        if (t.kind === "block" || host.map.data[t.id]?.html) { doc.execCommand("insertLineBreak"); formatted = true; }
        return;
      }
      if (mod && (e.key === "b" || e.key === "i") && t.kind !== "run" && !(t.kind === "field" && !host.map.data[t.id]?.html)) { e.preventDefault(); wrap(e.key === "b" ? "strong" : "em"); return; }
      if (mod && e.key === "s") { e.preventDefault(); commit(); return; }
      if (mod && e.key === "a") {
        e.preventDefault();
        const r = doc.createRange();
        r.selectNodeContents(t.el);
        getSelection().removeAllRanges();
        getSelection().addRange(r);
        return;
      }
      e.stopPropagation();
      return;
    }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? host.redo() : host.undo(); return; }
    if (mod && e.key === "y") { e.preventDefault(); host.redo(); return; }
    if (e.key === "Escape" && selected) { select(null); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && selected && (selected.kind === "element" || selected.kind === "image")) { e.preventDefault(); host.op("delete", selected); }
  }, true);
  // Paste as plain text: no fonts or styles from elsewhere
  doc.addEventListener("paste", (e) => {
    if (!editing) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    doc.execCommand("insertText", false, editing.kind === "md" ? text : text.replace(/\s*\n\s*/g, " "));
  }, true);
  doc.addEventListener("focusout", (e) => {
    if (editing && e.target === editing.el && !shadow.contains(e.relatedTarget)) setTimeout(() => { if (editing && doc.activeElement !== editing.el) commit(); }, 0);
  });

  // ---- What the playground can ask for

  window.__sxFrameApi = {
    selectById(kind, id) {
      const el = kind === "field" ? doc.querySelector(`sx-f[data-sxf="${id}"]`) : kind === "md" ? doc.querySelector(`[data-sxmd="${id}"]`) : doc.querySelector(kind === "run" ? `sx-t[data-sx="${id}"]` : `[data-sx="${id}"]`);
      if (!el) { select(null, true); return false; }
      select({ kind, id, el }, true);
      return true;
    },
    clear() { if (editing) commit(); select(null, true); },
    refresh() { drawBar(); redraw(); },
    editing: () => !!editing,
  };
})();
