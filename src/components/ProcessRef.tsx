import type { MouseEvent } from 'react'
import { Copy, Scale } from 'lucide-react'
import { toast } from 'sonner'

// Processo vinculado a tarefa, compromisso ou prazo: número e nome da ação, com botão para copiar o número.
export async function copyProcessNumber(number: string) {
  try {
    await navigator.clipboard.writeText(number)
  } catch {
    const ta = document.createElement('textarea')
    ta.value = number
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } finally { document.body.removeChild(ta) }
  }
  toast.success('Número do processo copiado')
}

export function ProcessRef({ number, title, className = '', wrap = false }: {
  number?: string | null
  title?: string | null
  className?: string
  /** quebra em várias linhas (pop-ups); por padrão fica em uma linha com reticências (cartões) */
  wrap?: boolean
}) {
  if (!number && !title) return null
  const stop = (e: MouseEvent) => e.stopPropagation()
  return (
    <span className={`flex items-start gap-1 min-w-0 max-w-full ${className}`} title={[number, title].filter(Boolean).join(' — ')}>
      <Scale className="h-3 w-3 shrink-0 mt-[1px]" />
      <span className={`min-w-0 ${wrap ? 'break-words' : 'truncate'}`}>
        {number && (
          <span
            role="button"
            title="Clique para copiar o número"
            className="font-mono cursor-pointer hover:underline"
            onPointerDown={stop}
            onMouseDown={stop}
            onClick={e => { e.stopPropagation(); e.preventDefault(); void copyProcessNumber(number) }}
          >{number}</span>
        )}
        {number && title && ' — '}
        {title}
      </span>
      {number && (
        <button
          type="button"
          aria-label="Copiar número do processo"
          title="Copiar número do processo"
          className="shrink-0 rounded p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onPointerDown={stop}
          onMouseDown={stop}
          onClick={e => { e.stopPropagation(); e.preventDefault(); void copyProcessNumber(number) }}
        >
          <Copy className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

export function ProcessRefById({ processes, id, className, wrap }: {
  processes: { id: string; title: string; number: string | null }[]
  id: string | null | undefined
  className?: string
  wrap?: boolean
}) {
  const p = id ? processes.find(pr => pr.id === id) : undefined
  if (!p) return null
  return <ProcessRef number={p.number} title={p.title} className={className} wrap={wrap} />
}
