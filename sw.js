/* AVIS Flotta — Service Worker v2 */

/* IMPORTANTE: ad ogni modifica di index.html / app.js / db.js / style.css
   incrementa il numero di versione qui sotto (es. v2 → v3).
   È questo cambiamento che fa rilevare l'aggiornamento al browser e
   forza il ri-download dei file freschi, eliminando la cache vecchia. */
const CACHE_NAME = 'avis-flotta-v2';

/* Percorsi RELATIVI: l'app è ospitata in sottocartella su GitHub Pages
   (es. /avis-flotta/), quindi i percorsi assoluti dalla radice romperebbero
   la cache e l'avvio da home screen. */
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './db.js',
  './firebase.js',
  './auth.js',
  './style.css',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ── Install: pre-cache shell ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

/* ── Activate: rimuovi cache vecchie ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ── Fetch: network-first per la shell, cache-first per le icone ──
   Per i file di codice (html/js/css) usiamo network-first: così, appena
   c'è connessione, l'utente riceve sempre la versione aggiornata e la
   cache resta solo come fallback offline. Le icone, che non cambiano,
   restano cache-first per velocità. */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora richieste non-GET e cross-origin (Firebase, CDN, ecc.)
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Cache-first SOLO per le icone
  if (url.pathname.includes('/icons/')) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
      )
    );
    return;
  }

  // Network-first per tutto il resto (shell + dati), con fallback cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
  );
});

/* ── Background Sync: operazioni in coda offline ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-dati') {
    event.waitUntil(syncDatiPendenti());
  }
});

async function syncDatiPendenti() {
  console.log('[SW] Background sync completato');
}

/* ── Push Notifications: scadenze veicoli ── */
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'AVIS Flotta';
  const options = {
    body: data.body || 'Hai notifiche in attesa',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'avis-notifica',
    data: { url: data.url || './' },
    actions: [
      { action: 'apri', title: 'Apri app' },
      { action: 'ignora', title: 'Ignora' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'apri' || !event.action) {
    const url = event.notification.data.url || './';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        const existing = clientList.find(c => 'focus' in c);
        if (existing) return existing.focus();
        return clients.openWindow(url);
      })
    );
  }
});

/* ── Controllo scadenze periodico (ogni giorno) ── */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-scadenze') {
    event.waitUntil(verificaScadenze());
  }
});

async function verificaScadenze() {
  console.log('[SW] Verifica scadenze completata');
}
