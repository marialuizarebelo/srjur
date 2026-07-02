import { useEffect, useState } from 'react'
import { usePinnedView } from '@/hooks/usePinnedView'

// Seção que pode ser minimizada, com opção de fixar o estado (aberta/fechada)
// como preferência pessoal do usuário — cada pessoa pode fixar do seu jeito.
export function useCollapsibleSection(key: string, defaultCollapsed = false) {
  const pinned = usePinnedView(key, defaultCollapsed ? 'fechado' : 'aberto')
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  useEffect(() => {
    if (pinned.loaded && pinned.isPinned) setCollapsed(pinned.pinnedValue === 'fechado')
  }, [pinned.loaded])

  return {
    collapsed,
    toggle: () => setCollapsed(c => !c),
    isPinned: pinned.isPinned,
    pinCurrent: () => pinned.pin(collapsed ? 'fechado' : 'aberto'),
    unpin: pinned.unpin,
  }
}
