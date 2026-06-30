import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import {
  Dialog, DialogContent,
} from '@/components/ui/dialog'
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command'
import {
  Users, Scale, ClipboardList, Bell, DollarSign,
  Megaphone, Search, ArrowRight,
} from 'lucide-react'

interface SearchResult {
  id: string
  title: string
  subtitle?: string
  category: string
  icon: React.ElementType
  color: string
  href: string
}

const CATEGORY_META: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  cliente:   { label: 'Clientes',   icon: Users,        color: 'text-amber-600' },
  processo:  { label: 'Processos',  icon: Scale,        color: 'text-rose-600' },
  tarefa:    { label: 'Tarefas',    icon: ClipboardList,color: 'text-green-600' },
  prazo:     { label: 'Prazos',     icon: Bell,         color: 'text-purple-600' },
  financeiro:{ label: 'Financeiro', icon: DollarSign,   color: 'text-blue-600' },
  marketing: { label: 'Marketing',  icon: Megaphone,    color: 'text-pink-600' },
}

async function runSearch(q: string): Promise<SearchResult[]> {
  if (q.length < 2) return []
  const term = `%${q}%`
  const results: SearchResult[] = []

  const [clients, processes, tasks, deadlines, finance, marketing] = await Promise.all([
    supabase.from('clients').select('id, name, cpf_cnpj, email').or(`name.ilike.${term},cpf_cnpj.ilike.${term},email.ilike.${term}`).limit(5),
    supabase.from('processes').select('id, title, number, area').or(`title.ilike.${term},number.ilike.${term}`).limit(5),
    supabase.from('tasks').select('id, title, type, status').ilike('title', term).limit(5),
    supabase.from('deadlines').select('id, title, type').ilike('title', term).limit(5),
    supabase.from('finance').select('id, description, type, value').ilike('description', term).limit(5),
    supabase.from('marketing_content').select('id, title, platform, status').ilike('title', term).limit(5),
  ])

  clients.data?.forEach(c => results.push({
    id: c.id, category: 'cliente',
    title: c.name,
    subtitle: c.email ?? c.cpf_cnpj ?? undefined,
    icon: CATEGORY_META.cliente.icon, color: CATEGORY_META.cliente.color,
    href: '/clientes',
  }))

  processes.data?.forEach(p => results.push({
    id: p.id, category: 'processo',
    title: p.title,
    subtitle: [p.number, p.area].filter(Boolean).join(' · ') || undefined,
    icon: CATEGORY_META.processo.icon, color: CATEGORY_META.processo.color,
    href: '/processos',
  }))

  tasks.data?.forEach(t => results.push({
    id: t.id, category: 'tarefa',
    title: t.title,
    subtitle: [t.type, t.status].filter(Boolean).join(' · ') || undefined,
    icon: CATEGORY_META.tarefa.icon, color: CATEGORY_META.tarefa.color,
    href: '/tarefas',
  }))

  deadlines.data?.forEach(d => results.push({
    id: d.id, category: 'prazo',
    title: d.title,
    subtitle: d.type ?? undefined,
    icon: CATEGORY_META.prazo.icon, color: CATEGORY_META.prazo.color,
    href: '/prazos',
  }))

  finance.data?.forEach(f => results.push({
    id: f.id, category: 'financeiro',
    title: f.description,
    subtitle: `${f.type === 'receita' ? 'Entrada' : 'Saída'} · R$ ${Number(f.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    icon: CATEGORY_META.financeiro.icon, color: CATEGORY_META.financeiro.color,
    href: '/financeiro',
  }))

  marketing.data?.forEach(m => results.push({
    id: m.id, category: 'marketing',
    title: m.title,
    subtitle: [m.platform, m.status].filter(Boolean).join(' · ') || undefined,
    icon: CATEGORY_META.marketing.icon, color: CATEGORY_META.marketing.color,
    href: '/marketing',
  }))

  return results
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function GlobalSearch({ open, onOpenChange }: Props) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    setLoading(true)
    const res = await runSearch(q)
    setResults(res)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); return }
    const t = setTimeout(() => search(query), 300)
    return () => clearTimeout(t)
  }, [query, search])

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]) }
  }, [open])

  function handleSelect(result: SearchResult) {
    onOpenChange(false)
    navigate(result.href)
  }

  // Group results by category
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {})

  const groupKeys = Object.keys(grouped)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 max-w-[600px] w-[95vw] overflow-hidden rounded-2xl shadow-2xl">
        <Command shouldFilter={false} className="rounded-2xl">
          <CommandInput
            placeholder="Buscar clientes, processos, tarefas, lançamentos..."
            value={query}
            onValueChange={setQuery}
            className="h-12 text-base border-b"
          />

          <CommandList className="max-h-[420px]">
            {query.length < 2 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-3 opacity-30" />
                Digite ao menos 2 caracteres para buscar
              </div>
            )}

            {query.length >= 2 && loading && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Buscando...
              </div>
            )}

            {query.length >= 2 && !loading && results.length === 0 && (
              <CommandEmpty>
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">Nenhum resultado encontrado para</p>
                  <p className="text-sm font-medium mt-1">"{query}"</p>
                </div>
              </CommandEmpty>
            )}

            {groupKeys.map((cat, idx) => {
              const meta = CATEGORY_META[cat]
              return (
                <div key={cat}>
                  {idx > 0 && <CommandSeparator />}
                  <CommandGroup heading={
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider">
                      <meta.icon className={`h-3 w-3 ${meta.color}`} />
                      {meta.label}
                    </span>
                  }>
                    {grouped[cat].map(r => {
                      const Icon = r.icon
                      return (
                        <CommandItem
                          key={r.id}
                          value={r.id}
                          onSelect={() => handleSelect(r)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer"
                        >
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-muted`}>
                            <Icon className={`h-3.5 w-3.5 ${r.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{r.title}</p>
                            {r.subtitle && (
                              <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                            )}
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </div>
              )
            })}
          </CommandList>

          {query.length >= 2 && results.length > 0 && (
            <div className="border-t px-4 py-2 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{results.length} resultado{results.length !== 1 ? 's' : ''}</p>
              <p className="text-xs text-muted-foreground">↵ para abrir</p>
            </div>
          )}
        </Command>
      </DialogContent>
    </Dialog>
  )
}
