import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, Download, FilterX, ListFilter, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { fmtBRL, fmtDate } from '@/lib/format'

// Visualização em "planilha": todas as colunas, filtro por coluna (ícone no cabeçalho), ordenação,
// escolha de colunas, soma no rodapé e exportação. Genérica: cada tela só descreve suas colunas.

export interface GridColumn<T> {
  key: string
  label: string
  /** valor usado para ordenar, filtrar e exportar */
  value: (row: T) => string | number | null | undefined
  /** como aparece na célula (padrão: o próprio valor; dinheiro e data são formatados) */
  render?: (row: T) => ReactNode
  /** text = contém; select = escolher um valor (aparece como etiqueta); number/money = mínimo e máximo; date = de/até */
  kind?: 'text' | 'select' | 'number' | 'money' | 'date'
  width?: number
  /** começa escondida (a pessoa liga em "Colunas") */
  hidden?: boolean
  /** soma no rodapé (números e dinheiro) */
  sum?: boolean
  /** classe extra da célula (ex.: cor do valor) */
  cellClass?: string
}

interface Filter { text?: string; sel?: string; min?: string; max?: string; from?: string; to?: string }
const EMPTY = '__vazio__'
const PAGE = 150

const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const isNum = (k?: string) => k === 'number' || k === 'money'
const vazio = (v: unknown) => v === null || v === undefined || v === ''

// Cores suaves das etiquetas (mesma família das etiquetas do restante do sistema)
const TONES = {
  verde: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  azul: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  ambar: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  vermelho: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  cinza: 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300',
  neutro: 'bg-muted text-foreground/80',
}
function toneOf(v: string): string {
  const s = norm(v)
  if (['ativo', 'pago', 'concluido', 'concluida', 'receita', 'cumprido', 'ganho', 'convertido'].includes(s)) return TONES.verde
  if (['em andamento', 'parcial', 'contencioso', 'pessoa juridica'].includes(s)) return TONES.azul
  if (['pendente', 'prospecto', 'suspenso', 'consultivo'].includes(s)) return TONES.ambar
  if (['atrasado', 'despesa', 'perdido', 'vencido'].includes(s)) return TONES.vermelho
  if (['encerrado', 'arquivado', 'cancelado', 'extrajudicial'].includes(s)) return TONES.cinza
  return TONES.neutro
}

function loadHidden(id: string): string[] | null {
  try { const raw = localStorage.getItem(`srjur_grid_${id}`); return raw ? (JSON.parse(raw).hidden as string[]) : null } catch { return null }
}
function saveHidden(id: string, hidden: string[]) {
  try { localStorage.setItem(`srjur_grid_${id}`, JSON.stringify({ hidden })) } catch { /* sem armazenamento: tudo bem */ }
}

export function DataGrid<T>({ id, rows, columns, getId, onRowClick, toolbar, emptyText = 'Nenhum registro com esses filtros.' }: {
  id: string
  rows: T[]
  columns: GridColumn<T>[]
  getId: (row: T) => string
  onRowClick?: (row: T) => void
  toolbar?: ReactNode
  emptyText?: string
}) {
  const defaultHidden = useMemo(() => columns.filter(c => c.hidden).map(c => c.key), [columns])
  const [hidden, setHidden] = useState<string[]>(() => loadHidden(id) ?? defaultHidden)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<Record<string, Filter>>({})
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)
  const [limit, setLimit] = useState(PAGE)
  useEffect(() => { saveHidden(id, hidden) }, [id, hidden])
  useEffect(() => { setLimit(PAGE) }, [search, filters, sort])

  const visible = columns.filter(c => !hidden.includes(c.key))

  // valores possíveis das colunas "select" (sobre todas as linhas, para a lista não encolher ao filtrar)
  const options = useMemo(() => {
    const out: Record<string, string[]> = {}
    for (const c of columns) if (c.kind === 'select') {
      const set = new Set<string>(); let temVazio = false
      for (const r of rows) { const v = c.value(r); if (vazio(v)) temVazio = true; else set.add(String(v)) }
      out[c.key] = [...set].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })); if (temVazio) out[c.key].push(EMPTY)
    }
    return out
  }, [rows, columns])

  const filtered = useMemo(() => {
    const q = norm(search).trim()
    return rows.filter(r => {
      if (q && !columns.some(c => norm(c.value(r)).includes(q))) return false
      for (const c of columns) {
        const f = filters[c.key]; if (!f) continue
        const v = c.value(r)
        if (f.text && !norm(v).includes(norm(f.text).trim())) return false
        if (f.sel) { if (f.sel === EMPTY ? !vazio(v) : String(v) !== f.sel) return false }
        if (isNum(c.kind)) {
          const n = vazio(v) ? null : Number(v)
          if (f.min && (n === null || n < Number(f.min))) return false
          if (f.max && (n === null || n > Number(f.max))) return false
        }
        if (c.kind === 'date') {
          const d = v ? String(v).slice(0, 10) : ''
          if (f.from && (!d || d < f.from)) return false
          if (f.to && (!d || d > f.to)) return false
        }
      }
      return true
    })
  }, [rows, columns, search, filters])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const c = columns.find(x => x.key === sort.key); if (!c) return filtered
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = c.value(a), vb = c.value(b)
      const ea = vazio(va), eb = vazio(vb)
      if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1      // vazios sempre no fim
      if (isNum(c.kind)) return (Number(va) - Number(vb)) * dir
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir
    })
  }, [filtered, sort, columns])

  const sums = useMemo(() => {
    const out: Record<string, number> = {}
    for (const c of visible) if (c.sum) out[c.key] = filtered.reduce((s, r) => s + (Number(c.value(r)) || 0), 0)
    return out
  }, [filtered, visible])

  const isActive = (f?: Filter) => !!f && Object.values(f).some(Boolean)
  const activeChips = columns.flatMap(c => {
    const f = filters[c.key]; if (!isActive(f)) return []
    const txt = f!.text ? `contém "${f!.text}"` : f!.sel ? (f!.sel === EMPTY ? 'vazio' : f!.sel)
      : [f!.min && `≥ ${f!.min}`, f!.max && `≤ ${f!.max}`, f!.from && `de ${fmtDate(f!.from)}`, f!.to && `até ${fmtDate(f!.to)}`].filter(Boolean).join(' · ')
    return [{ key: c.key, label: c.label, txt }]
  })
  const anyFilter = activeChips.length > 0 || !!search
  const setF = (key: string, patch: Partial<Filter>) => setFilters(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  const clearF = (key: string) => setFilters(prev => { const n = { ...prev }; delete n[key]; return n })
  const toggleSort = (key: string) => setSort(s => (!s || s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null))

  function exportCsv() {
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const lines = [visible.map(c => esc(c.label)).join(';'), ...sorted.map(r => visible.map(c => {
      const v = c.value(r); return esc(isNum(c.kind) && !vazio(v) ? String(v).replace('.', ',') : v)
    }).join(';'))]
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${id}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const cell = (c: GridColumn<T>, r: T): ReactNode => {
    if (c.render) return c.render(r)
    const v = c.value(r); if (vazio(v)) return <span className="text-muted-foreground/40">—</span>
    if (c.kind === 'money') return fmtBRL(Number(v))
    if (c.kind === 'date') return fmtDate(String(v).slice(0, 10))
    if (c.kind === 'select') return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ${toneOf(String(v))}`}>{String(v)}</span>
    return String(v)
  }

  // controle de filtro de uma coluna (dentro do popover do cabeçalho)
  const filterBody = (c: GridColumn<T>) => {
    const f = filters[c.key] ?? {}
    if (c.kind === 'select') return (
      <div className="flex max-h-60 flex-wrap gap-1.5 overflow-y-auto">
        {(options[c.key] ?? []).map(o => (
          <button key={o} type="button" onClick={() => (f.sel === o ? clearF(c.key) : setF(c.key, { sel: o }))}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${f.sel === o ? 'bg-primary text-primary-foreground' : `${o === EMPTY ? TONES.neutro : toneOf(o)} hover:brightness-95`}`}>
            {o === EMPTY ? '(vazio)' : o}
          </button>
        ))}
      </div>
    )
    if (isNum(c.kind)) return (
      <div className="grid grid-cols-2 gap-2">
        <div><p className="mb-1 text-[11px] text-muted-foreground">Mínimo</p><Input type="number" value={f.min ?? ''} onChange={e => setF(c.key, { min: e.target.value })} className="h-9 rounded-xl" /></div>
        <div><p className="mb-1 text-[11px] text-muted-foreground">Máximo</p><Input type="number" value={f.max ?? ''} onChange={e => setF(c.key, { max: e.target.value })} className="h-9 rounded-xl" /></div>
      </div>
    )
    if (c.kind === 'date') return (
      <div className="grid grid-cols-2 gap-2">
        <div><p className="mb-1 text-[11px] text-muted-foreground">De</p><Input type="date" value={f.from ?? ''} onChange={e => setF(c.key, { from: e.target.value })} className="h-9 rounded-xl px-2" /></div>
        <div><p className="mb-1 text-[11px] text-muted-foreground">Até</p><Input type="date" value={f.to ?? ''} onChange={e => setF(c.key, { to: e.target.value })} className="h-9 rounded-xl px-2" /></div>
      </div>
    )
    return <Input autoFocus value={f.text ?? ''} onChange={e => setF(c.key, { text: e.target.value })} placeholder={`Filtrar ${c.label.toLowerCase()}...`} className="h-9 rounded-xl" />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar em todas as colunas..." className="h-9 w-72 rounded-xl pl-9" />
        </div>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" className="h-9 rounded-xl" />}>
            <Columns3 className="mr-1.5 h-3.5 w-3.5" />Colunas
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 rounded-2xl p-2">
            <div className="mb-1 flex items-center justify-between px-2 pt-1 text-[11px]">
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => setHidden([])}>Mostrar todas</button>
              <button type="button" className="text-muted-foreground hover:underline" onClick={() => setHidden(defaultHidden)}>Restaurar padrão</button>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {columns.map(c => (
                <label key={c.key} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                  <input type="checkbox" className="accent-[var(--primary)]" checked={!hidden.includes(c.key)} onChange={() => setHidden(h => (h.includes(c.key) ? h.filter(x => x !== c.key) : [...h, c.key]))} />
                  {c.label}
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button variant="outline" size="sm" className="h-9 rounded-xl" onClick={exportCsv} title="Baixa a tabela como está na tela (abre no Excel)">
          <Download className="mr-1.5 h-3.5 w-3.5" />Exportar
        </Button>
        {anyFilter && (
          <Button variant="ghost" size="sm" className="h-9 rounded-xl text-muted-foreground" onClick={() => { setFilters({}); setSearch('') }}>
            <FilterX className="mr-1.5 h-3.5 w-3.5" />Limpar filtros
          </Button>
        )}
        {toolbar}
        <span className="ml-auto rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {sorted.length === rows.length ? `${rows.length} registros` : `${sorted.length} de ${rows.length} registros`}
        </span>
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map(ch => (
            <span key={ch.key} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-1 pl-3 pr-1.5 text-xs font-medium text-primary">
              {ch.label}: {ch.txt}
              <button type="button" aria-label={`Remover filtro de ${ch.label}`} onClick={() => clearF(ch.key)} className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/20"><X className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      )}

      <div className="max-h-[68vh] overflow-auto rounded-2xl border border-border/60 bg-card shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr className="bg-muted/80 backdrop-blur">
              {visible.map((c, i) => {
                const f = filters[c.key]
                return (
                  <th key={c.key} className={`whitespace-nowrap border-b border-border/60 px-2.5 py-2 text-left ${i === 0 ? 'sticky left-0 z-30 bg-muted' : ''}`}>
                    <div className={`flex items-center gap-0.5 ${isNum(c.kind) ? 'justify-end' : ''}`}>
                      <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                        {c.label}
                        {sort?.key === c.key ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </button>
                      <Popover>
                        <PopoverTrigger render={<button type="button" aria-label={`Filtrar ${c.label}`} className={`relative flex h-5 w-5 items-center justify-center rounded-md hover:bg-background ${isActive(f) ? 'text-primary' : 'text-muted-foreground/50'}`} />}>
                          <ListFilter className="h-3 w-3" />
                          {isActive(f) && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-64 rounded-2xl p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold">{c.label}</p>
                            {isActive(f) && <button type="button" onClick={() => clearF(c.key)} className="text-[11px] text-primary hover:underline">Limpar</button>}
                          </div>
                          {filterBody(c)}
                        </PopoverContent>
                      </Popover>
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map(r => (
              <tr key={getId(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={`group ${onRowClick ? 'cursor-pointer' : ''}`}>
                {visible.map((c, i) => (
                  <td key={c.key} title={c.render || c.kind === 'select' ? undefined : String(c.value(r) ?? '')}
                    className={`whitespace-nowrap border-b border-border/40 px-2.5 py-2.5 transition-colors group-hover:bg-primary/5 ${isNum(c.kind) ? 'text-right tabular-nums' : ''} ${c.cellClass ?? ''} ${i === 0 ? 'sticky left-0 z-10 bg-card font-medium group-hover:bg-primary/5' : ''}`}>
                    {/* a largura da coluna acompanha o conteúdo; "width" só limita textos muito longos */}
                    <div className="truncate" style={{ maxWidth: c.width ?? 220 }}>{cell(c, r)}</div>
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={visible.length || 1} className="px-4 py-14 text-center text-sm text-muted-foreground">{emptyText}</td></tr>
            )}
          </tbody>
          {Object.keys(sums).length > 0 && (
            <tfoot className="sticky bottom-0 z-20">
              <tr className="bg-muted/90 text-sm font-semibold backdrop-blur">
                {visible.map((c, i) => (
                  <td key={c.key} className={`whitespace-nowrap border-t border-border/60 px-2.5 py-2 ${isNum(c.kind) ? 'text-right tabular-nums' : ''} ${i === 0 ? 'sticky left-0 z-30 bg-muted text-[11px] uppercase tracking-wider text-muted-foreground' : ''}`}>
                    {i === 0 && !(c.key in sums) ? 'Total do que está na tela' : c.key in sums ? (c.kind === 'money' ? fmtBRL(sums[c.key]) : sums[c.key]) : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {sorted.length > limit && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setLimit(l => l + PAGE)}>
            Mostrar mais ({sorted.length - limit} restantes)
          </Button>
        </div>
      )}
    </div>
  )
}
