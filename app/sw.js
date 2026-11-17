const CACHE = 'ignispyro-supressao-v1.2.0';
const ASSETS = ['./', './index.html', './style.css', './icon.svg', './manifest.webmanifest',
  './zip.js', './excel.js', './fieldwork.js', './app.js', './drive-config.js', './drive-sync.js', './updates.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names
    .filter(name => name.startsWith('ignispyro-supressao-') && name !== CACHE)
    .map(name => caches.delete(name)))));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
