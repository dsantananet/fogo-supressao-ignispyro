const CACHE = 'ignispyro-supressao-v1';
const ASSETS = ['./', './index.html', './style.css', './icon.svg', './manifest.webmanifest',
  './zip.js', './excel.js', './app.js', './updates.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
