import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts'
import { Sensitive } from '@/components/Sensitive'

export const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
// Paleta mais "estratégica": tons distintos e saturados o bastante pra
// diferenciar fatias pequenas, sem repetir matiz entre categorias vizinhas.
export const CATEGORY_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#EF4444', '#6366F1', '#84CC16', '#F97316']

export function monthsBack(n: number) {
  const out: { start: string; end: string; label: string }[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
    out.push({ start, end, label: `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` })
  }
  return out
}

/* ---------- Period picker (compartilhado entre abas) ---------- */
export type PeriodKey = 'mes_atual' | '3m' | '6m' | 'ano_atual' | 'personalizado'
const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'mes_atual', label: 'Este mês' },
  { key: '3m', label: 'Últimos 3 meses' },
  { key: '6m', label: 'Últimos 6 meses' },
  { key: 'ano_atual', label: 'Este ano' },
  { key: 'personalizado', label: 'Personalizado' },
]

export function resolvePeriod(key: PeriodKey, customStart: string, customEnd: string) {
  const now = new Date()
  if (key === 'mes_atual') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    }
  }
  if (key === '3m') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString().slice(0, 10),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    }
  }
  if (key === '6m') {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    }
  }
  if (key === 'ano_atual') {
    return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` }
  }
  return { start: customStart || now.toISOString().slice(0, 10), end: customEnd || now.toISOString().slice(0, 10) }
}

export function usePeriod() {
  const [periodKey, setPeriodKey] = useState<PeriodKey>('mes_atual')
  const [customStart, setCustomStart] = useState(() => new Date().toISOString().slice(0, 10))
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const range = useMemo(() => resolvePeriod(periodKey, customStart, customEnd), [periodKey, customStart, customEnd])
  return { periodKey, setPeriodKey, customStart, setCustomStart, customEnd, setCustomEnd, range }
}

export function PeriodPicker({ p }: { p: ReturnType<typeof usePeriod> }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PERIOD_OPTIONS.map(o => (
        <button key={o.key} onClick={() => p.setPeriodKey(o.key)}
          className={`h-7 px-3 rounded-full text-xs font-medium border transition-all ${p.periodKey === o.key ? 'bg-foreground text-background border-foreground' : 'border-border/60 text-muted-foreground hover:border-border'}`}>
          {o.label}
        </button>
      ))}
      {p.periodKey === 'personalizado' && (
        <div className="flex items-center gap-1.5 ml-1">
          <Input type="date" value={p.customStart} onChange={e => p.setCustomStart(e.target.value)} className="h-7 text-xs w-36" />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" value={p.customEnd} onChange={e => p.setCustomEnd(e.target.value)} className="h-7 text-xs w-36" />
        </div>
      )}
    </div>
  )
}

/* ---------- KPI / Chart cards ---------- */
export function KpiCard({ title, value, icon: Icon, color, sensitive, onClick, trend }: {
  title: string; value: string | number; icon: React.ElementType; color: string; sensitive?: boolean; onClick?: () => void
  trend?: string
}) {
  return (
    <Card className={`p-4 relative overflow-hidden border-l-4 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      style={{ borderLeftColor: color, backgroundColor: color + '0a' }} onClick={onClick}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '1a' }}>
          <Icon className="h-3.5 w-3.5" style={{ color }} />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      <p className="text-2xl font-bold text-foreground">
        {sensitive ? <Sensitive>{value}</Sensitive> : value}
      </p>
      {trend && <p className="text-[11px] text-muted-foreground mt-1">{trend}</p>}
    </Card>
  )
}

export function ChartCard({ title, icon: Icon, children, className, extra }: {
  title: string; icon: React.ElementType; children: React.ReactNode; className?: string; extra?: React.ReactNode
}) {
  return (
    <Card className={`p-5 ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />{title}
        </h3>
        {extra}
      </div>
      {children}
    </Card>
  )
}

/* ---------- Legenda clicável (substitui rótulos colados na pizza) ---------- */
export function PieLegendList({ data, colors, formatValue, onSelect }: {
  data: { name: string; value: number }[]; colors: string[]; formatValue: (v: number) => string
  onSelect?: (name: string) => void
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <div className="space-y-1">
      {data.map((d, i) => (
        <button key={d.name} type="button" onClick={() => onSelect?.(d.name)}
          className="w-full flex items-center justify-between gap-2 text-xs rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors text-left">
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="truncate">{d.name}</span>
          </span>
          <span className="shrink-0 font-medium">
            {formatValue(d.value)} <span className="text-muted-foreground">({total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%)</span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function DonutWithLegend({ data, formatValue, onSelect }: {
  data: { name: string; value: number }[]; formatValue: (v: number) => string; onSelect?: (name: string) => void
}) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground text-center py-14">Sem dados neste período</p>
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value"
              onClick={(_, i) => onSelect?.(data[i].name)} cursor={onSelect ? 'pointer' : undefined}>
              {data.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
            </Pie>
            <RTooltip formatter={(v) => formatValue(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <PieLegendList data={data} colors={CATEGORY_COLORS} formatValue={formatValue} onSelect={onSelect} />
    </div>
  )
}

/* ---------- Popup de detalhamento ---------- */
export interface DetailRow { id: string; label: string; sublabel?: string; value?: string }
export function DetailDialog({ open, onClose, title, rows }: { open: boolean; onClose: () => void; title: string; rows: DetailRow[] }) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 pt-1">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro neste período</p>
          ) : rows.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.label}</p>
                {r.sublabel && <p className="text-xs text-muted-foreground">{r.sublabel}</p>}
              </div>
              {r.value && <span className="shrink-0 font-semibold">{r.value}</span>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
export function useDetail() {
  const [state, setState] = useState<{ open: boolean; title: string; rows: DetailRow[] }>({ open: false, title: '', rows: [] })
  return {
    ...state,
    show: (title: string, rows: DetailRow[]) => setState({ open: true, title, rows }),
    close: () => setState(s => ({ ...s, open: false })),
  }
}

/* ---------- Pontos de atenção ---------- */
export interface Attention { text: string; level: 'info' | 'warn' | 'danger' }
export function AttentionPanel({ items }: { items: Attention[] }) {
  if (items.length === 0) return null
  const style: Record<Attention['level'], string> = {
    danger: 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400',
    warn: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-400',
    info: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400',
  }
  return (
    <Card className="p-4 space-y-2">
      <h3 className="font-semibold text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Pontos de atenção</h3>
      <div className="space-y-1.5">
        {items.map((a, i) => <div key={i} className={`text-xs rounded-lg px-3 py-2 border ${style[a.level]}`}>{a.text}</div>)}
      </div>
    </Card>
  )
}
