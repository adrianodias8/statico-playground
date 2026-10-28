# Statico Playground

Edit a site and watch it rebuild, in your browser:
[adrianodias8.github.io/statico-playground](https://adrianodias8.github.io/statico-playground/)

[Statico](https://github.com/adrianodias8/statico) is a static site generator
written in Rust. This playground runs the same code, compiled to
WebAssembly (WASI): no server builds anything, and nothing you type leaves
the page.

- Pick a starting point: a tiny site, or Statico's blog or docs template.
- Every edit rebuilds the whole site; the preview is the built site itself,
  so links, CSS, fonts and images all work.
- **Edit this page** opens the file a page was made from: the Markdown for a
  post, the template for anything else.
- **Download .zip** gives you the project, ready for `statico dev`.

## How it works

| Piece | What it does |
|---|---|
| `public/statico.wasm` | Statico, built for `wasm32-wasip1` |
| `public/worker.js` | Runs it in a Web Worker on an in-memory filesystem ([browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim)), then puts the built site in the Cache API |
| `public/sw.js` | A service worker that serves that site under `preview/` |
| `public/app.js` | The file list, the editor ([CodeMirror 5](https://codemirror.net/5/)) and the preview |

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
`public/fonts/`). browser_wasi_shim is MIT or Apache-2.0; CodeMirror is MIT.
The playground itself is MIT, © Adriano Dias.
