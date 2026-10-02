import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { toast } from 'sonner'
import './index.css'
import App from './App.tsx'

// Sem isso, o service worker só confere se saiu uma versão nova quando o
// navegador decide revalidar o arquivo sozinho (pode levar até 24h) — então
// um deploy novo não aparecia pra quem já tinha o app aberto, mesmo dando
// refresh forçado. Checando a cada 1 minuto, a atualização é detectada e a
// página recarrega sozinha assim que uma versão nova é publicada.
const updateSW = registerSW({ immediate: true })
setInterval(() => { updateSW() }, 60 * 1000)

// Mesmo com o service worker, uma aba/PWA aberta há dias pode continuar na versão
// antiga (formulários velhos, correções que não chegam). Comparamos o arquivo
// principal em uso com o publicado: se mudou, o sistema SE ATUALIZA sozinho — sem
// ninguém precisar apertar nada — esperando só a pessoa parar de digitar/fechar o pop-up.
async function hardReload() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.()
    await Promise.all((regs ?? []).map(r => r.unregister()))
    const keys = await caches?.keys?.()
    await Promise.all((keys ?? []).filter(k => k !== 'srjur-migrations').map(k => caches.delete(k)))
  } catch { /* segue mesmo assim */ }
  location.reload()
}
function userIsBusy() {
  const a = document.activeElement as HTMLElement | null
  const typing = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)
  return typing || !!document.querySelector('[role="dialog"]')
}
let updating = false
async function checkNewVersion() {
  if (updating) return
  try {
    const running = Array.from(document.scripts).map(s => s.src).find(s => /\/assets\/index-[^/]+\.js/.test(s))
    if (!running) return
    const html = await (await fetch('/index.html?v=' + Date.now(), { cache: 'no-store' })).text()
    const published = html.match(/\/assets\/index-[^"']+\.js/)?.[0]
    if (!published || running.endsWith(published)) return
    updating = true
    const go = () => {
      if (document.visibilityState === 'hidden' || !userIsBusy()) {
        toast('Atualizando o sistema para a versão mais recente…', { duration: 3000 })
        setTimeout(hardReload, 2500)
      } else {
        // a pessoa está digitando: não perde o que escreveu — tenta de novo em instantes
        toast('Há uma versão nova do sistema. Vou atualizar assim que você terminar.', { id: 'update-wait', duration: 8000 })
        setTimeout(go, 20 * 1000)
      }
    }
    go()
  } catch { /* sem rede: tenta de novo depois */ }
}
setInterval(checkNewVersion, 60 * 1000)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNewVersion() })
setTimeout(checkNewVersion, 10 * 1000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
