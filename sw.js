// Service worker mínimo: deixa o app instalável. Não faz cache, então sempre carrega a versão nova.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
