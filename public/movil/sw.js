// CloudTicket Gestión: guarda la app (no los datos) para que abra rápido e instale como app.
const CACHE = 'ct-movil-v1'
const BASE = ['/movil/', '/movil/manifest.webmanifest', '/movil/icono-192.png', '/movil/icono-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)
  // Supabase, fuentes y todo lo que no sea de este sitio: directo a la red
  if (req.method !== 'GET' || url.origin !== location.origin) return
  // La página: primero la red (para tener siempre la última versión); sin conexión, la guardada
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => {
      const copia = r.clone()
      caches.open(CACHE).then(c => c.put('/movil/', copia))
      return r
    }).catch(() => caches.match('/movil/')))
    return
  }
  // Archivos con hash (/assets/...) e íconos: de la caché si están
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/movil/')) {
    e.respondWith(caches.match(req).then(h => h || fetch(req).then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(req, copia)) }
      return r
    })))
  }
})
