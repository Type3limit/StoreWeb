const CACHE = 'storeweb-v2';
const URLS = ['./', './static/css/style.css', './static/js/app.js'];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    const url = e.request.url;
    if (!url.startsWith('http')) return;  // skip chrome-extension, etc.
    e.respondWith(
        caches.match(e.request).then(cached =>
            cached || fetch(e.request).then(resp => {
                if (resp.ok && resp.status !== 206) {
                    const clone = resp.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return resp;
            })
        )
    );
});
