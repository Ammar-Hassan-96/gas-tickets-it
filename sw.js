// ═══════════════════════════════════════════════════════
// GAS Internal Tickets — Service Worker v1.0
// ═══════════════════════════════════════════════════════

const CACHE_NAME   = 'gas-portal-v1';
const OFFLINE_URL  = '/offline.html';

// الملفات اللي هتتحفظ في الـ cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Tajawal:wght@300;400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap',
];

// ── Install ──────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ─────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch Strategy ────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Supabase API — دايماً network (مش بنحفظه)
  if (url.hostname.includes('supabase.co') ||
      url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'No internet connection', offline: true }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Google Fonts — Cache First
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
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

  // HTML / JS — Network First, Cache Fallback
  if (event.request.mode === 'navigate' ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // كل حاجة تانية — Cache First, Network Fallback
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request)
    )
  );
});

// ── Push Notifications ────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'GAS Portal', {
        body:    data.body || '',
        icon:    '/manifest.json',
        badge:   '/manifest.json',
        dir:     'rtl',
        lang:    'ar',
        vibrate: [200, 100, 200],
        data:    { url: data.url || '/' },
        actions: [
          { action: 'open',    title: 'فتح الطلب' },
          { action: 'dismiss', title: 'تجاهل' }
        ]
      })
    );
  } catch (e) {
    console.warn('[SW] Push parse error:', e);
  }
});

// ── Notification Click ────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const client of list) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.postMessage({ type: 'NOTIF_CLICK', url });
            return;
          }
        }
        return clients.openWindow(url);
      })
  );
});
