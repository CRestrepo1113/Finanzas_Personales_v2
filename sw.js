// Service Worker — Finanzas Personales PWA
const CACHE_NAME = 'finanzas-v6.4';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './main.js',
    './js/db.js',
    './js/state.js',
    './js/currency.js',
    './js/forms.js',
    './js/ui.js',
    './js/analytics.js',
    './js/zbb.js',
    './js/import.js',
    './icon.png',
    './app-icon.png',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inconsolata:wght@200..900&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// Instalar: cachear archivos estáticos
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                console.warn('SW: Algunos recursos externos no se pudieron cachear (requieren red):', err);
                // Cachear al menos los archivos locales
                return cache.addAll(ASSETS_TO_CACHE.filter(url => !url.startsWith('http')));
            });
        })
    );
    self.skipWaiting();
});

// Activar: limpiar caches anteriores
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch: Network first, fallback to cache (stale-while-revalidate para archivos locales)
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Guardar copia fresca en cache
                if(response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si la red falla, servir desde cache
                return caches.match(event.request).then(cached => {
                    return cached || new Response('Offline — recurso no disponible.', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});
