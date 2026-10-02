// Migração única: navegadores que ficaram presos numa versão antiga do app (service worker
// antigo + aba aberta há dias) recebem este código quando o service worker novo instala.
// Ao ativar, recarrega as abas abertas UMA vez, para passarem a rodar a versão nova.
// Depois disso, as atualizações seguintes são tratadas dentro do próprio app (src/main.tsx).
const MIGRATION_KEY = '/__srjur-forced-reload-2026-10-02'
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open('srjur-migrations')
    if (await cache.match(MIGRATION_KEY)) return
    await cache.put(MIGRATION_KEY, new Response('1'))
    await self.clients.claim()
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) { try { await w.navigate(w.url) } catch (e) { /* aba fechada */ } }
  })())
})
