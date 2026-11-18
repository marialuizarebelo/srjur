import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/UserAvatar'
import { useProfilesMap } from '@/components/ResponsibleSelect'
import { firstName, normName } from '@/lib/mentions'

// Campo de comentário com @: ao digitar "@" sugere só as pessoas do sistema; escolher insere "@Nome".
export function MentionTextarea({ value, onChange, onSubmit, selfId, placeholder, rows = 2, className }: {
  value: string
  onChange: (text: string, mentionIds: string[]) => void
  onSubmit?: () => void
  /** id do perfil de quem escreve (não sugere a própria pessoa) */
  selfId?: string | null
  placeholder?: string
  rows?: number
  className?: string
}) {
  const profilesMap = useProfilesMap()
  const ref = useRef<HTMLTextAreaElement>(null)
  const picked = useRef<Record<string, string>>({}) // id -> primeiro nome escolhido
  const [query, setQuery] = useState<{ start: number; text: string } | null>(null)
  const [active, setActive] = useState(0)

  const people = useMemo(
    () => Object.values(profilesMap).filter(p => p.id !== selfId && firstName(p.display_name)),
    [profilesMap, selfId],
  )
  const suggestions = useMemo(() => {
    if (!query) return []
    const q = normName(query.text)
    return people.filter(p => normName(p.display_name).split(/s+/).some(w => w.startsWith(q))).slice(0, 5)
  }, [people, query])

  const idsIn = (text: string) => Object.entries(picked.current).filter(([, nome]) => text.includes('@' + nome)).map(([id]) => id)

  function detect(text: string, caret: number) {
    const before = text.slice(0, caret)
    const m = before.match(/(^|\s)@([^\s@]*)$/)
    if (m) { setQuery({ start: caret - m[2].length - 1, text: m[2] }); setActive(0) } else setQuery(null)
  }

  function choose(id: string, display: string | null) {
    if (!query) return
    const nome = firstName(display)
    picked.current[id] = nome
    const caret = ref.current?.selectionStart ?? value.length
    const novo = value.slice(0, query.start) + '@' + nome + ' ' + value.slice(caret)
    setQuery(null)
    onChange(novo, idsIn(novo))
    setTimeout(() => {
      const pos = query.start + nome.length + 2
      ref.current?.focus()
      ref.current?.setSelectionRange(pos, pos)
    }, 0)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (query && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); const s = suggestions[active]; choose(s.id, s.display_name); return }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit?.()
  }

  return (
    <div className="relative flex-1 min-w-0">
      <Textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        className={className}
        onChange={e => { onChange(e.target.value, idsIn(e.target.value)); detect(e.target.value, e.target.selectionStart) }}
        onKeyDown={onKeyDown}
        onClick={e => detect(value, (e.target as HTMLTextAreaElement).selectionStart)}
      />
      {query && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 bottom-full mb-1 z-50 rounded-xl border bg-popover shadow-lg overflow-hidden" role="listbox">
          {suggestions.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${i === active ? 'bg-muted' : 'hover:bg-muted/60'}`}
                onMouseDown={e => { e.preventDefault(); choose(p.id, p.display_name) }}
              >
                <UserAvatar name={p.display_name} photoUrl={p.photo_url} color={p.color} className="h-5 w-5 text-[9px]" />
                <span className="truncate">{p.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Mostra o texto do comentário com as menções destacadas
export function MentionText({ text }: { text: string }) {
  const profilesMap = useProfilesMap()
  const nomes = useMemo(() => new Set(Object.values(profilesMap).map(p => normName(firstName(p.display_name))).filter(Boolean)), [profilesMap])
  const partes = text.split(/(@[^\s@]+)/g)
  return (
    <>
      {partes.map((p, i) => {
        const m = p.match(/^@([^\s@]+?)([.,;:!?)]*)$/)
        if (m && nomes.has(normName(m[1]))) {
          return <span key={i}><span className="font-semibold text-primary bg-primary/10 rounded px-1">@{m[1]}</span>{m[2]}</span>
        }
        return <span key={i}>{p}</span>
      })}
    </>
  )
}
