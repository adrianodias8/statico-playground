# Statico Playground

Edit a site and watch it rebuild, in your browser:
[adrianodias8.github.io/statico-playground](https://adrianodias8.github.io/statico-playground/)

[Statico](https://github.com/adrianodias8/statico) is a static site generator
written in Rust. This playground runs the same code, compiled to
WebAssembly (WASI): no server builds anything, and nothing you type leaves
the page.

- Pick a starting point (a tiny site, or Statico's blog or docs template),
  or open your own: **Project → Open a site folder…** or **Open a .zip…**
  takes any Statico project, including one an AI wrote for you.
- **Visual** mode: the preview is the editor. Click text and type; every
  change is written back into the source file it came from, then the site
  rebuilds. **Code** mode is the file tree and editor, as before.
- Every edit rebuilds the whole site; the preview is the built site itself,
  so links, CSS, fonts and images all work.
- **Tools**: 39 design tools (colour, layout, type, effects, utilities, SEO)
  whose output goes straight into the site: a stylesheet, the selected
  element, the `<head>`, `statico.json` or `assets/`.
- **Download .zip** gives you the project, ready for `statico dev`.

## Visual editing

Before a visual build the playground annotates a copy of the project
([`public/instrument.js`](public/instrument.js)), so each piece of the built
page knows where it came from. Nothing is guessed from the rendered page:

| On the page | Saved to |
|---|---|
| Text in pages, layouts and includes | that template, at the exact offsets (markup inside is kept) |
| `{item.field}` from a collection | the JSON file, at that item and key, keeping its indentation |
| `{frontmatter.title}`, `{post.title}` | the Markdown file's front matter |
| `{content}` of a Markdown page | the Markdown body, edited as a document and written back as Markdown ([Turndown](https://github.com/mixmark-io/turndown)) |
| `{site.name}` | `statico.json` |
| `<img>` and `<a>` | `src`, `alt` and `href`, in the template or in the data they come from; **Replace image…** adds the file to `assets/` |

The inspector beside the preview edits what isn't text: the page's
`<layout>` attributes (title, description), front matter, site settings, any
collection as a form (add, reorder, duplicate and delete items), and the
selected element (move, duplicate, delete, attributes). Text inside a
`<ForEach>` is marked as a template for every item; text from a layout or
include is marked as shared. Undo and redo cover every visual change.

Fields that templates compare, sort on or run through a filter (`where`,
`orderBy`, `condition` with `==`, `|date`, `|truncate`…) are left
unannotated, so the visual build renders exactly what `statico build` does:
they stay editable from the inspector. JSON collections are editable in
place; YAML, TOML and CSV collections are edited in Code mode.

The annotated copy is only ever built for the preview. Downloads, and what
you'd commit, are your files as they are.

## Tools

**Tools** in the bar opens a drawer of design tools beside the preview
([`public/tools/`](public/tools/)). Each one can copy its code, and most
can also put it in the project:

- **Add to stylesheet** writes the rule into any of the site's CSS files,
  between `/* tools: … */` comments, so adding again updates it in place.
- **Apply to `<h1>`** (or whatever is selected in the preview) adds a class
  to that element in its template and the rule to the stylesheet. After
  either, the rule follows the tool's settings as you change them.
- **Insert after** puts an HTML snippet (a divider, a button, a loader) after
  the selected element.
- Tools with files of their own write them into the project: favicons and a
  web manifest into `public/` with the tags in each layout's `<head>`,
  self-hosted fonts into `assets/fonts/`, images and SVGs into
  `assets/images/`. Meta tags are saved to `statico.json` and the page.

Colour tools start from the colours the site's stylesheets already define.
Every change is one step in Undo.

| Group | Tools |
|---|---|
| Color | Contrast checker, Color converter (also a whole stylesheet at once), Gradient generator, Gradient text, Brand colors, CSS filter, OKLCH color picker |
| Layout | CSS Grid, Flexbox, Spacing scale, Responsive preview (the site's own pages), Aspect ratio, Section divider |
| Typography | Font pairing (self-hosted or from Google Fonts, mapped onto the site's own font variables), Fluid type & space, PX ↔ REM, Clamp |
| Effects | Shadows, Text shadow, Glassmorphism, Neumorphism, Triangle, Clip path, Blobs, Patterns, Text stroke, Transitions, Animations, Buttons |
| Utilities | SVG optimizer, Base64, Lorem ipsum, Placeholder, Favicons, Loaders |
| Code & SEO | Tailwind ↔ CSS, Meta tags (saved where `{seo}` reads them), Easing curves, Radius |

## How it works

| Piece | What it does |
|---|---|
| `public/statico.wasm` | Statico, built for `wasm32-wasip1` |
| `public/worker.js` | Runs it in a Web Worker on an in-memory filesystem ([browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim)), then puts the built site in the Cache API |
| `public/sw.js` | A service worker that serves that site under `preview/` |
| `public/app.js` | The file list, the editor ([CodeMirror 5](https://codemirror.net/5/)), the preview, visual mode and its inspector |
| `public/instrument.js` | Annotates a copy of the project for a visual build, and cleans the built pages |
| `public/editor-frame.js` | Runs inside the preview in visual mode: outlines, inline editing, the toolbar |
| `public/tools/` | The Tools drawer (`index.js`), the controls and colour maths tools share (`kit.js`), and one module per group |

Statico's own repository is not changed for any of this.
`wasm/build.sh` checks Statico out at a pinned commit into `.build/`,
applies [`wasm/statico-wasm.patch`](wasm/statico-wasm.patch), and builds:

- the command-line pieces (dev server, downloads, file watching) become an
  optional feature, left out of the wasm build;
- the two places that start threads run in place on wasm, and the project
  path is used as given (a browser's WASI has no `realpath`);
- `src/bin/wasm.rs` is a small entry point that builds `/site` and prints
  the report as JSON.

Tailwind and esbuild cannot run in a browser, so sites here use plain CSS
and JavaScript, copied as they are.

## Running it

```bash
wasm/build.sh                                  # Statico from GitHub
STATICO_REPO=../statico wasm/build.sh          # or a local checkout
python3 -m http.server 4160 --directory public # http://localhost:4160
```

`wasm/build.sh` needs Rust (it adds the `wasm32-wasip1` target itself) and
Python 3. Pushing to `main` builds and deploys to GitHub Pages; see
[.github/workflows/pages.yml](.github/workflows/pages.yml).

To follow a newer Statico, change `STATICO_REF` in `wasm/build.sh`, and
refresh the patch if it no longer applies.

## Credits

Fonts: Bricolage Grotesque and Hanken Grotesk, SIL Open Font License (see
`public/fonts/`). browser_wasi_shim is MIT or Apache-2.0; CodeMirror and
Turndown are MIT.
The playground itself is MIT, © Adriano Dias.
