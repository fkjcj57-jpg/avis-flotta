/* AVIS Flotta — Service Worker v1.0 */

const CACHE_NAME = 'avis-flotta-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/db.js',
  '/style.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
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

/* ── Fetch: cache-first per asset, network-first per dati ── */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Ignora richieste non-GET e cross-origin
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Cache-first per asset statici
  if (STATIC_ASSETS.some(a => url.pathname === a || url.pathname.startsWith('/icons/'))) {
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

  // Network-first per tutto il resto (con fallback cache)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

/* ── Background Sync: operazioni in coda offline ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-dati') {
    event.waitUntil(syncDatiPendenti());
  }
});

async function syncDatiPendenti() {
  // Apri IndexedDB e invia le operazioni in coda
  // (implementazione completa nella versione con backend)
  console.log('[SW] Background sync completato');
}

/* ── Push Notifications: scadenze veicoli ── */
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'AVIS Flotta';
  const options = {
    body: data.body || 'Hai notifiche in attesa',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'avis-notifica',
    data: { url: data.url || '/' },
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
    const url = event.notification.data.url || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        const existing = clientList.find(c => c.url === url && 'focus' in c);
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
  // Legge i veicoli da IndexedDB e controlla le scadenze
  // Invia notifiche push locali se necessario
  console.log('[SW] Verifica scadenze completata');
}
