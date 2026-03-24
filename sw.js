const CACHE_NAME = 'planner-v1';
const ASSETS = [                                                                                                                                                                                              
    '/daily-planner/',
    '/daily-planner/index.html',                                                                                                                                                                                
    '/daily-planner/style.css',                         
    '/daily-planner/app.js',                                                                                                                                                                                    
    '/daily-planner/db.js',                             
    '/daily-planner/stats.js',                                                                                                                                                                                  
    '/daily-planner/manifest.json',
  ]; 

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
