// Service worker do GameTower: guarda o jogo para funcionar offline.
// Arquivos com hash no nome (Vite) nunca mudam: cache primeiro.
// A página em si: rede primeiro, cache se estiver offline.
// Mesmo nome usado em src/offline.ts.
const CACHE = 'gametower-v1';
// ignoreVary: o servidor pode mandar "Vary: Origin"; scripts de módulo pedem com
// Origin e o que guardamos foi pedido sem, então a correspondência falharia.

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icone.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const pagina = req.mode === 'navigate';
  e.respondWith(
    pagina
      ? fetch(req)
          .then((r) => {
            const copia = r.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
            return r;
          })
          .catch(() => caches.match(req, { ignoreVary: true }).then((r) => r || caches.match('./index.html', { ignoreVary: true })))
      : caches.match(req, { ignoreVary: true }).then(
          (r) =>
            r ||
            fetch(req).then((resp) => {
              if (resp.ok) {
                const copia = resp.clone();
                caches.open(CACHE).then((c) => c.put(req, copia));
              }
              return resp;
            }),
        ),
  );
});
