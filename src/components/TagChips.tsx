import { ncStyle } from '@/lib/notionColors'

/** Separa o texto de etiquetas ("a, b, c") em uma lista, sem as de controle interno. */
export function splitTags(tags: string | null | undefined): string[] {
  return (tags ?? '').split(',').map(t => t.trim()).filter(t => t && !t.startsWith('importado-'))
}

function colorFor(tag: string) {
  if (tag.startsWith('conferir-')) return 'yellow'
  if (tag.startsWith('sem-')) return 'gray'
  if (tag === 'numero-repetido') return 'red'
  if (tag === 'a-protocolar') return 'orange'
  if (tag === 'dativo') return 'purple'
  if (tag === 'digital') return 'blue'
  if (tag === 'fisico') return 'brown'
  if (tag === 'assunto-deduzido') return 'teal'
  return 'gray'
}

export function TagChips({ tags, max = 4, className = '' }: { tags: string | null | undefined; max?: number; className?: string }) {
  const list = splitTags(tags)
  if (list.length === 0) return null
  const shown = list.slice(0, max)
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {shown.map(t => {
        const s = ncStyle(colorFor(t))
        return (
          <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-full border whitespace-nowrap"
            style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}>{t}</span>
        )
      })}
      {list.length > max && <span className="text-[10px] text-muted-foreground">+{list.length - max}</span>}
    </div>
  )
}
