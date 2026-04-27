const CACHE = 'storeweb-v3';

// Only cache static assets, never API or HTML
const STATIC = /\.(css|js|svg|png|jpg|ico|woff2?)$/;

self.addEventListener('install', e => {
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const url = e.request.url;
    if (!url.startsWith('http')) return;
    if (!STATIC.test(url)) return;  // skip API, HTML — never cache data

    e.respondWith(
        caches.match(e.request).then(cached =>
            cached || fetch(e.request).then(resp => {
                if (resp.ok && resp.status === 200) {
                    const clone = resp.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return resp;
            })
        )
    );
});
