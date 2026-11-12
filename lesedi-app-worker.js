self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET') return;
  const scope = new URL(self.registration.scope);
  const requested = new URL(event.request.url);
  if (requested.origin !== scope.origin ||
      ![scope.pathname, scope.pathname + 'index.html'].includes(requested.pathname)) return;
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Education Lesedi is offline</title><main style="font:1rem system-ui;padding:2rem;color:#102b5c"><h1>You’re offline</h1><p>Reconnect to open Education Lesedi and continue to your test or learning notes.</p><button onclick="location.reload()">Try again</button></main></html>',
    {status: 503, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}}
  )));
});
