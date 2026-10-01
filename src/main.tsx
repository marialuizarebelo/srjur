import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Sem isso, o service worker só confere se saiu uma versão nova quando o
// navegador decide revalidar o arquivo sozinho (pode levar até 24h) — então
// um deploy novo não aparecia pra quem já tinha o app aberto, mesmo dando
// refresh forçado. Checando a cada 1 minuto, a atualização é detectada e a
// página recarrega sozinha assim que uma versão nova é publicada.
const updateSW = registerSW({ immediate: true })
setInterval(() => { updateSW() }, 60 * 1000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
