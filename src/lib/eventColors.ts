import { useEffect, useState } from 'react'
import { ncStyle, type NotionColorKey } from '@/lib/notionColors'

export const EVENT_TYPES = [
  { key: 'tarefa', label: 'Tarefa' },
  { key: 'prazo', label: 'Prazo' },
  { key: 'audiencia', label: 'Audiência' },
  { key: 'reuniao', label: 'Reunião' },
  { key: 'diligencia', label: 'Diligência' },
  { key: 'compromisso', label: 'Compromisso' },
  { key: 'cliente', label: 'Cliente' },
  { key: 'interno', label: 'Interno' },
  { key: 'marketing', label: 'Marketing' },
] as const

export type EventTypeKey = typeof EVENT_TYPES[number]['key']

const DEFAULTS: Record<EventTypeKey, NotionColorKey> = {
  tarefa: 'pink', prazo: 'green', audiencia: 'orange', reuniao: 'blue', diligencia: 'yellow',
  compromisso: 'purple', cliente: 'teal', interno: 'gray', marketing: 'brown',
}

const STORAGE_KEY = 'srjur-event-colors'
const EVENT = 'srjur-event-colors-changed'

function read(): Record<string, string> {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } } catch { return { ...DEFAULTS } }
}

// Cores por tipo de evento, personalizáveis e compartilhadas entre telas do mesmo navegador.
export function useEventColors() {
  const [colors, setColors] = useState<Record<string, string>>(read)
  useEffect(() => {
    const sync = () => setColors(read())
    window.addEventListener(EVENT, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync) }
  }, [])
  function setColor(type: string, color: NotionColorKey) {
    const next = { ...read(), [type]: color }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* sem storage */ }
    setColors(next)
    window.dispatchEvent(new Event(EVENT))
  }
  const styleOf = (type: string) => ncStyle(colors[type] ?? 'gray')
  const labelOf = (type: string) => EVENT_TYPES.find(e => e.key === type)?.label ?? type
  return { colors, setColor, styleOf, labelOf }
}
