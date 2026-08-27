// Service Worker — Finanzas Personales PWA
const CACHE_NAME = 'finanzas-v6.9';
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
    './js/calculator.js',
    './js/drive.js',
    './js/notifications.js',
    './js/export.js',
    './js/modal.js',
    './icon.png',
    './app-icon.png',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Inconsolata:wght@200..900&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/docx@7.8.2/build/index.js'
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

// Fetch: Stale-While-Revalidate para recursos estáticos y exclusión de Google APIs
self.addEventListener('fetch', event => {
    // Excluir peticiones que no sean GET y esquemas no http/https
    if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
        return;
    }

    // Excluir APIs de Google (Google Drive y autenticación) de la interceptación del Service Worker
    if (event.request.url.includes('googleapis.com') || event.request.url.includes('accounts.google.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request)
                .then(networkResponse => {
                    if (networkResponse.ok) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return networkResponse;
                })
                .catch(err => {
                    console.warn('SW: Error de red al solicitar recurso:', event.request.url, err);
                });

            // Retornar la respuesta cacheada si existe, o esperar a la de red si no está en caché
            return cachedResponse || fetchPromise;
        })
    );
});
