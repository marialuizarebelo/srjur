import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer,
  ReferenceLine, Legend, Cell, AreaChart,
} from 'recharts'
import { fmtBRL } from '@/lib/format'

/* =============================================================
 * Kit de métricas: paleta, utilitários de dados e gráficos que as
 * oito abas compartilham. Nada aqui busca dado de negócio, exceto
 * fetchAll/useFinanceData, que são a fonte única do financeiro.
 * ============================================================= */

// Paleta suave do redesign (mesma de lib/colors.ts)
export const PAL = {
  green: '#6E9C7D', red: '#D96C87', blue: '#6A8FC7', purple: '#8577C9', amber: '#D9A441',
  teal: '#5FA39A', gray: '#8A93AA', pink: '#C4567C', orange: '#E2654B', sky: '#5AA5C4',
} as const
export const SERIES_COLORS = [PAL.purple, PAL.blue, PAL.green, PAL.amber, PAL.pink, PAL.teal, PAL.red, PAL.sky, PAL.orange, PAL.gray]

export const TOOLTIP_STYLE = {
  fontSize: 12, borderRadius: 12,
  background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--glass-border)',
} as const

/* ---------- Utilitários ---------- */
export const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)
export const todayISO = () => new Date().toISOString().slice(0, 10)
export const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
export const fmtPct = (v: number, d = 0) => `${v.toFixed(d)}%`
export const fmtNum = (v: number, d = 1) => v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: 0 })
export const fmtBRLk = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k` : String(Math.round(v)))

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b.slice(0, 10) + 'T00:00:00').getTime() - new Date(a.slice(0, 10) + 'T00:00:00').getTime()) / 86400000)
}
export function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10)
}
export function inRange(iso: string | null | undefined, start: string, end: string) {
  if (!iso) return false
  const d = iso.slice(0, 10)
  return d >= start && d <= end
}
export function groupSum<T>(rows: T[], key: (r: T) => string, val: (r: T) => number) {
  const map = new Map<string, number>()
  rows.forEach(r => { const k = key(r); map.set(k, (map.get(k) ?? 0) + val(r)) })
  return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}
export function groupCount<T>(rows: T[], key: (r: T) => string) {
  return groupSum(rows, key, () => 1)
}
export function median(xs: number[]) {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export function avg(xs: number[]) { return xs.length ? sum(xs) / xs.length : 0 }

/* ---------- Busca paginada (o Supabase corta em 1000 linhas por consulta) ---------- */
export async function fetchAll<T>(table: string, columns: string, build?: (q: any) => any): Promise<T[]> {
  const page = 1000
  const out: T[] = []
  for (let from = 0; ; from += page) {
    let q: any = supabase.from(table).select(columns)
    if (build) q = build(q)
    const { data, error } = await q.range(from, from + page - 1)
    if (error || !data) break
    out.push(...(data as T[]))
    if (data.length < page) break
  }
  return out
}

/* ---------- Busca tolerante a colunas que ainda não existem no banco ---------- */
// Tenta com as colunas novas; se a migration ainda não foi rodada, repete só com as antigas.
export async function fetchAllSafe<T>(table: string, baseCols: string, optionalCols: string[], build?: (q: any) => any): Promise<{ rows: T[]; missing: boolean }> {
  if (optionalCols.length === 0) return { rows: await fetchAll<T>(table, baseCols, build), missing: false }
  const page = 1000
  const tentar = async (cols: string) => {
    const out: T[] = []
    for (let from = 0; ; from += page) {
      let q: any = supabase.from(table).select(cols)
      if (build) q = build(q)
      const { data, error } = await q.range(from, from + page - 1)
      if (error) return null
      out.push(...((data ?? []) as T[]))
      if (!data || data.length < page) break
    }
    return out
  }
  const comNovas = await tentar(`${baseCols}, ${optionalCols.join(', ')}`)
  if (comNovas) return { rows: comNovas, missing: false }
  return { rows: (await tentar(baseCols)) ?? [], missing: true }
}

/* ---------- Financeiro: fonte única das abas ---------- */
// Mesmas regras da tela Financeiro, para os números baterem:
//  - pago = soma dos pagamentos parciais, se houver; senão o valor inteiro quando marcado como pago
//  - em aberto = valor − pago
//  - "caixa" = lançamentos que impactam o caixa (os demais são só registro)
export interface FinRow {
  id: string
  type: 'receita' | 'despesa'
  category: string | null
  description: string
  value: number
  date: string
  due_date: string | null
  paid: boolean
  payment_date: string | null
  payment_method: string | null
  impacts_cash: boolean
  process_id: string | null
  client_id: string | null
  recurrence: string | null
  responsible: string | null
  business_unit: string | null
  refletir_metricas: boolean
  installments: number | null
  card_fee_percent: number | null
  series_id: string | null
  nature: string | null
  /** Movimento entre as duas empresas (ex.: licença do SaaS paga pela Advocacia): não conta na visão "Empresa toda". */
  intragrupo: boolean
  /** 'fixo' | 'variavel' (só despesas). */
  cost_type: string | null
  /** Quanto já foi efetivamente pago/recebido (limitado ao valor). */
  pago: number
  /** Valor ainda em aberto. */
  aberto: number
  /** Quando cada parte do dinheiro entrou/saiu (parciais têm data própria). */
  eventos: { date: string; amount: number }[]
}

const FIN_COLS = 'id, type, category, description, value, date, due_date, paid, payment_date, payment_method, impacts_cash, process_id, client_id, recurrence, responsible, business_unit, refletir_metricas, installments, card_fee_percent, series_id, nature'

export function useFinanceData() {
  const [rows, setRows] = useState<FinRow[]>([])
  const [loading, setLoading] = useState(true)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    (async () => {
      const [fin, pays] = await Promise.all([
        fetchAllSafe<any>('finance', FIN_COLS, ['intragrupo', 'cost_type']),
        fetchAll<{ finance_id: string; amount: number; payment_date: string }>('finance_payments', 'finance_id, amount, payment_date'),
      ])
      setMissing(fin.missing)
      const parc = new Map<string, { amount: number; payment_date: string }[]>()
      pays.forEach(p => parc.set(p.finance_id, [...(parc.get(p.finance_id) ?? []), { amount: Number(p.amount), payment_date: p.payment_date }]))
      setRows(fin.rows.map(r => {
        const value = Number(r.value)
        const ps = parc.get(r.id)
        const pagoBruto = ps && ps.length > 0 ? sum(ps.map(p => p.amount)) : (r.paid ? value : 0)
        const pago = Math.min(pagoBruto, value)
        const eventos = ps && ps.length > 0
          ? ps.map(p => ({ date: p.payment_date.slice(0, 10), amount: p.amount }))
          : (r.paid ? [{ date: (r.payment_date ?? r.date).slice(0, 10), amount: value }] : [])
        return { ...r, value, intragrupo: r.intragrupo === true, cost_type: r.cost_type ?? null, pago, aberto: Math.max(value - pago, 0), eventos } as FinRow
      }))
      setLoading(false)
    })()
  }, [])
  // Cortesia não refletida fica de fora das métricas (mesma regra de sempre)
  const reflecting = useMemo(() => rows.filter(r => r.refletir_metricas !== false), [rows])
  return { rows: reflecting, all: rows, loading, missing }
}

/** Entra no caixa de verdade (os demais lançamentos são só registro). */
export const isCaixa = (r: FinRow) => r.impacts_cash !== false

/**
 * Recorte por unidade. Em "Empresa toda" os movimentos entre as duas empresas
 * (intragrupo) saem, senão a mesma receita/despesa seria contada duas vezes.
 */
export function filtraFin(rows: FinRow[], unidade: '' | 'advocacia' | 'saas') {
  return rows.filter(r => {
    if (!unidade) return !r.intragrupo
    return unidade === 'saas' ? r.business_unit === 'saas' : r.business_unit !== 'saas'
  })
}

/** Saldo em caixa: o que entrou menos o que saiu (só lançamentos de caixa, pelo valor efetivamente pago). */
export const saldoDe = (rows: FinRow[]) => sum(rows.filter(isCaixa).map(r => (r.type === 'receita' ? r.pago : -r.pago)))

/** Os mesmos totais da tela Financeiro para um conjunto de lançamentos e um período (por data do lançamento). */
export function resumoFin(rows: FinRow[], start: string, end: string, hoje: string) {
  const noPeriodo = rows.filter(r => inRange(r.date, start, end))
  const rec = noPeriodo.filter(r => r.type === 'receita')
  const desp = noPeriodo.filter(r => r.type === 'despesa')
  const recCaixa = rec.filter(isCaixa)
  const despCaixa = desp.filter(isCaixa)
  return {
    receitas: sum(rec.map(r => r.value)),
    despesas: sum(despCaixa.map(r => r.value)),
    despesasNaoCaixa: sum(desp.filter(r => !isCaixa(r)).map(r => r.value)),
    recebido: sum(recCaixa.map(r => r.pago)),
    pago: sum(despCaixa.map(r => r.pago)),
    aReceber: sum(recCaixa.map(r => r.aberto)),
    aPagar: sum(despCaixa.map(r => r.aberto)),
    previstoReceitas: sum(rec.filter(r => r.nature === 'previsto').map(r => r.value)),
    previstoDespesas: sum(despCaixa.filter(r => r.nature === 'previsto').map(r => r.value)),
    emAtraso: sum(rows.filter(r => r.type === 'receita' && isCaixa(r) && r.aberto > 0 && !!r.due_date && r.due_date < hoje).map(r => r.aberto)),
    saldoTotal: saldoDe(rows),
  }
}

/** Despesa que de fato sai do caixa. */
export const isDespesaCaixa = (r: FinRow) => r.type === 'despesa' && r.impacts_cash !== false
export const isRecorrente = (r: { recurrence: string | null }) => !!r.recurrence && r.recurrence !== 'Única'

/* =============================================================
 * Gráficos
 * ============================================================= */

/** Barras horizontais de ranking: nome, barra proporcional e valor. Clicável. */
export function HBars({ data, format = String, color = PAL.purple, onSelect, limit = 8, colors, empty = 'Sem dados neste período', suffix }: {
  data: { name: string; value: number; sub?: string }[]
  format?: (v: number) => string
  color?: string
  colors?: string[]
  onSelect?: (name: string) => void
  limit?: number
  empty?: string
  suffix?: (d: { name: string; value: number }) => string | undefined
}) {
  const list = data.slice(0, limit)
  const max = Math.max(...list.map(d => Math.abs(d.value)), 0)
  if (list.length === 0) return <p className="text-sm text-muted-foreground text-center py-10">{empty}</p>
  return (
    <div className="space-y-2">
      {list.map((d, i) => (
        <button key={d.name} type="button" onClick={() => onSelect?.(d.name)} disabled={!onSelect}
          className={`w-full text-left group ${onSelect ? 'cursor-pointer' : 'cursor-default'}`}>
          <div className="flex items-baseline justify-between gap-3 text-xs mb-1">
            <span className="truncate font-medium">{d.name}{d.sub && <span className="text-muted-foreground font-normal"> · {d.sub}</span>}</span>
            <span className="shrink-0 font-semibold tabular-nums">{format(d.value)}{suffix?.(d) && <span className="text-muted-foreground font-normal"> {suffix(d)}</span>}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all group-hover:brightness-110"
              style={{ width: `${max > 0 ? Math.max(2, (Math.abs(d.value) / max) * 100) : 0}%`, backgroundColor: colors?.[i % colors.length] ?? (d.value < 0 ? PAL.red : color) }} />
          </div>
        </button>
      ))}
    </div>
  )
}

export interface ComboSeries {
  key: string; name: string; color: string
  kind?: 'bar' | 'line' | 'area'
  stack?: string
  dashed?: boolean
  axis?: 'left' | 'right'
  /** Formato do valor no tooltip desta série (padrão: o `format` do gráfico). */
  format?: (v: number) => string
}

/** Gráfico combinado (barras + linhas + áreas), com linha de zero e clique opcional. */
export function ComboChart({ data, series, format = fmtBRL, height = 'h-64', xKey = 'month', onPointClick, yFormat, rightFormat, showLegend = true, zeroLine = true }: {
  data: Record<string, any>[]
  series: ComboSeries[]
  format?: (v: number) => string
  yFormat?: (v: number) => string
  /** Formato do eixo direito (padrão: porcentagem). */
  rightFormat?: (v: number) => string
  height?: string
  xKey?: string
  onPointClick?: (index: number) => void
  showLegend?: boolean
  zeroLine?: boolean
}) {
  const hasRight = series.some(s => s.axis === 'right')
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-10">Sem dados neste período</p>
  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}
          onClick={onPointClick ? (e: any) => e?.activeTooltipIndex != null && onPointClick(e.activeTooltipIndex) : undefined}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={yFormat ?? ((v: number) => fmtBRLk(v))} />
          {hasRight && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={rightFormat ?? ((v: number) => `${v}%`)} />}
          <RTooltip formatter={(v: any, _n: any, item: any) => (series.find(x => x.key === item?.dataKey)?.format ?? (series.find(x => x.key === item?.dataKey)?.axis === 'right' ? (n: number) => `${n}%` : format))(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
          {showLegend && series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />}
          {zeroLine && <ReferenceLine yAxisId="left" y={0} stroke="var(--border)" />}
          {series.map(s => {
            const axis = s.axis ?? 'left'
            if (s.kind === 'line') return <Line key={s.key} yAxisId={axis} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.2} strokeDasharray={s.dashed ? '5 4' : undefined} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
            if (s.kind === 'area') return <Area key={s.key} yAxisId={axis} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color + '2a'} strokeWidth={2} />
            return <Bar key={s.key} yAxisId={axis} dataKey={s.key} name={s.name} fill={s.color} stackId={s.stack} radius={s.stack ? 0 : [5, 5, 0, 0]} maxBarSize={36}
              cursor={onPointClick ? 'pointer' : undefined} />
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Barras verticais coloridas por faixa (ex.: aging 0-30, 31-60...). */
export function BucketBars({ data, format = fmtBRL, onSelect, height = 'h-52' }: {
  data: { name: string; value: number; color: string; count?: number }[]
  format?: (v: number) => string
  onSelect?: (name: string) => void
  height?: string
}) {
  const total = sum(data.map(d => d.value))
  return (
    <div>
      <div className={height}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 6, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtBRLk(v)} />
            <RTooltip formatter={(v: any) => format(Number(v))} contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={56} cursor={onSelect ? 'pointer' : undefined}
              onClick={onSelect ? (d: any) => onSelect(d.name) : undefined}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-muted-foreground">
        {data.map(d => (
          <span key={d.name} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
            {d.name}: <strong className="text-foreground">{format(d.value)}</strong>{total > 0 && ` (${((d.value / total) * 100).toFixed(0)}%)`}{d.count != null && ` · ${d.count}`}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Funil horizontal (cada etapa com % da etapa anterior). */
export function FunnelBars({ steps, color = PAL.blue, onSelect }: {
  steps: { name: string; value: number; sub?: string }[]
  color?: string
  onSelect?: (name: string) => void
}) {
  const max = Math.max(...steps.map(s => s.value), 1)
  if (steps.length === 0) return <p className="text-sm text-muted-foreground text-center py-10">Sem dados neste período</p>
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null
        return (
          <button key={s.name} type="button" onClick={() => onSelect?.(s.name)} disabled={!onSelect}
            className="w-full flex items-center gap-3 text-left group">
            <span className="w-28 sm:w-36 shrink-0 text-xs font-medium truncate">{s.name}</span>
            <div className="flex-1 h-7 rounded-lg bg-muted/60 overflow-hidden relative">
              <div className="h-full rounded-lg transition-all group-hover:brightness-110"
                style={{ width: `${Math.max(3, (s.value / max) * 100)}%`, background: `color-mix(in srgb, ${color} ${100 - i * 9}%, transparent)` }} />
              <span className="absolute inset-y-0 left-2 flex items-center text-xs font-bold text-foreground tabular-nums">{s.value}</span>
            </div>
            <span className="w-24 shrink-0 text-[11px] text-muted-foreground text-right">
              {prev != null && prev > 0 ? `${((s.value / prev) * 100).toFixed(0)}% da anterior` : s.sub ?? ''}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Tabela compacta e responsiva (rolagem horizontal no celular). */
export function MiniTable({ columns, rows, empty = 'Sem dados neste período', onRowClick }: {
  columns: { key: string; label: string; align?: 'left' | 'right'; render?: (row: any) => React.ReactNode }[]
  rows: Record<string, any>[]
  empty?: string
  onRowClick?: (row: any) => void
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground text-center py-8">{empty}</p>
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {columns.map(c => <th key={c.key} className={`py-1.5 px-2 font-semibold ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={`border-t border-border/60 ${onRowClick ? 'cursor-pointer hover:bg-[var(--glass-surface)]' : ''}`}>
              {columns.map(c => (
                <td key={c.key} className={`py-2 px-2 tabular-nums ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Faixa de indicadores secundários dentro de um card (valor grande + rótulo + dica). */
export function StatStrip({ items }: { items: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' | 'neutral' }[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {items.map(it => (
        <div key={it.label} title={it.hint} className="rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{it.label}</p>
          <p className={`font-display text-xl mt-0.5 ${it.tone === 'good' ? 'text-green-700 dark:text-green-300' : it.tone === 'bad' ? 'text-red-700 dark:text-red-300' : 'text-foreground'}`}>{it.value}</p>
        </div>
      ))}
    </div>
  )
}

/** Título de seção dentro de uma aba. */
export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</h2>
      {hint && <p className="text-xs text-muted-foreground/80 mt-0.5">{hint}</p>}
    </div>
  )
}

/** Série mensal rápida: monta [{month, ...}] para os últimos n meses. */
export function monthSeries<T>(months: { start: string; end: string; label: string }[], rows: T[], dateOf: (r: T) => string | null | undefined,
  measures: Record<string, (rs: T[]) => number>) {
  return months.map(m => {
    const rs = rows.filter(r => inRange(dateOf(r), m.start, m.end))
    const out: Record<string, any> = { month: m.label, _start: m.start, _end: m.end }
    for (const [k, fn] of Object.entries(measures)) out[k] = fn(rs)
    return out
  })
}

/** Mini gráfico de tendência para dentro de cards. */
export function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const pts = data.map((v, i) => ({ i, v }))
  return (
    <div className="h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <Area type="monotone" dataKey="v" stroke={color} fill={color + '33'} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/* =============================================================
 * MRR a partir das cobranças recorrentes
 * Cada "assinatura" é uma série (series_id; na falta dele, cliente+descrição).
 * O valor é normalizado para mensal e, em recorrências maiores que 1 mês,
 * a assinatura segue ativa até o próximo ciclo.
 * ============================================================= */
const INTERVALO_MESES: Record<string, number> = { Mensal: 1, Trimestral: 3, Semestral: 6, Anual: 12 }
const FATOR_MENSAL: Record<string, number> = { Semanal: 52 / 12, Quinzenal: 26 / 12, Mensal: 1, Trimestral: 1 / 3, Semestral: 1 / 6, Anual: 1 / 12 }

export interface Assinatura { key: string; clientId: string | null; categoria: string | null; descricao: string; mrr: number }

export function assinaturasDoMes(rows: FinRow[], monthStart: string, monthEnd: string): Map<string, Assinatura> {
  const out = new Map<string, Assinatura>()
  const recorrentes = rows.filter(r => r.type === 'receita' && isRecorrente(r) && FATOR_MENSAL[r.recurrence!] != null)
  const porSerie = new Map<string, FinRow[]>()
  recorrentes.forEach(r => {
    const key = r.series_id ?? `${r.client_id ?? 'sem-cliente'}|${r.description.trim().toLowerCase()}`
    porSerie.set(key, [...(porSerie.get(key) ?? []), r])
  })
  porSerie.forEach((rs, key) => {
    const rec = rs[0].recurrence!
    const meses = INTERVALO_MESES[rec] ?? 1
    // janela: o mês inteiro para ciclos curtos; os últimos N meses para ciclos longos
    const ini = meses > 1 ? addMonthsISO(monthStart, -(meses - 1)) : monthStart
    const naJanela = rs.filter(r => inRange(r.date, ini, monthEnd)).sort((a, b) => a.date.localeCompare(b.date))
    if (naJanela.length === 0) return
    const ultimo = naJanela[naJanela.length - 1]
    const noMes = naJanela.filter(r => inRange(r.date, monthStart, monthEnd))
    // semanal/quinzenal: soma o que foi cobrado no mês; demais: o valor do ciclo normalizado
    const mrr = (rec === 'Semanal' || rec === 'Quinzenal')
      ? sum(noMes.map(r => r.value))
      : ultimo.value * FATOR_MENSAL[rec]
    if (mrr <= 0) return
    out.set(key, { key, clientId: ultimo.client_id, categoria: ultimo.category, descricao: ultimo.description, mrr })
  })
  return out
}
export function addMonthsISO(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + n); d.setDate(1); return d.toISOString().slice(0, 10)
}
/** Ponte de MRR entre dois meses: novo, expansão, contração e encerrado. */
export function pontesMrr(atual: Map<string, Assinatura>, anterior: Map<string, Assinatura>) {
  let novo = 0, expansao = 0, contracao = 0, encerrado = 0
  const novos: Assinatura[] = [], encerrados: Assinatura[] = []
  atual.forEach((a, k) => {
    const p = anterior.get(k)
    if (!p) { novo += a.mrr; novos.push(a) }
    else if (a.mrr > p.mrr + 0.005) expansao += a.mrr - p.mrr
    else if (a.mrr < p.mrr - 0.005) contracao += p.mrr - a.mrr
  })
  anterior.forEach((p, k) => { if (!atual.has(k)) { encerrado += p.mrr; encerrados.push(p) } })
  return { novo, expansao, contracao, encerrado, novos, encerrados }
}
