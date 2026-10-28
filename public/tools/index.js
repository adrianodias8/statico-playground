// The Tools drawer: design tools that write into the project. A tool's output
// can be copied, added to one of the site's stylesheets, applied to the
// element selected in the preview (a class on the element, a rule in the
// stylesheet), or inserted after it; tools with files of their own (favicons,
// fonts, images) write them through the host. Rules the drawer adds sit
// between "tools:" comments, so adding again updates them in place.
import { h, Kit, copyText } from "./kit.js";

const MODULES = ["./color.js", "./layout.js", "./type.js", "./effects.js", "./utils.js", "./code.js"];
const GROUPS = ["Color", "Layout", "Typography", "Effects", "Utilities", "Code & SEO"];

export function createTools(host) {
  let tools = [];
  let loaded = null;
  let active = null; // { tool, kit, out, linked, cls }
  const classNames = {};

  const search = h("input", { type: "search", class: "tools__search", placeholder: "Search tools", "aria-label": "Search tools" });
  const picker = h("select", { class: "tools__picker", "aria-label": "Tool" });
  const nav = h("nav", { class: "tools__nav", "aria-label": "Tools" });
  const view = h("section", { class: "tools__view", "aria-live": "off" });
  const drawer = h("aside", { class: "tools", hidden: true, "aria-label": "Tools" },
    h("header", { class: "tools__head" },
      h("h2", { class: "tools__title" }, "Tools"),
      search, picker,
      h("button", { type: "button", class: "icon", "aria-label": "Close tools", onclick: () => close() }, "✕")),
    h("div", { class: "tools__body" }, nav, view));
  document.body.append(drawer);

  async function load() {
    loaded ??= Promise.allSettled(MODULES.map((m) => import(m))).then((mods) => {
      for (const [i, r] of mods.entries()) {
        if (r.status !== "fulfilled") { console.warn(`Tools: ${MODULES[i]}`, r.reason); continue; }
        tools.push(...(r.value.tools || []));
        if (r.value.styles) document.head.append(h("style", { "data-tools": MODULES[i] }, r.value.styles));
      }
      tools.sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
      drawNav();
    });
    return loaded;
  }

  function drawNav() {
    const q = search.value.trim().toLowerCase();
    const match = (t) => !q || `${t.name} ${t.blurb} ${t.group} ${t.keywords || ""}`.toLowerCase().includes(q);
    nav.replaceChildren();
    picker.replaceChildren();
    for (const g of GROUPS) {
      const list = tools.filter((t) => t.group === g && match(t));
      if (!list.length) continue;
      nav.append(h("p", { class: "tools__group" }, g, h("span", {}, String(list.length))));
      const og = h("optgroup", { label: g });
      for (const t of list) {
        nav.append(h("button", { type: "button", class: "tools__link", "aria-current": String(active?.tool === t), onclick: () => openTool(t.id) }, t.name));
        og.append(h("option", { value: t.id, selected: active?.tool === t }, t.name));
      }
      picker.append(og);
    }
    if (!nav.children.length) nav.append(h("p", { class: "tk-note tools__none" }, `No tool matches “${search.value}”.`));
  }
  search.addEventListener("input", drawNav);
  search.addEventListener("keydown", (e) => { if (e.key === "Enter") nav.querySelector(".tools__link")?.click(); });
  picker.addEventListener("change", () => openTool(picker.value));

  function openTool(id) {
    const tool = tools.find((t) => t.id === id) || tools[0];
    if (!tool) return;
    try { localStorage.setItem("statico-playground-tool", tool.id); } catch {}
    const slots = { controls: h("div", { class: "tools__controls" }), stage: h("div", { class: "tools__stage" }), body: h("div", { class: "tools__extra" }) };
    const outBox = h("div", { class: "tools__out" });
    const kit = new Kit(host, tool, slots);
    active = { tool, kit, out: null, linked: null, outBox, view: "CSS" };
    kit.onOut = (o) => { active.out = o; drawOut(); syncLinked(); };
    view.replaceChildren(
      h("header", { class: "tools__intro" }, h("p", { class: "tools__kicker" }, tool.group), h("h3", {}, tool.name), h("p", { class: "tk-note" }, tool.blurb)),
      h("div", { class: `tools__work${tool.wide ? " tools__work--wide" : ""}` }, slots.controls, slots.stage),
      slots.body, outBox);
    try {
      const draw = tool.render(kit);
      kit.draw = () => { try { draw?.(); } catch (err) { console.error(err); } };
      if (!slots.stage.children.length) slots.stage.remove();
      kit.draw();
    } catch (err) {
      console.error(err);
      slots.controls.replaceChildren(h("p", { class: "tk-note" }, `This tool failed to start: ${err.message}`));
    }
    view.scrollTop = 0;
    drawNav();
  }

  // ---- Output

  const clsOf = () => {
    const o = active.out;
    return classNames[active.tool.id] ?? o?.name ?? active.tool.id;
  };
  const usesClass = (o) => !!(o && !o.root && (o.decl || (o.css && o.css.includes("{cls}")) || (o.html && o.html.includes("{cls}"))));
  function cssOf(o) {
    const cls = clsOf();
    const parts = [];
    if (o.decl) parts.push(`${o.root ? ":root" : `.${cls}`} {\n${o.decl.trim().replaceAll("{cls}", cls).split("\n").map((l) => `  ${l.trim()}`).join("\n")}\n}`);
    if (o.css) parts.push(o.css.trim().replaceAll("{cls}", cls));
    return parts.join("\n\n");
  }
  function viewsOf(o) {
    const views = [];
    if (o.decl || o.css) views.push({ label: "CSS", code: cssOf(o) });
    if (o.html) views.push({ label: "HTML", code: o.html.trim().replaceAll("{cls}", clsOf()) });
    for (const t of o.tabs || []) views.push({ label: t.label, code: t.code.replaceAll("{cls}", clsOf()) });
    if (o.text != null) views.push({ label: o.textLabel || "Result", code: o.text });
    return views;
  }

  function drawOut() {
    const o = active.out;
    const box = active.outBox;
    if (!o) { box.replaceChildren(); return; }
    const views = viewsOf(o);
    const cur = views.find((v) => v.label === active.view) || views[0];
    const sel = host.selection();
    const css = o.decl || o.css;
    const kids = [];
    if (views.length) {
      kids.push(h("div", { class: "tools__tabs", role: "tablist" }, views.map((v) => h("button", { type: "button", role: "tab", "aria-selected": String(v === cur), onclick: () => { active.view = v.label; drawOut(); } }, v.label))));
      kids.push(h("pre", { class: "tools__code", tabindex: "0" }, h("code", {}, cur.code)));
    }
    const row = [];
    if (cur) row.push(h("button", { type: "button", onclick: () => copyText(cur.code).then((ok) => host.notify(ok ? `Copied the ${cur.label}` : "Couldn't copy", ok ? "ok" : "error")) }, "Copy"));
    if (usesClass(o)) {
      const input = h("input", { type: "text", class: "tk-input tk-mono tools__cls", value: clsOf(), spellcheck: "false", "aria-label": "Class name" });
      input.addEventListener("change", () => {
        const v = input.value.trim().replace(/^\./, "").replace(/[^\w-]+/g, "-");
        if (!v) return;
        classNames[active.tool.id] = v;
        active.linked = null;
        drawOut();
      });
      kids.push(h("label", { class: "tools__clsrow" }, h("span", { class: "tk-label" }, "Class"), h("span", { class: "tools__dot" }, "."), input));
    }
    if (css) {
      const files = host.cssFiles();
      if (files.length) {
        const target = h("select", { class: "tk-input tools__file", "aria-label": "Stylesheet" }, files.map((f) => h("option", { value: f, selected: f === (active.linked?.file || host.defaultCss()) }, f)));
        row.push(h("span", { class: "tools__addto" }, h("button", { type: "button", onclick: () => addCss(target.value, false) }, "Add to stylesheet"), target));
        if (usesClass(o) && o.decl) row.push(h("button", { type: "button", class: "primary", disabled: !sel, title: sel ? `Adds .${clsOf()} to ${sel.label} and the rule to ${target.value}` : "Select an element in the preview first (Alt-click selects the element around text)", onclick: () => addCss(target.value, true) }, sel ? `Apply to ${sel.short}` : "Apply to selection"));
      } else row.push(h("span", { class: "tk-note" }, "This project has no stylesheet yet; ", h("button", { type: "button", class: "link", onclick: () => { host.write("assets/css/main.css", ""); drawOut(); } }, "create assets/css/main.css")));
    }
    if (o.html && o.insert !== false) row.push(h("button", { type: "button", disabled: !sel, title: sel ? `Inserts the HTML after ${sel.label}` : "Select an element in the preview to insert after it", onclick: () => insertHtml() }, sel ? `Insert after ${sel.short}` : "Insert after selection"));
    for (const a of (o.actions || []).filter(Boolean)) row.push(h("button", { type: "button", class: a.primary ? "primary" : null, disabled: a.disabled, title: a.title, onclick: a.run }, a.label));
    kids.push(h("div", { class: "tools__actions" }, row));
    if (active.linked) {
      const live = h("input", { type: "checkbox", checked: active.linked.live });
      live.addEventListener("change", () => { active.linked.live = live.checked; });
      kids.push(h("label", { class: "tk-toggle tools__live" }, live, h("span", {}, `Keep ${active.linked.what} in ${active.linked.file} in step with these settings`)));
    }
    box.replaceChildren(...kids);
  }

  function upsert(file, key, css) {
    const begin = `/* tools: ${key} */`;
    const end = `/* /tools: ${key} */`;
    let text = host.read(file) ?? "";
    const block = `${begin}\n${css.trim()}\n${end}`;
    const i = text.indexOf(begin);
    const j = i >= 0 ? text.indexOf(end, i) : -1;
    if (i >= 0 && j >= 0) text = text.slice(0, i) + block + text.slice(j + end.length);
    else text = `${text.replace(/\s*$/, text.trim() ? "\n\n" : "")}${block}\n`;
    return text;
  }
  const keyOf = (o) => `${active.tool.id} ${o.root ? ":root" : usesClass(o) ? `.${clsOf()}` : ""}`.trim();

  function addCss(file, apply) {
    const o = active.out;
    const css = cssOf(o);
    const key = keyOf(o);
    const what = o.root ? "the :root variables" : usesClass(o) ? `.${clsOf()}` : `the ${active.tool.name} rules`;
    const ok = host.change(() => {
      host.write(file, upsert(file, key, css));
      if (apply) host.addClass(clsOf());
    });
    if (!ok) return;
    active.linked = { file, key, live: true, what };
    host.notify(apply ? `Applied .${clsOf()} — rule in ${file}` : `Added ${what} to ${file}`, "ok");
    drawOut();
  }
  let liveTimer = 0;
  function syncLinked() {
    const l = active?.linked;
    if (!l?.live) return;
    clearTimeout(liveTimer);
    const tool = active.tool;
    liveTimer = setTimeout(() => {
      if (active?.tool !== tool || !active.linked?.live || keyOf(active.out) !== l.key) return;
      const next = upsert(l.file, l.key, cssOf(active.out));
      if (next !== host.read(l.file)) host.change(() => host.write(l.file, next));
    }, 450);
  }
  function insertHtml() {
    const o = active.out;
    if (host.change(() => host.insertAfter(o.html.trim().replaceAll("{cls}", clsOf())))) host.notify("Inserted after the selected element", "ok");
  }

  // ---- Open and close

  async function open(id) {
    drawer.hidden = false;
    document.body.dataset.tools = "open";
    drawer.style.setProperty("--bar-h", `${Math.round(document.querySelector(".bar")?.getBoundingClientRect().bottom || 0)}px`);
    await load();
    let last = null;
    try { last = localStorage.getItem("statico-playground-tool"); } catch {}
    if (id || !active) openTool(id || last);
    search.focus({ preventScroll: true });
  }
  function close() {
    drawer.hidden = true;
    delete document.body.dataset.tools;
    host.closed?.();
  }
  drawer.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.target.closest("select")) { e.preventDefault(); close(); } });

  return {
    open, close,
    toggle() { drawer.hidden ? open() : close(); },
    get isOpen() { return !drawer.hidden; },
    // The selection or the project changed: refresh what depends on them
    refresh() { if (!drawer.hidden && active?.out) drawOut(); active?.tool.refresh?.(active.kit); },
  };
}
