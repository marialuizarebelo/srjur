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
// principal em uso com o publicado: se mudou, avisa e recarrega.
let versionAnnounced = false
async function checkNewVersion() {
  if (versionAnnounced) return
  try {
    const running = Array.from(document.scripts).map(s => s.src).find(s => /\/assets\/index-[^/]+\.js/.test(s))
    if (!running) return
    const html = await (await fetch('/index.html?v=' + Date.now(), { cache: 'no-store' })).text()
    const published = html.match(/\/assets\/index-[^"']+\.js/)?.[0]
    if (!published || running.endsWith(published)) return
    versionAnnounced = true
    if (document.visibilityState === 'hidden') { location.reload(); return }
    toast('Nova versão do sistema disponível', {
      duration: Infinity,
      description: 'Atualize para usar as correções mais recentes.',
      action: { label: 'Atualizar agora', onClick: () => location.reload() },
    })
  } catch { /* sem rede: tenta de novo depois */ }
}
setInterval(checkNewVersion, 2 * 60 * 1000)
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNewVersion() })
setTimeout(checkNewVersion, 15 * 1000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
