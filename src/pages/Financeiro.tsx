import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  TrendingUp, TrendingDown, DollarSign, AlertTriangle,
  Plus, FileDown, Pencil, Trash2, Download, Calendar, Upload,
  CreditCard, Wallet, ChevronLeft, ChevronRight, Eye,
  ArrowUpCircle, ArrowDownCircle, Clock, Ban, Link2,
  Repeat, BarChart3, PieChart as PieIcon, X, RefreshCw,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip as RTooltip, ResponsiveContainer, LineChart, Line, Area, AreaChart,
} from 'recharts'
import { fmtBRL, fmtDate, getDaysDiff } from '@/lib/format'
import { exportExcel, exportPDF, fmtDateBR, fmtBRLStr } from '@/lib/exportData'
import { ExportMenu } from '@/components/ExportMenu'
import { ImportExtrato } from '@/components/ImportExtrato'
import { createAsaasCharge, syncAsaasCharges } from '@/lib/asaas'
import { toast } from 'sonner'

// ── Types ──
interface FinanceRow {
  id: string
  type: 'receita' | 'despesa'
  category: string | null
  description: string
  value: number
  date: string
  due_date: string | null
  paid: boolean
  payment_date: string | null
  client_id: string | null
  process_id: string | null
  origin: string | null
  nature: string | null
  impacts_cash: boolean
  responsible: string | null
  notes: string | null
  portal_visible: boolean
  payment_method: string | null
  installments: number | null
  current_installment: number | null
  recurrence: string | null
  payment_link: string | null
}

interface ClientOption { id: string; name: string }

// ── Constants ──
const CATEGORIES_RECEITA = ['Honorários Iniciais', 'Mensalidade', 'Acordo', 'Consultoria', 'Êxito', 'Outros']
const CATEGORIES_DESPESA = ['Operacional', 'Pessoal', 'Impostos', 'Software', 'Marketing', 'Aluguel', 'Outros']
const PAYMENT_METHODS = ['PIX', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Dinheiro', 'Link de Pagamento']
const RECURRENCE_OPTIONS = ['Única', 'Semanal', 'Quinzenal', 'Mensal', 'Trimestral', 'Semestral', 'Anual']
const PIE_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6']

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

// ── Helpers ──
function MonthNavigator({ month, year, onChange }: {
  month: number; year: number
  onChange: (m: number, y: number) => void
}) {
  const prev = () => {
    if (month === 0) onChange(11, year - 1)
    else onChange(month - 1, year)
  }
  const next = () => {
    if (month === 11) onChange(0, year + 1)
    else onChange(month + 1, year)
  }
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prev}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm font-medium min-w-[120px] text-center">
        {MONTHS[month]} {year}
      </span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={next}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ── Clickable summary card ──
function SummaryCard({ title, value, subtitle, icon: Icon, color, active, onClick, highlight, muted }: {
  title: string; value: string; subtitle?: string
  icon: React.ElementType; color: string
  active?: boolean; onClick?: () => void
  highlight?: boolean  // fundo colorido invertido
  muted?: boolean      // esmaecido
}) {
  if (highlight) {
    return (
      <Card
        className={`p-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${active ? 'ring-2 ring-white/60' : ''}`}
        style={{ backgroundColor: color, border: 'none' }}
        onClick={onClick}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-white/80">{title}</p>
            {subtitle && <p className="text-[10px] text-white/60">{subtitle}</p>}
            <p className="text-xl font-bold mt-1.5 text-white">{value}</p>
          </div>
          <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-white/20">
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </Card>
    )
  }
  return (
    <Card
      className={`p-4 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md ${active ? 'ring-2 ring-primary' : ''} ${muted ? 'opacity-60' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground font-medium">{title}</p>
          {subtitle && <p className="text-[10px] text-muted-foreground/60">{subtitle}</p>}
          <p className="text-xl font-bold mt-1.5" style={{ color: muted ? undefined : color }}>{value}</p>
        </div>
        <div className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon className="h-4 w-4" style={{ color: muted ? undefined : color }} />
        </div>
      </div>
    </Card>
  )
}

// ── Row status helpers ──
const todayStr = new Date().toISOString().slice(0, 10)

function rowStatus(row: FinanceRow) {
  if (row.paid) return 'pago'
  if (row.due_date && row.due_date < todayStr) return 'atrasado'
  return 'pendente'
}

function RowBadge({ row }: { row: FinanceRow }) {
  const status = rowStatus(row)
  if (row.type === 'despesa') {
    return row.paid
      ? <Badge className="text-[10px] bg-slate-500 text-white">SAÍ</Badge>
      : <Badge className="text-[10px] bg-slate-300 text-slate-700">PRV</Badge>
  }
  if (status === 'pago')     return <Badge className="text-[10px] bg-green-600 text-white">ENT</Badge>
  if (status === 'atrasado') return <Badge className="text-[10px] bg-red-500 text-white">ATR</Badge>
  return <Badge className="text-[10px] bg-amber-400 text-white">PRV</Badge>
}

function StatusLabel({ row }: { row: FinanceRow }) {
  const status = rowStatus(row)
  if (status === 'pago')     return <span className="text-xs font-medium text-green-600">Pago</span>
  if (status === 'atrasado') return <span className="text-xs font-medium text-red-500">Atrasado</span>
  return <span className="text-xs font-medium text-amber-500">Pendente</span>
}

// ── Detail Drawer ──
function DetailDrawer({ title, rows, onClose, clients, onEdit }: {
  title: string; rows: FinanceRow[]; onClose: () => void; clients: ClientOption[]
  onEdit: (row: FinanceRow) => void
}) {
  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name ?? '—'
  const total = rows.reduce((s, r) => s + Number(r.value), 0)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-background shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-background border-b p-4 flex items-center justify-between z-10">
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{rows.length} lançamentos · {fmtBRL(total)}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="p-4 space-y-2">
          {rows.map(row => (
            <div key={row.id}
              className="flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => { onEdit(row); onClose() }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{row.description}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{fmtDate(row.date)}</span>
                  {row.category && <Badge variant="outline" className="text-[10px]">{row.category}</Badge>}
                  {row.client_id && <span className="text-xs text-muted-foreground">{getClientName(row.client_id)}</span>}
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className={`text-sm font-semibold ${row.type === 'receita' ? (row.paid ? 'text-green-600' : rowStatus(row) === 'atrasado' ? 'text-red-500' : 'text-amber-500') : 'text-slate-500'}`}>
                  {row.type === 'receita' ? '+' : '-'}{fmtBRL(Number(row.value))}
                </p>
                <StatusLabel row={row} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main ──
export default function Financeiro() {
  const [rows, setRows] = useState<FinanceRow[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [asaasOpen, setAsaasOpen] = useState(false)
  const [asaasCreating, setAsaasCreating] = useState(false)
  const [asaasSyncing, setAsaasSyncing] = useState(false)
  const [af, setAf] = useState({
    client_id: '', description: '', value: '', due_date: '',
    category: 'Honorários iniciais',
    charge_mode: 'unico' as 'unico' | 'parcelado' | 'recorrente',
    billing_type: 'UNDEFINED' as 'UNDEFINED' | 'BOLETO' | 'PIX' | 'CREDIT_CARD',
    installment_count: '2',
    cycle: 'MONTHLY' as 'MONTHLY' | 'WEEKLY' | 'YEARLY',
    interest_percent: '', fine_percent: '', discount_percent: '', discount_days_before: '0',
  })
  const [showJurosMulta, setShowJurosMulta] = useState(false)

  function maskBRL(raw: string) {
    const digits = raw.replace(/\D/g, '')
    if (!digits) return ''
    const n = parseInt(digits) / 100
    return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(n)
  }
  function parseBRLValue(v: string) {
    return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
  }

  // View state
  const now = new Date()
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMode, setViewMode] = useState<'mes' | 'ano' | 'custom'>('mes')
  const [activeCard, setActiveCard] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const [projectionMonths, setProjectionMonths] = useState(3)

  // Form
  const [form, setForm] = useState({
    type: 'receita' as 'receita' | 'despesa',
    description: '',
    value: '',
    date: new Date().toISOString().slice(0, 10),
    due_date: '',
    category: '',
    origin: '',
    paid: false,
    payment_date: '',
    client_id: '',
    impacts_cash: true,
    nature: 'real' as 'real' | 'previsto',
    responsible: '',
    notes: '',
    portal_visible: false,
    payment_method: '',
    installments: '1',
    recurrence: 'Única',
    payment_link: '',
  })

  const resetForm = () => {
    setForm({
      type: 'receita', description: '', value: '',
      date: new Date().toISOString().slice(0, 10), due_date: '', category: '',
      origin: '', paid: false, payment_date: '', client_id: '',
      impacts_cash: true, nature: 'real', responsible: '', notes: '',
      portal_visible: false, payment_method: '', installments: '1',
      recurrence: 'Única', payment_link: '',
    })
    setEditingId(null)
  }

  function resetAf() {
    setAf({
      client_id: '', description: '', value: '', due_date: '',
      category: 'Honorários iniciais', charge_mode: 'unico',
      billing_type: 'UNDEFINED', installment_count: '2', cycle: 'MONTHLY',
      interest_percent: '', fine_percent: '', discount_percent: '', discount_days_before: '0',
    })
    setShowJurosMulta(false)
  }

  async function handleCreateAsaasCharge() {
    if (!af.client_id || !af.description || !af.value || !af.due_date) return
    setAsaasCreating(true)
    try {
      const result = await createAsaasCharge({
        client_id: af.client_id,
        description: af.description,
        value: parseBRLValue(af.value),
        due_date: af.due_date,
        category: af.category,
        billing_type: af.billing_type,
        installment_count: af.charge_mode === 'parcelado' ? (parseInt(af.installment_count) || 2) : 1,
        recurring: af.charge_mode === 'recorrente',
        cycle: af.charge_mode === 'recorrente' ? af.cycle : undefined,
        interest_percent: af.interest_percent ? parseFloat(af.interest_percent.replace(',', '.')) : undefined,
        fine_percent: af.fine_percent ? parseFloat(af.fine_percent.replace(',', '.')) : undefined,
        discount_percent: af.discount_percent ? parseFloat(af.discount_percent.replace(',', '.')) : undefined,
        discount_days_before: af.discount_percent ? (parseInt(af.discount_days_before) || 0) : undefined,
      })
      if (result.warning) {
        toast(result.warning, { duration: 8000 })
      } else {
        toast.success(af.charge_mode === 'recorrente' ? 'Assinatura recorrente criada no Asaas!' : 'Cobrança criada no Asaas!')
      }
      setAsaasOpen(false)
      resetAf()
      loadData()
    } catch (e: any) {
      toast.error('Erro ao criar cobrança: ' + e.message)
    } finally {
      setAsaasCreating(false)
    }
  }

  async function handleSyncAsaas() {
    setAsaasSyncing(true)
    try {
      const result = await syncAsaasCharges()
      const subsMsg = result.newFromSubscriptions > 0 ? ` · ${result.newFromSubscriptions} nova(s) de assinatura(s)` : ''
      toast.success(`Sincronizado! ${result.updated} de ${result.checked} cobrança(s) atualizada(s)${subsMsg}`)
      if (result.errors?.length > 0) toast.error(`${result.errors.length} erro(s) na sincronização`)
      loadData()
    } catch (e: any) {
      toast.error('Erro ao sincronizar: ' + e.message)
    } finally {
      setAsaasSyncing(false)
    }
  }

  const loadData = async () => {
    setLoading(true)
    const { data } = await supabase.from('finance').select('*').order('date', { ascending: false })
    setRows((data as FinanceRow[]) ?? [])
    const { data: cl } = await supabase.from('clients').select('id, name').eq('status', 'ativo').order('name')
    setClients((cl as ClientOption[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // ── Filtered data ──
  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (typeFilter !== 'todos' && r.type !== typeFilter) return false
      const d = new Date(r.date)
      if (viewMode === 'mes') {
        return d.getMonth() === viewMonth && d.getFullYear() === viewYear
      } else if (viewMode === 'ano') {
        return d.getFullYear() === viewYear
      }
      return true
    })
  }, [rows, typeFilter, viewMode, viewMonth, viewYear])

  // ── Calculations ──
  const today = new Date().toISOString().slice(0, 10)
  const receitas = filtered.filter(r => r.type === 'receita')
  const despesas = filtered.filter(r => r.type === 'despesa')
  const totalReceitas = receitas.reduce((s, r) => s + Number(r.value), 0)
  const totalDespesas = despesas.reduce((s, r) => s + Number(r.value), 0)
  const receitasPagas = receitas.filter(r => r.paid).reduce((s, r) => s + Number(r.value), 0)
  const receitasPendentes = receitas.filter(r => !r.paid).reduce((s, r) => s + Number(r.value), 0)
  const despesasPagas = despesas.filter(r => r.paid).reduce((s, r) => s + Number(r.value), 0)
  const despesasPendentes = despesas.filter(r => !r.paid).reduce((s, r) => s + Number(r.value), 0)
  const saldo = receitasPagas - despesasPagas
  const inadimplencia = receitas
    .filter(r => !r.paid && r.due_date && r.due_date < today)
    .reduce((s, r) => s + Number(r.value), 0)
  const proximosVencimentos = rows
    .filter(r => !r.paid && r.due_date && r.due_date >= today)
    .sort((a, b) => (a.due_date! > b.due_date! ? 1 : -1))
    .slice(0, 5)

  // ── Projection ──
  const projection = useMemo(() => {
    const result: { month: string; aReceber: number; aPagar: number; saldo: number }[] = []
    if (projectionMonths === 0) {
      // "até final deste mês" — lançamentos pendentes do mês atual ainda não vencidos/pagos
      const today = new Date()
      const start = today.toISOString().slice(0, 10)
      const end = new Date(viewYear, viewMonth + 1, 0).toISOString().slice(0, 10)
      const monthRows = rows.filter(r => r.due_date && r.due_date >= start && r.due_date <= end && !r.paid)
      const rec = monthRows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0)
      const desp = monthRows.filter(r => r.type === 'despesa').reduce((s, r) => s + Number(r.value), 0)
      result.push({ month: `${MONTHS[viewMonth]}/${viewYear % 100} (restante)`, aReceber: rec, aPagar: desp, saldo: rec - desp })
    } else {
      for (let i = 1; i <= projectionMonths; i++) {
        const d = new Date(viewYear, viewMonth + i, 1)
        const start = d.toISOString().slice(0, 10)
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
        const monthRows = rows.filter(r => r.due_date && r.due_date >= start && r.due_date <= end && !r.paid)
        const rec = monthRows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0)
        const desp = monthRows.filter(r => r.type === 'despesa').reduce((s, r) => s + Number(r.value), 0)
        result.push({ month: `${MONTHS[d.getMonth()]}/${d.getFullYear() % 100}`, aReceber: rec, aPagar: desp, saldo: rec - desp })
      }
    }
    return result
  }, [rows, projectionMonths, viewMonth, viewYear])

  // ── Charts ──
  const monthlyEvolution = useMemo(() => {
    const months: { month: string; receitas: number; despesas: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(viewYear, viewMonth - i, 1)
      const start = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
      const mRows = rows.filter(r => r.date >= start && r.date <= end)
      months.push({
        month: MONTHS[d.getMonth()],
        receitas: mRows.filter(r => r.type === 'receita').reduce((s, r) => s + Number(r.value), 0),
        despesas: mRows.filter(r => r.type === 'despesa').reduce((s, r) => s + Number(r.value), 0),
      })
    }
    return months
  }, [rows, viewMonth, viewYear])

  const categoryData = useMemo(() => {
    const map = new Map<string, number>()
    receitas.forEach(r => {
      const cat = r.category ?? 'Outros'
      map.set(cat, (map.get(cat) ?? 0) + Number(r.value))
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [receitas])

  const despesaCategoryData = useMemo(() => {
    const map = new Map<string, number>()
    despesas.forEach(r => {
      const cat = r.category ?? 'Outros'
      map.set(cat, (map.get(cat) ?? 0) + Number(r.value))
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  }, [despesas])

  // ── Handlers ──
  const handleSave = async () => {
    const val = parseFloat(form.value.replace(',', '.'))
    const numInstallments = parseInt(form.installments) || 1

    const basePayload = {
      type: form.type,
      description: form.description,
      value: numInstallments > 1 ? val / numInstallments : val,
      date: form.date,
      due_date: form.due_date || null,
      category: form.category || null,
      origin: form.origin || null,
      paid: form.paid,
      payment_date: form.payment_date || null,
      client_id: form.client_id || null,
      impacts_cash: form.impacts_cash,
      nature: form.nature,
      responsible: form.responsible || null,
      notes: form.notes || null,
      portal_visible: form.portal_visible,
      payment_method: form.payment_method || null,
      recurrence: form.recurrence === 'Única' ? null : form.recurrence,
      payment_link: form.payment_link || null,
      installments: numInstallments > 1 ? numInstallments : null,
      current_installment: numInstallments > 1 ? 1 : null,
    }

    if (editingId) {
      await supabase.from('finance').update(basePayload).eq('id', editingId)
    } else if (numInstallments > 1) {
      const inserts = []
      for (let i = 0; i < numInstallments; i++) {
        const dueDate = new Date(form.due_date || form.date)
        dueDate.setMonth(dueDate.getMonth() + i)
        inserts.push({
          ...basePayload,
          description: `${form.description} (${i + 1}/${numInstallments})`,
          due_date: dueDate.toISOString().slice(0, 10),
          current_installment: i + 1,
        })
      }
      await supabase.from('finance').insert(inserts)
    } else {
      await supabase.from('finance').insert(basePayload)
    }

    setDialogOpen(false)
    resetForm()
    loadData()
  }

  const handleEdit = (row: FinanceRow) => {
    setForm({
      type: row.type,
      description: row.description,
      value: String(row.value),
      date: row.date,
      due_date: row.due_date ?? '',
      category: row.category ?? '',
      origin: row.origin ?? '',
      paid: row.paid,
      payment_date: row.payment_date ?? '',
      client_id: row.client_id ?? '',
      impacts_cash: row.impacts_cash,
      nature: (row.nature ?? 'real') as 'real' | 'previsto',
      responsible: row.responsible ?? '',
      notes: row.notes ?? '',
      portal_visible: row.portal_visible,
      payment_method: row.payment_method ?? '',
      installments: String(row.installments ?? 1),
      recurrence: row.recurrence ?? 'Única',
      payment_link: row.payment_link ?? '',
    })
    setEditingId(row.id)
    setDialogOpen(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este lançamento?')) return
    await supabase.from('finance').delete().eq('id', id)
    loadData()
  }

  const getClientName = (id: string | null) => clients.find(c => c.id === id)?.name ?? '—'

  // ── Card click → detail drawer ──
  const getCardRows = () => {
    switch (activeCard) {
      case 'receitas': return receitas
      case 'receitas-pagas': return receitas.filter(r => r.paid)
      case 'receitas-pendentes': return receitas.filter(r => !r.paid)
      case 'despesas': return despesas
      case 'despesas-pagas': return despesas.filter(r => r.paid)
      case 'despesas-pendentes': return despesas.filter(r => !r.paid)
      case 'inadimplencia': return receitas.filter(r => !r.paid && r.due_date && r.due_date < today)
      case 'saldo': return filtered
      default: return []
    }
  }

  const cardLabels: Record<string, string> = {
    receitas: 'Receitas',
    'receitas-pagas': 'Receitas Pagas',
    'receitas-pendentes': 'Receitas Pendentes',
    despesas: 'Despesas',
    'despesas-pagas': 'Despesas Pagas',
    'despesas-pendentes': 'Despesas Pendentes',
    inadimplencia: 'Inadimplência',
    saldo: 'Todos os lançamentos',
  }

  return (
    <div className="space-y-6">
      {/* Detail drawer */}
      {activeCard && (
        <DetailDrawer
          title={cardLabels[activeCard] ?? activeCard}
          rows={getCardRows()}
          onClose={() => setActiveCard(null)}
          clients={clients}
          onEdit={handleEdit}
        />
      )}

      {/* Import extrato */}
      <ImportExtrato open={importOpen} onOpenChange={setImportOpen} onComplete={loadData} />

      {/* ── Cobrança Asaas ── */}
      <Dialog open={asaasOpen} onOpenChange={o => { setAsaasOpen(o); if (!o) resetAf() }}>
        <DialogContent className="max-w-[560px] w-[96vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader><DialogTitle>Gerar cobrança no Asaas</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={af.client_id} onValueChange={v => setAf(f => ({ ...f, client_id: v }))}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione">
                    {clients.find(c => c.id === af.client_id)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={af.category} onValueChange={v => setAf(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{af.category}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Honorários iniciais">Honorários iniciais</SelectItem>
                    <SelectItem value="Mensalidade">Mensalidade</SelectItem>
                    <SelectItem value="Honorários de êxito">Honorários de êxito</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de cobrança</Label>
                <Select value={af.charge_mode} onValueChange={v => setAf(f => ({ ...f, charge_mode: v as any }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue>
                      {af.charge_mode === 'unico' ? 'Valor único' : af.charge_mode === 'parcelado' ? 'Parcelado' : 'Recorrente (assinatura)'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unico">Valor único</SelectItem>
                    <SelectItem value="parcelado">Parcelado</SelectItem>
                    <SelectItem value="recorrente">Recorrente (assinatura)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Input value={af.description} onChange={e => setAf(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex: Honorários — Ação de Indenização" className="h-10" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{af.charge_mode === 'recorrente' ? 'Valor de cada cobrança (R$)' : 'Valor total (R$)'}</Label>
                <Input value={af.value} onChange={e => setAf(f => ({ ...f, value: maskBRL(e.target.value) }))}
                  placeholder="0,00" className="h-10" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>{af.charge_mode === 'recorrente' ? 'Primeira cobrança' : 'Vencimento (1ª parcela)'}</Label>
                <Input type="date" value={af.due_date} onChange={e => setAf(f => ({ ...f, due_date: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Forma de pagamento</Label>
                <Select value={af.billing_type} onValueChange={v => setAf(f => ({ ...f, billing_type: v as any }))}>
                  <SelectTrigger className="h-10">
                    <SelectValue>
                      {af.billing_type === 'UNDEFINED' ? 'Cliente escolhe' : af.billing_type === 'BOLETO' ? 'Boleto' : af.billing_type === 'PIX' ? 'Pix' : 'Cartão'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNDEFINED">Cliente escolhe</SelectItem>
                    <SelectItem value="BOLETO">Boleto</SelectItem>
                    <SelectItem value="PIX">Pix</SelectItem>
                    <SelectItem value="CREDIT_CARD">Cartão de crédito</SelectItem>
                  </SelectContent>
                </Select>
                {af.charge_mode === 'recorrente' && af.billing_type !== 'CREDIT_CARD' && (
                  <p className="text-[10px] text-amber-600">Assinatura recorrente cobrada automaticamente funciona melhor com cartão de crédito.</p>
                )}
                {(af.billing_type === 'PIX' || af.billing_type === 'UNDEFINED') && (
                  <p className="text-[10px] text-muted-foreground">Se o Pix não estiver liberado na sua conta Asaas ainda, essa opção pode não funcionar até a aprovação.</p>
                )}
              </div>

              {af.charge_mode === 'parcelado' && (
                <div className="space-y-1.5">
                  <Label>Número de parcelas</Label>
                  <Input type="number" min="2" max="36" value={af.installment_count}
                    onChange={e => setAf(f => ({ ...f, installment_count: e.target.value }))} className="h-10" />
                </div>
              )}

              {af.charge_mode === 'recorrente' && (
                <div className="space-y-1.5">
                  <Label>Repete a cada</Label>
                  <Select value={af.cycle} onValueChange={v => setAf(f => ({ ...f, cycle: v as any }))}>
                    <SelectTrigger className="h-10">
                      <SelectValue>{af.cycle === 'MONTHLY' ? 'Mês' : af.cycle === 'WEEKLY' ? 'Semana' : 'Ano'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEEKLY">Semana</SelectItem>
                      <SelectItem value="MONTHLY">Mês</SelectItem>
                      <SelectItem value="YEARLY">Ano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div>
              <button type="button" onClick={() => setShowJurosMulta(s => !s)}
                className="text-xs text-primary hover:underline">
                {showJurosMulta ? '− Ocultar' : '+ Configurar'} juros, multa e desconto (opcional)
              </button>
              {showJurosMulta && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 p-3 rounded-xl bg-muted/30">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Juros ao mês (%)</Label>
                    <Input value={af.interest_percent} onChange={e => setAf(f => ({ ...f, interest_percent: e.target.value }))}
                      placeholder="0,00" className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Multa por atraso (%)</Label>
                    <Input value={af.fine_percent} onChange={e => setAf(f => ({ ...f, fine_percent: e.target.value }))}
                      placeholder="0,00" className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Desconto antecipado (%)</Label>
                    <Input value={af.discount_percent} onChange={e => setAf(f => ({ ...f, discount_percent: e.target.value }))}
                      placeholder="0,00" className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Até quantos dias antes do vencimento</Label>
                    <Input type="number" min="0" value={af.discount_days_before}
                      onChange={e => setAf(f => ({ ...f, discount_days_before: e.target.value }))} className="h-9 text-xs" />
                  </div>
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {af.charge_mode === 'recorrente'
                ? 'Cria uma assinatura no Asaas que gera cobranças automaticamente a cada ciclo. As próximas cobranças entram no Financeiro sozinhas quando você clicar em "Sincronizar Asaas".'
                : 'Gera a(s) cobrança(s) direto no Asaas e já lança no Financeiro, vinculada ao cliente. O link de pagamento fica disponível na lista.'}
            </p>
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={handleCreateAsaasCharge} disabled={asaasCreating || !af.client_id || !af.description || !af.value || !af.due_date}>
              {asaasCreating ? 'Gerando...' : af.charge_mode === 'recorrente' ? 'Criar assinatura' : 'Gerar cobrança'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} lançamentos no período</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3 w-3 mr-1" />Importar Extrato
          </Button>
          <Button variant="outline" size="sm" onClick={handleSyncAsaas} disabled={asaasSyncing}>
            <RefreshCw className={`h-3 w-3 mr-1 ${asaasSyncing ? 'animate-spin' : ''}`} />
            {asaasSyncing ? 'Sincronizando...' : 'Sincronizar Asaas'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { resetAf(); setAsaasOpen(true) }}>
            <Plus className="h-3 w-3 mr-1" />Cobrança Asaas
          </Button>
          <ExportMenu
            onExcelExport={() => {
              const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
              const exRows = rows.map(r => ({
                'Tipo': r.type === 'receita' ? 'Receita' : 'Despesa',
                'Descrição': r.description,
                'Categoria': r.category ?? '',
                'Valor (R$)': r.value,
                'Data': fmtDateBR(r.date),
                'Vencimento': fmtDateBR(r.due_date),
                'Pago': r.paid ? 'Sim' : 'Não',
                'Data Pagamento': fmtDateBR(r.payment_date),
                'Cliente': r.client_id ? (clientMap[r.client_id] ?? '') : '',
                'Forma de Pagamento': r.payment_method ?? '',
                'Natureza': r.nature ?? '',
                'Responsável': r.responsible ?? '',
                'Recorrência': r.recurrence ?? '',
                'Parcela': r.current_installment && r.installments ? `${r.current_installment}/${r.installments}` : '',
                'Impacta Caixa': r.impacts_cash ? 'Sim' : 'Não',
                'Portal Visível': r.portal_visible ? 'Sim' : 'Não',
                'Observações': r.notes ?? '',
              }))
              exportExcel(exRows, `financeiro_${new Date().toISOString().slice(0,10)}`)
            }}
            onPdfExport={() => {
              const clientMap = Object.fromEntries(clients.map(c => [c.id, c.name]))
              exportPDF(
                'Financeiro',
                `${rows.length} lançamentos`,
                [
                  { header: 'Tipo', key: 'Tipo', width: 18 },
                  { header: 'Descrição', key: 'Descrição', width: 55 },
                  { header: 'Categoria', key: 'Categoria', width: 30 },
                  { header: 'Valor', key: 'Valor', width: 28 },
                  { header: 'Vencimento', key: 'Vencimento', width: 25 },
                  { header: 'Pago', key: 'Pago', width: 14 },
                  { header: 'Cliente', key: 'Cliente', width: 35 },
                ],
                rows.map(r => ({
                  'Tipo': r.type === 'receita' ? 'Receita' : 'Despesa',
                  'Descrição': r.description,
                  'Categoria': r.category ?? '—',
                  'Valor': fmtBRLStr(r.value),
                  'Vencimento': fmtDateBR(r.due_date),
                  'Pago': r.paid ? '✓' : '—',
                  'Cliente': r.client_id ? (clientMap[r.client_id] ?? '—') : '—',
                })),
                `financeiro_${new Date().toISOString().slice(0,10)}`
              )
            }}
          />
          <Button size="sm" onClick={() => { resetForm(); setDialogOpen(true) }}>
            <Plus className="h-3 w-3 mr-1" />Novo Lançamento
          </Button>
          <Dialog open={dialogOpen} onOpenChange={open => { setDialogOpen(open); if (!open) resetForm() }}>
            <DialogContent className="max-w-[900px] w-[96vw] max-h-[92vh] overflow-y-auto p-8">
              <DialogHeader>
                <DialogTitle className="text-lg">{editingId ? 'Editar' : 'Novo'} Lançamento</DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                {/* Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    variant={form.type === 'receita' ? 'default' : 'outline'}
                    size="lg"
                    onClick={() => setForm(f => ({ ...f, type: 'receita', category: '' }))}
                    className={form.type === 'receita' ? 'bg-green-600 hover:bg-green-700' : ''}
                  ><ArrowUpCircle className="h-5 w-5 mr-2" />Receita</Button>
                  <Button
                    variant={form.type === 'despesa' ? 'default' : 'outline'}
                    size="lg"
                    onClick={() => setForm(f => ({ ...f, type: 'despesa', category: '' }))}
                    className={form.type === 'despesa' ? 'bg-red-600 hover:bg-red-700' : ''}
                  ><ArrowDownCircle className="h-5 w-5 mr-2" />Despesa</Button>
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="h-10" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0,00" className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(form.type === 'receita' ? CATEGORIES_RECEITA : CATEGORIES_DESPESA).map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label>Vencimento</Label>
                    <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-10" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Forma de pagamento</Label>
                    <Select value={form.payment_method} onValueChange={v => setForm(f => ({ ...f, payment_method: v }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Nenhum</SelectItem>
                        {clients.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Recorrência</Label>
                    <Select value={form.recurrence} onValueChange={v => setForm(f => ({ ...f, recurrence: v }))}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RECURRENCE_OPTIONS.map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Parcelas</Label>
                    <Input type="number" min="1" max="48" value={form.installments} onChange={e => setForm(f => ({ ...f, installments: e.target.value }))} className="h-10" />
                    {parseInt(form.installments) > 1 && form.value && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {form.installments}x de {fmtBRL(parseFloat(form.value.replace(',', '.')) / parseInt(form.installments))}
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Responsável</Label>
                    <Input value={form.responsible} onChange={e => setForm(f => ({ ...f, responsible: e.target.value }))} placeholder="@nome" className="h-10" />
                  </div>
                  <div className="space-y-2">
                    <Label>Natureza</Label>
                    <Select value={form.nature} onValueChange={v => setForm(f => ({ ...f, nature: v as 'real' | 'previsto' }))}>
                      <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="real">Real</SelectItem>
                        <SelectItem value="previsto">Previsto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Link de pagamento</Label>
                  <Input value={form.payment_link} onChange={e => setForm(f => ({ ...f, payment_link: e.target.value }))} placeholder="https://..." className="h-10" />
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
                </div>

                <div className="flex items-center gap-8 pt-3 border-t">
                  <div className="flex items-center gap-2">
                    <Switch checked={form.paid} onCheckedChange={v => setForm(f => ({ ...f, paid: v }))} />
                    <Label>Pago</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.impacts_cash} onCheckedChange={v => setForm(f => ({ ...f, impacts_cash: v }))} />
                    <Label>Impacta caixa</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={form.portal_visible} onCheckedChange={v => setForm(f => ({ ...f, portal_visible: v }))} />
                    <Label>Visível no portal</Label>
                  </div>
                </div>
              </div>
              <DialogFooter className="pt-4">
                <DialogClose render={<Button variant="outline" size="lg" />}>Cancelar</DialogClose>
                <Button size="lg" onClick={handleSave} disabled={!form.description || !form.value}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Period Navigation ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
          {(['mes', 'ano', 'custom'] as const).map(m => (
            <Button
              key={m}
              variant={viewMode === m ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setViewMode(m)}
            >
              {m === 'mes' ? 'Mês' : m === 'ano' ? 'Ano' : 'Todos'}
            </Button>
          ))}
        </div>
        {viewMode !== 'custom' && (
          <MonthNavigator month={viewMonth} year={viewYear} onChange={(m, y) => { setViewMonth(m); setViewYear(y) }} />
        )}
        <div className="flex items-center gap-1 ml-auto bg-muted rounded-lg p-0.5">
          {(['todos', 'receita', 'despesa'] as const).map(t => (
            <Button
              key={t}
              variant={typeFilter === t ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTypeFilter(t)}
            >
              {t === 'todos' ? 'Tudo' : t === 'receita' ? 'Entradas' : 'Saídas'}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Summary Cards (clickable) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <SummaryCard title="Receitas" subtitle="total" value={fmtBRL(totalReceitas)} icon={ArrowUpCircle} color="#16a34a" muted active={activeCard === 'receitas'} onClick={() => setActiveCard(activeCard === 'receitas' ? null : 'receitas')} />
        <SummaryCard title="Recebido" subtitle="pago" value={fmtBRL(receitasPagas)} icon={TrendingUp} color="#22c55e" highlight active={activeCard === 'receitas-pagas'} onClick={() => setActiveCard(activeCard === 'receitas-pagas' ? null : 'receitas-pagas')} />
        <SummaryCard title="A receber" subtitle="pendente" value={fmtBRL(receitasPendentes)} icon={Clock} color="#f59e0b" active={activeCard === 'receitas-pendentes'} onClick={() => setActiveCard(activeCard === 'receitas-pendentes' ? null : 'receitas-pendentes')} />
        <SummaryCard title="Despesas" subtitle="total" value={fmtBRL(totalDespesas)} icon={ArrowDownCircle} color="#ef4444" active={activeCard === 'despesas'} onClick={() => setActiveCard(activeCard === 'despesas' ? null : 'despesas')} />
        <SummaryCard title="Pago" subtitle="despesas pagas" value={fmtBRL(despesasPagas)} icon={TrendingDown} color="#dc2626" active={activeCard === 'despesas-pagas'} onClick={() => setActiveCard(activeCard === 'despesas-pagas' ? null : 'despesas-pagas')} />
        <SummaryCard title="Inadimplência" subtitle="receitas vencidas" value={fmtBRL(inadimplencia)} icon={AlertTriangle} color={inadimplencia > 0 ? '#ef4444' : '#6b7280'} active={activeCard === 'inadimplencia'} onClick={() => setActiveCard(activeCard === 'inadimplencia' ? null : 'inadimplencia')} />
        <SummaryCard title="Saldo" subtitle="recebido - pago" value={fmtBRL(saldo)} icon={Wallet} color={saldo >= 0 ? '#8B5CF6' : '#ef4444'} active={activeCard === 'saldo'} onClick={() => setActiveCard(activeCard === 'saldo' ? null : 'saldo')} />
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Evolution */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />Evolução (12 meses)
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyEvolution}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <RTooltip formatter={(v) => fmtBRL(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="receitas" stroke="#22c55e" fill="#22c55e20" strokeWidth={2} />
                <Area type="monotone" dataKey="despesas" stroke="#ef4444" fill="#ef444420" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Category pie */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <PieIcon className="h-4 w-4 text-primary" />
            {typeFilter === 'despesa' ? 'Despesas' : 'Receitas'} por Categoria
          </h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeFilter === 'despesa' ? despesaCategoryData : categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {(typeFilter === 'despesa' ? despesaCategoryData : categoryData).map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RTooltip formatter={(v) => fmtBRL(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* ── Projection ── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />Projeção Futura
          </h3>
          <div className="flex items-center gap-1 flex-wrap">
            <Button variant={projectionMonths === 0 ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setProjectionMonths(0)}>
              Este mês
            </Button>
            {[3, 6, 12].map(n => (
              <Button key={n} variant={projectionMonths === n ? 'default' : 'outline'} size="sm" className="h-7 text-xs" onClick={() => setProjectionMonths(n)}>
                {n} meses
              </Button>
            ))}
          </div>
        </div>
        {projection.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projection}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <RTooltip formatter={(v) => fmtBRL(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="aReceber" name="A Receber" fill="#86efac" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="aPagar" name="A Pagar" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {projection.map(p => (
                <div key={p.month} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <span className="text-sm font-medium">{p.month}</span>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-green-600">+{fmtBRL(p.aReceber)}</span>
                    <span className="text-red-500">-{fmtBRL(p.aPagar)}</span>
                    <span className={`font-semibold ${p.saldo >= 0 ? 'text-primary' : 'text-red-500'}`}>{fmtBRL(p.saldo)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Sem dados de projeção</p>
        )}
      </Card>

      {/* ── Próximos vencimentos ── */}
      {proximosVencimentos.length > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" />Próximos Vencimentos
          </h3>
          <div className="space-y-2">
            {proximosVencimentos.map(r => {
              const days = getDaysDiff(r.due_date!)
              return (
                <div key={r.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">{r.description}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(r.due_date!)} · {getClientName(r.client_id)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${r.type === 'receita' ? 'text-green-600' : 'text-red-500'}`}>{fmtBRL(Number(r.value))}</p>
                    <Badge variant={days <= 3 ? 'destructive' : 'outline'} className="text-[10px]">
                      {days === 0 ? 'Hoje' : days === 1 ? 'Amanhã' : `${days}d`}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── Table ── */}
      <div className="rounded-lg border overflow-x-auto">
        <Table className="w-full table-auto">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Data</TableHead>
              <TableHead className="w-[70px]">Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="hidden md:table-cell w-[130px]">Cliente</TableHead>
              <TableHead className="hidden md:table-cell w-[110px]">Categoria</TableHead>
              <TableHead className="hidden lg:table-cell w-[110px]">Pagamento</TableHead>
              <TableHead className="w-[90px] text-right">Valor</TableHead>
              <TableHead className="hidden sm:table-cell w-[80px]">Status</TableHead>
              <TableHead className="w-[70px]">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum lançamento no período</TableCell></TableRow>
            ) : (
              filtered.map(row => (
                <TableRow key={row.id} className="cursor-pointer hover:bg-muted/30" onClick={() => handleEdit(row)}>
                  <TableCell className="text-sm whitespace-nowrap">{fmtDate(row.date)}</TableCell>
                  <TableCell><RowBadge row={row} /></TableCell>
                  <TableCell className="text-sm max-w-[140px] truncate">
                    {row.description}
                    {row.responsible && <span className="text-xs text-muted-foreground ml-1">@{row.responsible}</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{getClientName(row.client_id)}</TableCell>
                  <TableCell className="hidden md:table-cell text-sm">{row.category ?? '—'}</TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                    {row.payment_method ?? '—'}
                    {row.installments && row.installments > 1 && (
                      <span className="ml-1">({row.current_installment}/{row.installments})</span>
                    )}
                  </TableCell>
                  <TableCell className={`text-sm text-right font-medium whitespace-nowrap ${row.type === 'receita' ? (row.paid ? 'text-green-600' : rowStatus(row) === 'atrasado' ? 'text-red-500' : 'text-amber-500') : 'text-slate-500'}`}>
                    {fmtBRL(Number(row.value))}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusLabel row={row} />
                    {row.payment_link && (
                      <a href={row.payment_link} target="_blank" rel="noopener noreferrer" className="ml-1">
                        <Link2 className="h-3 w-3 inline text-primary" />
                      </a>
                    )}
                  </TableCell>
                  <TableCell onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(row)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(row.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
