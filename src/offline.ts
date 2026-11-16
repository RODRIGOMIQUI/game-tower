// Guarda no cache do service worker tudo o que esta página (ou Worker) já
// baixou. Na primeira visita os arquivos chegam antes de o service worker
// assumir o controle; sem isto, o jogo não abriria offline.
export const CACHE_OFFLINE = 'gametower-v1';

export function guardarRecursosOffline(): void {
  if (typeof caches === 'undefined') return;
  const origem = self.location.origin;
  const urls = new Set<string>([self.location.href]);
  for (const e of performance.getEntriesByType('resource')) {
    if (e.name.startsWith(origem)) urls.add(e.name);
  }
  void caches.open(CACHE_OFFLINE).then((c) =>
    Promise.all([...urls].map((u) => c.add(u).catch(() => undefined))),
  );
}
