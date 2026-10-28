// Serves the site the playground just built, from the Cache API, under
// preview/: a real site, so links between pages, CSS and images all work.
const CACHE = "statico-preview";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const root = new URL("preview/", self.registration.scope);
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  e.respondWith(serve(url, root));
});

async function serve(url, root) {
  const cache = await caches.open(CACHE);
  const path = decodeURIComponent(url.pathname);
  const tries = [path];
  if (path.endsWith("/")) tries.push(`${path}index.html`);
  else if (!/\.[a-z0-9]+$/i.test(path)) tries.push(`${path}/index.html`, `${path}.html`);
  for (const p of tries) {
    const hit = await cache.match(new URL(encodeURI(p), url.origin).href, { ignoreSearch: true });
    if (hit) return hit;
  }
  const missing = await cache.match(new URL("404.html", root).href);
  if (missing) return new Response(await missing.blob(), { status: 404, headers: missing.headers });
  return new Response(`Nothing at ${path} in the built site.`, { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
