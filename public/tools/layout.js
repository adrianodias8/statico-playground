// Layout tools: grid and flexbox builders, a spacing scale, the site at
// several screen sizes, aspect ratios and section dividers. Each previews
// live and hands its CSS (or HTML) to the drawer.
import { h, round, projectColors, parseColor, toHex } from "./kit.js";

const px = (n) => `${round(n, 2)}px`;
const rem = (n, base = 16) => `${round(n / base, 4)}rem`;

// ---- Grid

// "header header\nnav main" → { rows: [["header","header"],["nav","main"]], names, ok }
export function parseAreas(text) {
  const rows = String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.replace(/^"|"$/g, "").trim().split(/\s+/));
  if (!rows.length) return { rows: [], names: [], ok: true };
  const ok = rows.every((r) => r.length === rows[0].length) && rows.flat().every((n) => /^(\.+|[a-zA-Z_][\w-]*)$/.test(n));
  const names = [...new Set(rows.flat().filter((n) => !/^\.+$/.test(n)))];
  return { rows, names, ok };
}
export function gridDecl(s) {
  const areas = parseAreas(s.areas);
  const lines = ["display: grid;", `grid-template-columns: ${s.cols.trim() || "1fr"};`];
  if (s.rows.trim()) lines.push(`grid-template-rows: ${s.rows.trim()};`);
  if (areas.rows.length && areas.ok) lines.push(`grid-template-areas:\n${areas.rows.map((r) => `  "${r.join(" ")}"`).join("\n")};`);
  lines.push(s.rowGap === s.colGap ? `gap: ${px(s.rowGap)};` : `gap: ${px(s.rowGap)} ${px(s.colGap)};`);
  if (s.align !== "stretch") lines.push(`align-items: ${s.align};`);
  return { decl: lines.join("\n"), areas };
}

const grid = {
  id: "grid", name: "CSS Grid", group: "Layout", blurb: "Lay out columns, rows and named areas, see the cells move, then put the grid on any element.", keywords: "layout columns rows areas template",
  render(t) {
    const s = { cols: "repeat(3, minmax(0, 1fr))", rows: "", rowGap: 16, colGap: 16, items: 6, areas: "", align: "stretch" };
    const areaNote = t.note("");
    t.controls(
      t.presets([
        { label: "3 columns", apply: () => Object.assign(s, { cols: "repeat(3, minmax(0, 1fr))", rows: "", areas: "", items: 6 }) },
        { label: "12 columns", apply: () => Object.assign(s, { cols: "repeat(12, minmax(0, 1fr))", rows: "", areas: "", items: 12, rowGap: 16, colGap: 24 }) },
        { label: "Sidebar", apply: () => Object.assign(s, { cols: "16rem minmax(0, 1fr)", rows: "", areas: "", items: 2 }) },
        { label: "Holy grail", apply: () => Object.assign(s, { cols: "12rem minmax(0, 1fr) 12rem", rows: "auto 1fr auto", areas: "header header header\nnav main aside\nfooter footer footer" }) },
        { label: "Bento", apply: () => Object.assign(s, { cols: "repeat(4, minmax(0, 1fr))", rows: "repeat(3, 7rem)", areas: "hero hero side tall\nhero hero wide tall\nfoot foot wide end" }) },
        { label: "Auto-fit cards", apply: () => Object.assign(s, { cols: "repeat(auto-fit, minmax(12rem, 1fr))", rows: "", areas: "", items: 6 }) },
      ]),
      t.text(s, "cols", { label: "Columns", mono: true }),
      t.text(s, "rows", { label: "Rows", mono: true, placeholder: "auto" }),
      t.row(t.range(s, "colGap", { label: "Column gap", max: 64, unit: "px" }), t.range(s, "rowGap", { label: "Row gap", max: 64, unit: "px" })),
      t.range(s, "items", { label: "Items (without areas)", min: 1, max: 24 }),
      t.select(s, "align", ["stretch", "start", "center", "end"], { label: "Align items" }),
      t.text(s, "areas", { label: "Named areas (one row per line, . for empty)", mono: true, area: true, rows: 4, placeholder: "header header\nnav main" }),
      areaNote,
    );
    const box = t.stage({ center: false });
    return () => {
      const { decl, areas } = gridDecl(s);
      areaNote.textContent = areas.ok ? (areas.names.length ? `${areas.names.length} areas: ${areas.names.join(", ")}` : "") : "Every row needs the same number of names; names are letters, digits, - and _.";
      areaNote.style.color = areas.ok ? "" : "var(--error)";
      const g = h("div", { class: "tl-grid" });
      g.style.cssText = decl.replace(/\n\s*/g, " ");
      const named = areas.ok && areas.names.length;
      const cells = named ? areas.names : Array.from({ length: s.items }, (_, i) => String(i + 1));
      g.append(...cells.map((n) => h("div", { class: "tl-cell", style: named ? { gridArea: n } : null }, n)));
      box.replaceChildren(g);
      const css = named ? areas.names.map((n, i) => `.{cls} > :nth-child(${i + 1}) { grid-area: ${n}; }`).join("\n") : "";
      t.out({ decl, css, name: "grid" });
    };
  },
};

// ---- Flexbox

const flexbox = {
  id: "flexbox", name: "Flexbox", group: "Layout", blurb: "Direction, wrapping, alignment and gap for a row or column of items.", keywords: "flex layout align justify",
  render(t) {
    const s = { dir: "row", wrap: "nowrap", justify: "flex-start", items: "stretch", content: "normal", gap: 12, count: 5, grow: false };
    const J = ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"];
    t.controls(
      t.presets([
        { label: "Centre it", apply: () => Object.assign(s, { dir: "row", wrap: "nowrap", justify: "center", items: "center", count: 1 }) },
        { label: "Nav bar", apply: () => Object.assign(s, { dir: "row", wrap: "nowrap", justify: "space-between", items: "center", count: 4, grow: false }) },
        { label: "Wrapping cards", apply: () => Object.assign(s, { dir: "row", wrap: "wrap", justify: "flex-start", items: "stretch", count: 9, grow: true, gap: 16 }) },
        { label: "Stack", apply: () => Object.assign(s, { dir: "column", wrap: "nowrap", justify: "flex-start", items: "stretch", count: 4, grow: false }) },
      ]),
      t.seg(s, "dir", ["row", "row-reverse", "column", "column-reverse"], { label: "Direction" }),
      t.seg(s, "wrap", ["nowrap", "wrap", "wrap-reverse"], { label: "Wrap" }),
      t.select(s, "justify", J, { label: "Justify content" }),
      t.select(s, "items", ["stretch", "flex-start", "center", "flex-end", "baseline"], { label: "Align items" }),
      t.select(s, "content", ["normal", ...J, "stretch"], { label: "Align content (when wrapping)" }),
      t.range(s, "gap", { label: "Gap", max: 64, unit: "px" }),
      t.range(s, "count", { label: "Items", min: 1, max: 12 }),
      t.toggle(s, "grow", { label: "Items grow to fill (flex: 1)" }),
    );
    const box = t.stage({ center: false });
    const W = [5, 7, 4, 8, 6, 5, 9, 4, 6, 7, 5, 8];
    const H = [3, 4.5, 2.5, 5, 3.5, 4, 2.5, 3, 4.5, 3, 5, 3.5];
    return () => {
      const lines = ["display: flex;"];
      if (s.dir !== "row") lines.push(`flex-direction: ${s.dir};`);
      if (s.wrap !== "nowrap") lines.push(`flex-wrap: ${s.wrap};`);
      if (s.justify !== "flex-start") lines.push(`justify-content: ${s.justify};`);
      if (s.items !== "stretch") lines.push(`align-items: ${s.items};`);
      if (s.wrap !== "nowrap" && s.content !== "normal") lines.push(`align-content: ${s.content};`);
      if (s.gap) lines.push(`gap: ${px(s.gap)};`);
      const decl = lines.join("\n");
      const f = h("div", { class: "tl-flex" });
      f.style.cssText = decl.replace(/\n/g, " ");
      const col = s.dir.startsWith("column");
      for (let i = 0; i < s.count; i++) {
        const st = s.grow ? { flex: "1 1 0" } : {};
        if (!col) { st.minWidth = `${W[i]}rem`; if (s.items !== "stretch") st.height = `${H[i]}rem`; }
        else if (s.items !== "stretch") st.width = `${W[i] * 1.5}rem`;
        if (col) st.minHeight = "2.2rem";
        f.append(h("div", { class: "tl-cell", style: st }, String(i + 1)));
      }
      box.replaceChildren(f);
      t.out({ decl, css: s.grow ? ".{cls} > * { flex: 1 1 0; }" : "", name: "flex" });
    };
  },
};

// ---- Spacing scale

const TSHIRT = ["3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"];
export function spacingSteps(s) {
  const out = [];
  for (let i = -s.below; i <= s.above; i++) {
    const v = s.mode === "ratio" ? s.base * s.ratio ** i : s.base + i * s.step;
    if (v <= 0) continue;
    out.push({ i, v });
  }
  return out.map((o, n) => ({ ...o, name: s.names === "tshirt" ? (TSHIRT[o.i + 4] ?? (o.i < 0 ? `${-o.i - 1}xs` : `${o.i - 1}xl`)) : String(n + 1) }));
}

const spacing = {
  id: "spacing-scale", name: "Spacing scale", group: "Layout", blurb: "A set of spacing sizes from one base value, as custom properties for the whole site.", keywords: "space tokens margin padding variables",
  render(t) {
    const s = { base: 16, mode: "ratio", ratio: 1.5, step: 8, below: 3, above: 5, names: "tshirt", unit: "rem", prefix: "--space" };
    t.controls(
      t.range(s, "base", { label: "Base (m)", min: 2, max: 48, unit: "px" }),
      t.seg(s, "mode", [["ratio", "Multiply"], ["linear", "Add"]], { label: "Each step" }),
      t.range(s, "ratio", { label: "Ratio", min: 1.05, max: 2.5, step: 0.05 }),
      t.range(s, "step", { label: "Step (when adding)", min: 1, max: 32, unit: "px" }),
      t.row(t.range(s, "below", { label: "Smaller", min: 0, max: 4 }), t.range(s, "above", { label: "Larger", min: 0, max: 7 })),
      t.seg(s, "names", [["tshirt", "xs … xl"], ["numbers", "1, 2, 3"]], { label: "Names" }),
      t.seg(s, "unit", ["rem", "px"], { label: "Unit" }),
      t.text(s, "prefix", { label: "Prefix", mono: true }),
    );
    const box = t.stage({ center: false });
    return () => {
      const steps = spacingSteps(s);
      const max = Math.max(...steps.map((x) => x.v), 1);
      box.replaceChildren(h("div", { class: "tl-bars" }, steps.map((x) => h("div", { class: "tl-bar" },
        h("code", {}, `${s.prefix}-${x.name}`),
        h("span", { class: "tl-bar__track" }, h("span", { class: "tl-bar__fill", style: { width: `${Math.max(1, (x.v / max) * 100)}%` } })),
        h("span", { class: "tl-bar__v" }, `${round(x.v, 1)}px`)))));
      const decl = steps.map((x) => `${s.prefix}-${x.name}: ${s.unit === "rem" ? rem(x.v) : px(x.v)};`).join("\n");
      t.out({ decl, root: true, name: "space" });
    };
  },
};

// ---- Responsive preview

const DEVICES = [["phone", "Phone", 375, 812], ["tablet", "Tablet", 768, 1024], ["laptop", "Laptop", 1280, 800], ["desktop", "Desktop", 1440, 900]];
const responsive = {
  id: "responsive", name: "Responsive preview", group: "Layout", blurb: "The page in the preview at several screen widths side by side. Edits show up after a reload.", keywords: "devices breakpoints mobile tablet screens", wide: true,
  render(t) {
    const host = t.host;
    const s = { path: host.previewPath(), follow: true, phone: true, tablet: true, laptop: true, desktop: false, custom: false, cw: 1024, height: 380 };
    const pageSel = h("select", { class: "tk-input" });
    const fillPages = () => {
      const list = host.pages().map((p) => p.url);
      if (!list.includes(s.path)) list.unshift(s.path);
      pageSel.replaceChildren(...list.map((u) => h("option", { value: u, selected: u === s.path }, u)));
    };
    pageSel.addEventListener("change", () => { s.path = pageSel.value; s.follow = false; t.sync(); t.draw(); });
    fillPages();
    t.controls(t.row(
      t.field("Page", pageSel),
      t.group(null, t.toggle(s, "follow", { label: "Follow the preview" })),
      t.group("Sizes", h("div", { class: "tl-checks" }, DEVICES.map(([k, l, w]) => t.toggle(s, k, { label: `${l} ${w}` })), t.toggle(s, "custom", { label: "Custom" }))),
      t.number(s, "cw", { label: "Custom width", min: 240, max: 2560, unit: "px" }),
      t.range(s, "height", { label: "Preview height", min: 220, max: 720, unit: "px" }),
    ));
    const strip = h("div", { class: "tl-devices" });
    t.add(strip);
    const frames = new Map();
    const reload = () => { for (const f of frames.values()) { try { f.iframe.contentWindow.location.reload(); } catch { f.iframe.src = f.iframe.src; } } };
    t.refreshHook = () => {
      fillPages();
      if (s.follow && host.previewPath() !== s.path) { s.path = host.previewPath(); fillPages(); t.draw(); }
    };
    return () => {
      if (s.follow) s.path = host.previewPath();
      pageSel.value = s.path;
      const url = host.previewUrl(s.path);
      const list = DEVICES.filter(([k]) => s[k]).map(([, l, w, ht]) => [l, w, ht]);
      if (s.custom && s.cw >= 200) list.push(["Custom", Math.round(s.cw), 900]);
      const keep = new Set();
      const kids = [];
      for (const [label, w, ht] of list) {
        const key = `${w}|${url}`;
        keep.add(key);
        let f = frames.get(key);
        if (!f) {
          const iframe = h("iframe", { src: url, title: `${label} preview, ${w}px wide`, loading: "lazy" });
          f = { iframe, wrap: h("div", { class: "tl-device__screen" }, iframe), cap: h("p", { class: "tl-device__cap" }) };
          frames.set(key, f);
        }
        const scale = s.height / ht;
        Object.assign(f.iframe.style, { width: `${w}px`, height: `${ht}px`, transform: `scale(${scale})` });
        Object.assign(f.wrap.style, { width: `${Math.round(w * scale)}px`, height: `${Math.round(ht * scale)}px` });
        f.cap.textContent = `${label} · ${w}×${ht}`;
        kids.push(h("figure", { class: "tl-device" }, f.wrap, f.cap));
      }
      for (const k of [...frames.keys()]) if (!keep.has(k)) frames.delete(k);
      strip.replaceChildren(...(kids.length ? kids : [t.note("Pick at least one size.")]));
      t.out({
        actions: [
          { label: "Reload all", run: reload, primary: true },
          { label: "Open the page in a new tab", run: () => window.open(url, "_blank", "noopener") },
        ],
      });
    };
  },
  refresh(t) { t.refreshHook?.(); },
};

// ---- Aspect ratio

export const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function ratioOf(w, hgt) {
  if (!(w > 0 && hgt > 0)) return null;
  const m = Number.isInteger(w) && Number.isInteger(hgt) ? 1 : 100;
  const a = Math.round(w * m), b = Math.round(hgt * m);
  const g = gcd(a, b) || 1;
  return [a / g, b / g];
}

const ratio = {
  id: "ratio", name: "Aspect ratio", group: "Layout", blurb: "Work out a ratio from a width and height, scale it to a new size, and keep boxes in shape with aspect-ratio.", keywords: "aspect ratio 16:9 dimensions resize",
  render(t) {
    const s = { w: 1920, h: 1080, nw: 1280, nh: 600 };
    const P = [[16, 9], [4, 3], [3, 2], [1, 1], [21, 9], [9, 16], [4, 5]];
    const result = h("div", { class: "tl-ratio" });
    t.controls(
      t.presets(P.map(([a, b]) => ({ label: `${a}:${b}`, apply: () => { s.w = a * 120; s.h = b * 120; } }))),
      t.row(t.number(s, "w", { label: "Width", min: 1 }), t.number(s, "h", { label: "Height", min: 1 })),
      t.group("Scale it",
        t.row(t.number(s, "nw", { label: "New width", min: 1 }), t.number(s, "nh", { label: "New height", min: 1 })),
        result),
    );
    const box = t.stage();
    return () => {
      const r = ratioOf(s.w, s.h);
      if (!r) { result.replaceChildren(t.note("Width and height need to be above 0.")); t.out({}); return; }
      const [a, b] = r;
      result.replaceChildren(
        h("p", { class: "tk-note" }, `${round(s.nw, 2)} wide → `, h("strong", {}, `${round((s.nw * s.h) / s.w, 2)} high`)),
        h("p", { class: "tk-note" }, `${round(s.nh, 2)} high → `, h("strong", {}, `${round((s.nh * s.w) / s.h, 2)} wide`)));
      const shape = h("div", { class: "tl-ratio__box", style: { aspectRatio: `${a} / ${b}`, width: a >= b ? "min(100%, 22rem)" : "auto", height: a >= b ? "auto" : "14rem" } },
        h("strong", {}, `${a}:${b}`), h("span", {}, `${round(s.w / s.h, 4)} · ${round((s.h / s.w) * 100, 3)}%`));
      box.replaceChildren(shape);
      t.out({ decl: `aspect-ratio: ${a} / ${b};`, name: `ratio-${a}-${b}`, tabs: [{ label: "Padding fallback", code: `.{cls} {\n  position: relative;\n  height: 0;\n  padding-top: ${round((b / a) * 100, 4)}%;\n}` }] });
    };
  },
};

// ---- Section divider

export function dividerPath(shape, count = 3) {
  const W = 1200, H = 120;
  const n = Math.max(1, Math.round(count));
  const w = W / n;
  switch (shape) {
    case "wave": {
      let d = `M0,60`;
      for (let i = 0; i < n; i++) { const x = i * w; d += ` Q${round(x + w / 4)},10 ${round(x + w / 2)},60 T${round(x + w)},60`; }
      return `${d} L${W},${H} L0,${H} Z`;
    }
    case "curve": return `M0,${H} Q600,${-H + 4} ${W},${H} Z`;
    case "tilt": return `M0,${H} L${W},0 L${W},${H} Z`;
    case "triangle": return `M0,${H} L600,0 L${W},${H} Z`;
    case "zigzag": {
      let d = `M0,${H}`;
      for (let i = 0; i < n; i++) { const x = i * w; d += ` L${round(x + w / 2)},0 L${round(x + w)},${H}`; }
      return `${d} Z`;
    }
    case "arrow": return `M0,0 L560,0 L600,${H} L640,0 L${W},0 L${W},${H} L0,${H} Z`;
    default: return `M0,${H} L${W},${H} Z`;
  }
}

const divider = {
  id: "divider", name: "Section divider", group: "Layout", blurb: "Waves, curves, tilts and zigzags between two sections, as inline SVG you can drop after any element.", keywords: "svg wave shape separator section",
  render(t) {
    const palette = projectColors(t.host, 12);
    const s = { shape: "wave", height: 80, count: 3, flipX: false, flipY: false, color: palette[0]?.value || "#111111", top: "#ffffff" };
    t.controls(
      t.seg(s, "shape", ["wave", "curve", "tilt", "triangle", "zigzag", "arrow"], { label: "Shape" }),
      t.range(s, "height", { label: "Height", min: 16, max: 240, unit: "px" }),
      t.range(s, "count", { label: "Waves or teeth", min: 1, max: 16 }),
      t.row(t.toggle(s, "flipX", { label: "Flip across" }), t.toggle(s, "flipY", { label: "Upside down" })),
      t.color(s, "color", { label: "Colour (the next section's background)" }),
      palette.length ? t.presets(palette.map((c) => ({ label: c.name, swatch: c.value, title: `${c.value} from ${c.file}`, apply: () => { s.color = c.value; } })), { label: "From the site" }) : null,
      t.color(s, "top", { label: "Preview: section above" }),
    );
    const box = t.stage({ center: false, plain: true });
    return () => {
      const c = parseColor(s.color);
      const fill = c ? (c.a < 1 ? s.color : toHex(c)) : "#111111";
      const flip = [s.flipX ? "scaleX(-1)" : "", s.flipY ? "scaleY(-1)" : ""].filter(Boolean).join(" ");
      const svg = `<svg viewBox="0 0 1200 120" preserveAspectRatio="none" width="100%" height="${s.height}" style="display:block${flip ? `;transform:${flip}` : ""}" aria-hidden="true" focusable="false"><path fill="${fill}" d="${dividerPath(s.shape, s.count)}"/></svg>`;
      const html = `<div class="{cls}" style="line-height:0">\n  ${svg}\n</div>`;
      const demo = h("div", { class: "tl-divider" }, h("div", { class: "tl-divider__a", style: { background: s.top } }));
      const holder = h("div", { style: { background: s.top, lineHeight: "0" } });
      holder.innerHTML = svg;
      demo.append(holder, h("div", { class: "tl-divider__b", style: { background: fill } }));
      box.replaceChildren(demo);
      t.out({ html, name: `divider-${s.shape}`, tabs: [{ label: "SVG", code: svg }] });
    };
  },
};

export const tools = [grid, flexbox, spacing, responsive, ratio, divider];

export const styles = `
.tl-grid, .tl-flex { width: 100%; min-height: 12rem; padding: 0.6rem; border: 1px dashed rgb(128 128 128 / 0.5); border-radius: 6px; }
.tl-cell { display: grid; place-items: center; min-height: 2.6rem; padding: 0.4rem 0.6rem; background: oklch(58% 0.17 40 / 0.16); border: 1px solid oklch(58% 0.17 40 / 0.5); border-radius: 4px; font: 600 0.82rem/1.2 var(--mono); color: inherit; overflow: hidden; }
.tl-bars { display: grid; gap: 0.45rem; width: 100%; }
.tl-bar { display: grid; grid-template-columns: 7.5rem minmax(0, 1fr) 4rem; align-items: center; gap: 0.6rem; font-size: 0.8rem; }
.tl-bar code { font-family: var(--mono); font-size: 0.78rem; overflow: hidden; text-overflow: ellipsis; }
.tl-bar__track { height: 0.9rem; }
.tl-bar__fill { display: block; height: 100%; background: oklch(58% 0.17 40); border-radius: 2px; }
.tl-bar__v { font-family: var(--mono); font-size: 0.76rem; text-align: right; opacity: 0.75; }
.tl-checks { display: grid; gap: 0.3rem; }
.tl-devices { display: flex; gap: 1.25rem; align-items: flex-end; overflow-x: auto; padding: 0.25rem 0 0.75rem; }
.tl-device { flex: none; margin: 0; display: grid; gap: 0.4rem; }
.tl-device__screen { position: relative; overflow: hidden; border: 1px solid var(--rule); border-radius: 6px; background: #fff; box-shadow: 0 6px 20px rgb(0 0 0 / 0.08); }
.tl-device__screen iframe { position: absolute; top: 0; left: 0; border: 0; transform-origin: 0 0; background: #fff; }
.tl-device__cap { margin: 0; font: 0.76rem var(--mono); color: var(--ink-soft); }
.tl-ratio { display: grid; gap: 0.3rem; }
.tl-ratio__box { display: grid; place-content: center; gap: 0.2rem; text-align: center; max-height: 16rem; max-width: 100%; background: oklch(58% 0.17 40 / 0.16); border: 1px solid oklch(58% 0.17 40 / 0.6); border-radius: 4px; }
.tl-ratio__box strong { font: 700 1.4rem/1 var(--display); }
.tl-ratio__box span { font: 0.76rem var(--mono); opacity: 0.75; }
.tl-divider { width: 100%; }
.tl-divider__a { height: 5rem; }
.tl-divider__b { height: 5rem; }
`;
