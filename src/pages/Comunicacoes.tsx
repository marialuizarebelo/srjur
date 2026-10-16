import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { ncStyle, ncGlass } from '@/lib/notionColors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Plus, Search, Mail, Copy, Send, Pencil, Trash2, Eye,
  ChevronDown, ChevronUp, Smartphone, Tag, X, Check, Globe,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { fmtBRL, fmtDate } from '@/lib/format'

// ── Label colors (soft/muted palette) ────────────────────────────────────
// Cor padrão de cada categoria de template (usada quando o template não tem etiqueta própria).
const CATEGORY_COLORS: Record<string, string> = {
  onboarding: 'teal', cobrança: 'yellow', cobranca: 'yellow', andamento: 'blue', prazo: 'green',
  proposta: 'purple', contrato: 'brown', geral: 'gray',
}
// Categoria do template: a salva, ou deduzida pelo nome quando está vazia (templates antigos/de demonstração).
function categoryOf(t: { category?: string | null; name?: string | null; body?: string | null }): string {
  if (t.category) return t.category
  const n = ((t.name || (t as unknown as { title?: string }).title || '') + ' ' + (t.body ?? '').slice(0, 80)).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/cobran|mensalidade|pagamento/.test(n)) return 'Cobrança'
  if (/proposta|honorario/.test(n)) return 'Proposta'
  if (/contrato|renova|assinatura/.test(n)) return 'Contrato'
  if (/audiencia|prazo|vencimento/.test(n)) return 'Prazo'
  if (/andamento|atualiza|processo/.test(n)) return 'Andamento'
  if (/solicita|document|boas.vindas|onboard/.test(n)) return 'Onboarding'
  return 'Geral'
}
const LABEL_COLORS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray', 'sky'].map(key => ({ key, name: key }))

// ── Variables catalog ────────────────────────────────────────────────────
const VARIABLE_GROUPS = [
  {
    group: 'Cliente',
    vars: [
      { key: '{{nome}}',             label: 'Nome completo do cliente' },
      { key: '{{primeiro_nome}}',    label: 'Primeiro nome' },
      { key: '{{email_cliente}}',    label: 'E-mail do cliente' },
      { key: '{{telefone_cliente}}', label: 'Telefone do cliente' },
      { key: '{{cpf_cnpj}}',         label: 'CPF / CNPJ' },
    ],
  },
  {
    group: 'Processo',
    vars: [
      { key: '{{numero_processo}}',  label: 'Número do processo' },
      { key: '{{nome_processo}}',    label: 'Nome do processo' },
      { key: '{{chave_acesso}}',     label: 'Chave de acesso (EPROC)' },
      { key: '{{vara}}',             label: 'Vara / Tribunal' },
      { key: '{{sistema}}',          label: 'Sistema eletrônico' },
      { key: '{{fase_processo}}',    label: 'Fase do processo' },
    ],
  },
  {
    group: 'Agenda / Compromisso',
    vars: [
      { key: '{{data_agenda}}',      label: 'Próxima data na agenda' },
      { key: '{{hora_agenda}}',      label: 'Próximo horário' },
      { key: '{{local_agenda}}',     label: 'Local ou link' },
      { key: '{{tipo_agenda}}',      label: 'Tipo de compromisso' },
    ],
  },
  {
    group: 'Financeiro',
    vars: [
      { key: '{{valor}}',               label: 'Valor' },
      { key: '{{descricao_financeiro}}', label: 'Descrição do lançamento' },
      { key: '{{link_pagamento}}',      label: 'Link de pagamento' },
      { key: '{{vencimento}}',          label: 'Data de vencimento' },
      { key: '{{parcela}}',             label: 'Parcela (ex: 2/6)' },
    ],
  },
  {
    group: 'Prazo',
    vars: [
      { key: '{{prazo}}',           label: 'Data do prazo' },
      { key: '{{titulo_prazo}}',    label: 'Título do prazo' },
      { key: '{{origem_prazo}}',    label: 'Origem do prazo' },
    ],
  },
  {
    group: 'Portal & Acesso',
    vars: [
      { key: '{{link_portal}}',     label: 'Link do portal' },
      { key: '{{email_portal}}',    label: 'E-mail de acesso' },
      { key: '{{link}}',            label: 'Link genérico' },
    ],
  },
  {
    group: 'Escritório',
    vars: [
      { key: '{{escritorio}}',              label: 'Nome do escritório' },
      { key: '{{responsavel}}',             label: 'Advogada responsável' },
      { key: '{{primeiro_nome_responsavel}}', label: 'Primeiro nome da responsável' },
      { key: '{{telefone_escritorio}}',     label: 'Telefone do escritório' },
      { key: '{{email_escritorio}}',        label: 'E-mail do escritório' },
      { key: '{{data_hoje}}',              label: 'Data de hoje' },
    ],
  },
]

// Fallback só até a busca real do office_settings completar (ver useEffect
// que popula officeDefaults) — nunca deveria "vazar" pro envio de verdade.
const OFFICE_DEFAULTS: Record<string, string> = {
  '{{escritorio}}': 'SRJUR',
  '{{data_hoje}}': new Date().toLocaleDateString('pt-BR'),
  '{{email_escritorio}}': '',
}

const ALL_VARIABLES = VARIABLE_GROUPS.flatMap(g => g.vars)

// ── Types ─────────────────────────────────────────────────────────────────
interface LabelTag {
  id: string
  name: string
  color_index: number
}

interface Template {
  id: string
  name: string
  category: string
  channel: 'whatsapp' | 'email' | 'ambos'
  subject: string | null
  body: string
  variables: string[]
  tag_ids?: string[]
  created_at: string
}

interface Client {
  id: string; name: string; email: string | null; phone: string | null
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp', email: 'E-mail', ambos: 'Ambos',
}

const CATEGORIES = ['Onboarding','Cobrança','Andamento','Prazo','Proposta','Contrato','Geral']

function extractVars(body: string, subj?: string | null) {
  const matches = `${body} ${subj ?? ''}`.match(/\{\{[^}]+\}\}/g) ?? []
  return [...new Set(matches)]
}

function applyVars(text: string, vals: Record<string, string>) {
  let r = text
  for (const [k, v] of Object.entries(vals)) r = r.replaceAll(k, v || `[${k}]`)
  return r
}

const EXAMPLE_VALS: Record<string, string> = {
  '{{nome}}': 'Maria Santos', '{{primeiro_nome}}': 'Maria',
  '{{email_cliente}}': 'mariasantos@email.com', '{{telefone_cliente}}': '(51) 9 9999-9999',
  '{{cpf_cnpj}}': '123.456.789-00',
  '{{escritorio}}': 'Scartezzini & Rebelo Advocacia',
  '{{responsavel}}': 'Maria Luiza', '{{primeiro_nome_responsavel}}': 'Maria Luiza',
  '{{data_hoje}}': new Date().toLocaleDateString('pt-BR'),
  '{{numero_processo}}': '0001234-56.2024.8.21.0001',
  '{{nome_processo}}': 'Ação de Indenização', '{{vara}}': '3ª Vara Cível',
  '{{chave_acesso}}': 'eproc.tjrs.jus.br', '{{sistema}}': 'eProc RS',
  '{{fase_processo}}': 'Instrução',
  '{{data_agenda}}': '15/07/2026', '{{hora_agenda}}': '14h30',
  '{{local_agenda}}': 'Google Meet', '{{tipo_agenda}}': 'Audiência',
  '{{valor}}': 'R$ 1.500,00', '{{descricao_financeiro}}': 'Honorários — parcela',
  '{{vencimento}}': '20/07/2026', '{{parcela}}': '2/6',
  '{{prazo}}': '20/07/2026', '{{titulo_prazo}}': 'Contestação', '{{origem_prazo}}': 'Intimação',
  '{{link_portal}}': 'https://portal.sradvocacia.com.br',
  '{{link_pagamento}}': 'https://pay.sradvocacia.com.br/123',
  '{{link}}': 'https://sradvocacia.com.br',
  '{{telefone_escritorio}}': '(51) 9 9999-9999',
  '{{email_escritorio}}': 'contato@sradvocacia.com.br',
  '{{email_portal}}': 'mariasantos@email.com',
}

const DEFAULT_TEMPLATES: Omit<Template, 'id' | 'created_at'>[] = [
  { name: 'Boas-vindas ao escritório', category: 'Onboarding', channel: 'whatsapp', subject: null,
    body: `Olá, {{primeiro_nome}}! 👋\n\nSeja muito bem-vindo(a) ao {{escritorio}}. É uma honra tê-la como cliente.\n\nEm breve entraremos em contato para alinhar os próximos passos do seu caso. Qualquer dúvida, estamos aqui!\n\nAtt,\n{{responsavel}}`,
    variables: [], tag_ids: [] },
  { name: 'Envio de proposta', category: 'Proposta', channel: 'whatsapp', subject: null,
    body: `Olá, {{primeiro_nome}}!\n\nConforme conversamos, segue o link com a proposta de honorários para análise:\n\n{{link}}\n\nFico à disposição para esclarecer qualquer dúvida. 😊\n\nAtt,\n{{responsavel}} — {{escritorio}}`,
    variables: [], tag_ids: [] },
  { name: 'Lembrete de prazo', category: 'Prazo', channel: 'whatsapp', subject: null,
    body: `Olá, {{primeiro_nome}}. Passando para lembrar que temos um prazo importante no processo *{{nome_processo}}* com vencimento em *{{prazo}}*.\n\nCaso precise de algum documento ou informação adicional, por favor nos avise o quanto antes.\n\nAtt,\n{{responsavel}}`,
    variables: [], tag_ids: [] },
  { name: 'Andamento processual', category: 'Andamento', channel: 'email',
    subject: 'Atualização — Processo {{numero_processo}}',
    body: `Prezada {{nome}},\n\nVenho por meio deste informar sobre a atualização do seu processo nº {{numero_processo}} — {{nome_processo}}.\n\n[Descreva aqui o andamento]\n\nEstamos acompanhando de perto e qualquer novidade entraremos em contato imediatamente.\n\nAtenciosamente,\n{{responsavel}}\n{{escritorio}}`,
    variables: [], tag_ids: [] },
  { name: 'Cobrança de honorários', category: 'Cobrança', channel: 'whatsapp', subject: null,
    body: `Olá, {{primeiro_nome}}! Tudo bem?\n\nPassando para informar que há uma parcela de honorários no valor de *{{valor}}* com vencimento em breve.\n\nPara facilitar, segue o link de pagamento: {{link_pagamento}}\n\nQualquer dúvida, estou à disposição!\n\nAtt,\n{{responsavel}}`,
    variables: [], tag_ids: [] },
  { name: 'Contrato enviado para assinatura', category: 'Contrato', channel: 'whatsapp', subject: null,
    body: `Olá, {{primeiro_nome}}!\n\nO contrato de prestação de serviços está disponível para assinatura digital pelo link abaixo:\n\n{{link}}\n\nAssinar é rápido e seguro. Após a assinatura, enviaremos uma cópia para você.\n\nQualquer dúvida, estamos aqui! 😊\n\nAtt,\n{{responsavel}} — {{escritorio}}`,
    variables: [], tag_ids: [] },
  { name: 'Lembrete de compromisso', category: 'Andamento', channel: 'whatsapp', subject: null,
    body: `Olá, {{primeiro_nome}}! 📅\n\nPassando para lembrar que temos *{{tipo_agenda}}* agendado(a) para o dia *{{data_agenda}}* às *{{hora_agenda}}*.\n\nLocal / link: {{local_agenda}}\n\nQualquer dúvida, fique à vontade para chamar!\n\nAtt,\n{{responsavel}}`,
    variables: [], tag_ids: [] },
  { name: 'Boas-vindas ao portal', category: 'Onboarding', channel: 'email',
    subject: 'Acesso ao seu portal — {{escritorio}}',
    body: `Olá, {{primeiro_nome}}!\n\nSeu portal de acompanhamento já está disponível. Por lá você pode acompanhar seus processos, documentos e mensagens em tempo real.\n\nAcesse em: {{link_portal}}\nE-mail de acesso: {{email_portal}}\n\nQualquer dúvida, estamos à disposição!\n\nAtt,\n{{responsavel}}\n{{escritorio}}`,
    variables: [], tag_ids: [] },
]

// ── Component ─────────────────────────────────────────────────────────────
export default function Comunicacoes() {
  const { profile } = useAuth()
  const [officeDefaults, setOfficeDefaults] = useState<Record<string, string>>(OFFICE_DEFAULTS)
  const [templates, setTemplates] = useState<Template[]>([])
  const [clients, setClients]     = useState<Client[]>([])
  const [labels, setLabels]       = useState<LabelTag[]>([])
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('todas')
  const [chanFilter, setChanFilter] = useState('todos')
  const [labelFilter, setLabelFilter] = useState('')

  // Label editor
  const [newLabelName, setNewLabelName]   = useState('')
  const [newLabelColor, setNewLabelColor] = useState(0)
  const [editingLabel, setEditingLabel]   = useState<LabelTag | null>(null)
  const [labelFormOpen, setLabelFormOpen] = useState(false)

  // Template editor
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing]       = useState<Template | null>(null)
  const [form, setForm] = useState({
    name: '', category: 'Geral', channel: 'whatsapp' as Template['channel'],
    subject: '', body: '', tag_ids: [] as string[],
  })

  // Send dialog
  const [sendOpen, setSendOpen]         = useState(false)
  const [sendTpl, setSendTpl]           = useState<Template | null>(null)
  const [sendClient, setSendClient]     = useState('')
  const [varVals, setVarVals]           = useState<Record<string, string>>({})
  const [previewOpen, setPreviewOpen]   = useState(false)
  const [varDropOpen, setVarDropOpen]   = useState(false)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    supabase.from('office_settings').select('name').order('created_at', { ascending: true }).limit(1).maybeSingle().then(({ data }) => {
      const respName = profile?.nickname || profile?.display_name || ''
      setOfficeDefaults({
        ...OFFICE_DEFAULTS,
        '{{escritorio}}': data?.name ?? OFFICE_DEFAULTS['{{escritorio}}'],
        '{{responsavel}}': respName,
        '{{primeiro_nome_responsavel}}': respName.split(' ')[0] ?? '',
      })
    })
  }, [profile])

  async function loadData() {
    const [{ data: t }, { data: c }] = await Promise.all([
      supabase.from('communications').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('id,name,email,phone').eq('status','ativo').order('name'),
    ])

    let tpls = (t as Template[]) ?? []
    if (tpls.length === 0) {
      const toInsert = DEFAULT_TEMPLATES.map(t => ({
        ...t, variables: extractVars(t.body, t.subject), tag_ids: [],
      }))
      const { data: ins, error } = await supabase.from('communications').insert(toInsert).select()
      if (error) { toast.error('Erro ao criar templates padrão: ' + error.message) }
      tpls = (ins as Template[]) ?? []
    }
    setTemplates(tpls)
    setClients((c as Client[]) ?? [])

    // Labels from localStorage (simple persistence without extra table)
    try {
      const saved = localStorage.getItem('comm_labels')
      if (saved) setLabels(JSON.parse(saved))
      else {
        const defaults: LabelTag[] = [
          { id: '1', name: 'Aniversário', color_index: 7 },
          { id: '2', name: 'Portal', color_index: 5 },
          { id: '3', name: 'Financeiro', color_index: 3 },
          { id: '4', name: 'Compromissos', color_index: 6 },
          { id: '5', name: 'Processo', color_index: 9 },
        ]
        setLabels(defaults)
        localStorage.setItem('comm_labels', JSON.stringify(defaults))
      }
    } catch {}
  }

  function saveLabels(next: LabelTag[]) {
    setLabels(next)
    localStorage.setItem('comm_labels', JSON.stringify(next))
  }

  function addLabel() {
    if (!newLabelName.trim()) return
    if (editingLabel) {
      const next = labels.map(l => l.id === editingLabel.id
        ? { ...l, name: newLabelName, color_index: newLabelColor } : l)
      saveLabels(next)
    } else {
      const next = [...labels, { id: Date.now().toString(), name: newLabelName, color_index: newLabelColor }]
      saveLabels(next)
    }
    setNewLabelName(''); setNewLabelColor(0); setEditingLabel(null); setLabelFormOpen(false)
  }

  function deleteLabel(id: string) {
    saveLabels(labels.filter(l => l.id !== id))
  }

  function getLabelStyle(colorIndex: number) {
    return ncStyle((LABEL_COLORS[colorIndex] ?? LABEL_COLORS[8]).key)
  }

  // Templates
  const filtered = useMemo(() => templates.filter(t => {
    if (catFilter !== 'todas' && categoryOf(t) !== catFilter) return false
    if (chanFilter !== 'todos' && t.channel !== chanFilter && t.channel !== 'ambos') return false
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false
    if (labelFilter && !(t.tag_ids ?? []).includes(labelFilter)) return false
    return true
  }), [templates, catFilter, chanFilter, search, labelFilter])

  function openNew() {
    setEditing(null)
    setForm({ name: '', category: 'Geral', channel: 'whatsapp', subject: '', body: '', tag_ids: [] })
    setEditorOpen(true)
  }
  function openEdit(t: Template) {
    setEditing(t)
    setForm({ name: t.name, category: t.category, channel: t.channel,
      subject: t.subject ?? '', body: t.body, tag_ids: t.tag_ids ?? [] })
    setEditorOpen(true)
  }
  async function saveTemplate() {
    const vars = extractVars(form.body, form.subject)
    const payload = { name: form.name, category: form.category, channel: form.channel,
      subject: form.subject || null, body: form.body, variables: vars, tag_ids: form.tag_ids }
    const { error } = editing
      ? await supabase.from('communications').update(payload).eq('id', editing.id)
      : await supabase.from('communications').insert(payload)
    if (error) { toast.error('Erro ao salvar template: ' + error.message); return }
    toast.success(editing ? 'Template atualizado!' : 'Template criado!')
    setEditorOpen(false)
    loadData()
  }
  async function deleteTemplate(id: string) {
    if (!confirm('Excluir este template?')) return
    await supabase.from('communications').delete().eq('id', id)
    loadData()
  }

  function toggleFormTag(id: string) {
    setForm(f => ({
      ...f, tag_ids: f.tag_ids.includes(id) ? f.tag_ids.filter(x => x !== id) : [...f.tag_ids, id],
    }))
  }

  function insertVar(key: string) {
    setForm(f => ({ ...f, body: f.body + key }))
    setVarDropOpen(false)
  }

  // Send
  function openSend(t: Template) {
    setSendTpl(t)
    setSendClient('')
    const defaults: Record<string, string> = { ...officeDefaults }
    for (const v of t.variables ?? []) { if (!defaults[v]) defaults[v] = '' }
    setVarVals(defaults)
    setPreviewOpen(false)
    setSendOpen(true)
  }
  async function autofill(clientId: string) {
    setSendClient(clientId)
    const c = clients.find(cl => cl.id === clientId)
    if (!c) return
    const parts = c.name.trim().split(' ')
    const filled: Record<string, string> = {
      '{{nome}}': c.name, '{{primeiro_nome}}': parts[0] ?? '',
      '{{email_cliente}}': c.email ?? '', '{{telefone_cliente}}': c.phone ?? '',
    }

    // Puxa dados reais vinculados a esse cliente pra preencher o resto das
    // variáveis sozinho, sem precisar digitar tudo de novo — processo mais
    // recente, próximo lançamento em aberto e próximo compromisso da agenda.
    const [{ data: proc }, { data: fin }, { data: task }, { data: deadline }] = await Promise.all([
      supabase.from('clients').select('cpf_cnpj').eq('id', clientId).maybeSingle(),
      supabase.from('finance').select('value, description, due_date, payment_link, current_installment, installments')
        .eq('client_id', clientId).eq('type', 'receita').eq('paid', false).order('due_date').limit(1).maybeSingle(),
      supabase.from('tasks').select('title, due_date, due_time, type')
        .eq('client_id', clientId).eq('status', 'pendente').order('due_date').limit(1).maybeSingle(),
      supabase.from('deadlines').select('title, due_date')
        .eq('client_id', clientId).eq('status', 'pendente').order('due_date').limit(1).maybeSingle(),
    ])
    const { data: process } = await supabase.from('processes')
      .select('number, title, phase, court, electronic_system, access_key')
      .eq('client_id', clientId).order('updated_at', { ascending: false }).limit(1).maybeSingle()

    if (proc?.cpf_cnpj) filled['{{cpf_cnpj}}'] = proc.cpf_cnpj
    if (process) {
      filled['{{numero_processo}}'] = process.number ?? ''
      filled['{{nome_processo}}'] = process.title ?? ''
      filled['{{fase_processo}}'] = process.phase ?? ''
      filled['{{vara}}'] = process.court ?? ''
      filled['{{sistema}}'] = process.electronic_system ?? ''
      filled['{{chave_acesso}}'] = process.access_key ?? ''
    }
    if (fin) {
      filled['{{valor}}'] = fmtBRL(Number(fin.value))
      filled['{{descricao_financeiro}}'] = fin.description ?? ''
      filled['{{link_pagamento}}'] = fin.payment_link ?? ''
      filled['{{vencimento}}'] = fin.due_date ? fmtDate(fin.due_date) : ''
      filled['{{parcela}}'] = fin.current_installment && fin.installments ? `${fin.current_installment}/${fin.installments}` : ''
    }
    if (task) {
      filled['{{data_agenda}}'] = task.due_date ? fmtDate(task.due_date) : ''
      filled['{{hora_agenda}}'] = task.due_time ?? ''
      filled['{{tipo_agenda}}'] = task.type ?? ''
    }
    if (deadline) {
      filled['{{prazo}}'] = deadline.due_date ? fmtDate(deadline.due_date) : ''
      filled['{{titulo_prazo}}'] = deadline.title ?? ''
    }

    setVarVals(prev => ({ ...prev, ...filled }))
  }
  const preview = useMemo(() => ({
    subject: applyVars(sendTpl?.subject ?? '', varVals),
    body: applyVars(sendTpl?.body ?? '', varVals),
  }), [sendTpl, varVals])

  function sendWA() {
    const c = clients.find(cl => cl.id === sendClient)
    const phone = c?.phone?.replace(/\D/g, '')
    window.open(`https://wa.me/${phone ? `55${phone}` : ''}?text=${encodeURIComponent(preview.body)}`, '_blank')
  }
  function sendEmail() {
    const c = clients.find(cl => cl.id === sendClient)
    window.open(`mailto:${c?.email ?? ''}?subject=${encodeURIComponent(preview.subject)}&body=${encodeURIComponent(preview.body)}`, '_blank')
  }
  async function sendToPortal() {
    if (!sendClient) { toast.error('Selecione um cliente para enviar ao portal'); return }
    const title = preview.subject || sendTpl?.name || 'Mensagem do escritório'
    const { error } = await supabase.from('portal_messages').insert({
      client_id: sendClient,
      title,
      body: preview.body,
      sent_by: 'Escritório',
    })
    if (error) { toast.error('Erro ao enviar ao portal'); return }
    toast.success('Mensagem enviada ao portal do cliente!')
    setSendOpen(false)
  }

  // ── Label chip ────────────────────────────────────────────────────────
  function LabelChip({ labelId, size = 'sm' }: { labelId: string; size?: 'sm' | 'xs' }) {
    const l = labels.find(x => x.id === labelId)
    if (!l) return null
    const c = getLabelStyle(l.color_index)
    return (
      <span className={`inline-flex items-center rounded-full font-medium border ${size === 'xs' ? 'text-[9px] px-1.5 py-0' : 'text-[10px] px-2 py-0.5'}`}
        style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}>
        {l.name}
      </span>
    )
  }

  // ── Template card ─────────────────────────────────────────────────────
  function TemplateCard({ t }: { t: Template }) {
    const [expanded, setExpanded] = useState(false)
    const tagIds = t.tag_ids ?? []
    const ChannelIcon = t.channel === 'whatsapp' ? Smartphone : Mail
    const firstLabel = tagIds.map(id => labels.find(l => l.id === id)).find(Boolean)
    const catKey = CATEGORY_COLORS[categoryOf(t).toLowerCase()]
    const tintKey = firstLabel ? LABEL_COLORS[firstLabel.color_index]?.key : catKey
    const tint = tintKey ? ncStyle(tintKey) : null
    // Destaca as {{variáveis}} do texto como "chips" sutis
    const parts = (t.body ?? '').split(/(\{\{[^}]+\}\})/g)

    return (
      <div style={tintKey ? ncGlass(tintKey, 1.1) : undefined}
        className={`group/tpl relative flex flex-col gap-4 rounded-3xl border p-5 ${tint ? '' : 'border-[var(--glass-border)] bg-card'} shadow-[0_20px_50px_-30px_rgba(20,33,61,0.25)] transition-[filter] hover:brightness-[0.98] dark:shadow-[0_20px_50px_-28px_rgba(0,0,0,0.6)]`}>
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-surface)] flex items-center justify-center text-muted-foreground">
            <ChannelIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-snug truncate">{t.name || (t as unknown as { title?: string }).title || 'Template sem título'}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {[categoryOf(t), CHANNEL_LABELS[t.channel]].filter(Boolean).join(' · ')}
            </p>
            {tagIds.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tagIds.map(id => <LabelChip key={id} labelId={id} />)}
              </div>
            )}
          </div>
          <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-full border border-[var(--glass-border)] bg-card/90 p-0.5 backdrop-blur sm:opacity-0 sm:group-hover/tpl:opacity-100 focus-within:opacity-100 transition-opacity">
            <button onClick={() => { navigator.clipboard.writeText(t.body); toast.success('Copiado!') }}
              className="h-8 w-8 rounded-full hover:bg-[var(--glass-surface)] flex items-center justify-center transition-colors" title="Copiar">
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => openEdit(t)}
              className="h-8 w-8 rounded-full hover:bg-[var(--glass-surface)] flex items-center justify-center transition-colors" title="Editar">
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <button onClick={() => deleteTemplate(t.id)}
              className="h-8 w-8 rounded-full hover:bg-[var(--glass-surface)] flex items-center justify-center transition-colors" title="Excluir">
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 cursor-pointer" onClick={() => setExpanded(e => !e)}>
          <p className={`text-[13px] text-muted-foreground whitespace-pre-wrap leading-relaxed ${expanded ? '' : 'line-clamp-4'}`}>
            {parts.map((p, i) => p.startsWith('{{')
              ? <span key={i} className="rounded-md bg-primary/15 px-1 py-0.5 font-mono text-[11px] text-[var(--accent-light)]">{p}</span>
              : <span key={i}>{p}</span>)}
          </p>
          <button className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground mt-2 hover:text-foreground transition-colors">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Recolher' : 'Ler completo'}
          </button>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t" style={{ borderColor: tint ? tint.border : 'var(--glass-border)' }}>
          <Button size="sm" variant="secondary" className="shrink-0 hover:bg-primary hover:text-primary-foreground" onClick={() => openSend(t)}>
            <Send className="h-3 w-3" />Usar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* ── Sidebar: Labels ── */}
      <aside className="w-full md:w-52 shrink-0 space-y-3">
        <div className="rounded-3xl border border-[var(--glass-border)] bg-card p-5 space-y-3 shadow-[0_20px_50px_-30px_rgba(20,33,61,0.25)] dark:shadow-[0_20px_50px_-28px_rgba(0,0,0,0.6)]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />Etiquetas
            </p>
            <button onClick={() => { setEditingLabel(null); setNewLabelName(''); setNewLabelColor(0); setLabelFormOpen(true) }}
              className="h-5 w-5 rounded-md hover:bg-muted flex items-center justify-center transition-colors">
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-1">
            <button onClick={() => setLabelFilter('')}
              className={`w-full text-left text-xs px-2 py-1.5 rounded-lg transition-colors ${!labelFilter ? 'bg-[var(--glass-surface)] shadow-[inset_0_0_0_1px_var(--glass-border)] font-bold' : 'text-muted-foreground hover:bg-[var(--glass-surface)]'}`}>
              Todas as etiquetas
            </button>
            {labels.map(l => {
              const c = getLabelStyle(l.color_index)
              const active = labelFilter === l.id
              return (
                <div key={l.id} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors group ${active ? 'bg-[var(--glass-surface)] shadow-[inset_0_0_0_1px_var(--glass-border)]' : 'hover:bg-[var(--glass-surface)]'}`}
                  onClick={() => setLabelFilter(active ? '' : l.id)}>
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: c.dot }} />
                  <span className="text-xs flex-1">{l.name}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5">
                    <button onClick={e => { e.stopPropagation(); setEditingLabel(l); setNewLabelName(l.name); setNewLabelColor(l.color_index); setLabelFormOpen(true) }}
                      className="h-4 w-4 rounded hover:bg-muted flex items-center justify-center">
                      <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                    </button>
                    <button onClick={e => { e.stopPropagation(); deleteLabel(l.id) }}
                      className="h-4 w-4 rounded hover:bg-muted flex items-center justify-center">
                      <X className="h-2.5 w-2.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Label form */}
          {labelFormOpen && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <Input placeholder="Nome da etiqueta" value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                className="h-8 text-xs rounded-xl" autoFocus />
              <div className="grid grid-cols-5 gap-1.5">
                {LABEL_COLORS.map((c, i) => (
                  <button key={i} onClick={() => setNewLabelColor(i)}
                    className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${newLabelColor === i ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: ncStyle(c.key).dot }} />
                ))}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 h-7 text-xs rounded-xl" onClick={addLabel} disabled={!newLabelName.trim()}>
                  Salvar
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-xl px-2"
                  onClick={() => { setLabelFormOpen(false); setEditingLabel(null) }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 space-y-5 min-w-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Comunicações</h1>
            <p className="text-sm text-muted-foreground">{templates.length} templates de mensagem</p>
          </div>
          <Button size="sm" onClick={openNew} className="rounded-xl self-start">
            <Plus className="h-3.5 w-3.5 mr-1.5" />Novo template
          </Button>
        </div>

        {/* Filters */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar template..." value={search} onChange={e => setSearch(e.target.value)}
                className="pl-10 h-10 rounded-full" />
            </div>
            <div className="flex items-center gap-0.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-surface)] p-[3px]">
              {[{v:'todos',l:'Todos'},{v:'whatsapp',l:'WhatsApp'},{v:'email',l:'E-mail'}].map(o => (
                <button key={o.v} onClick={() => setChanFilter(o.v)}
                  className={`px-4 h-8 rounded-full text-[13px] font-bold transition-all ${chanFilter===o.v ? 'bg-[var(--glass-surface)] text-foreground shadow-[inset_0_0_0_1px_var(--glass-border)]' : 'text-muted-foreground hover:text-foreground'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['todas', ...CATEGORIES]).map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`h-8 px-4 rounded-full text-[13px] font-semibold border transition-all ${catFilter === c ? 'bg-[var(--glass-surface)] text-foreground border-[var(--glass-border)] shadow-[inset_0_0_0_1px_var(--glass-border)] font-bold' : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-[var(--glass-surface)]'}`}>
                {c !== 'todas' && CATEGORY_COLORS[c.toLowerCase()] && <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ backgroundColor: ncStyle(CATEGORY_COLORS[c.toLowerCase()]).dot }} />}
                {c === 'todas' ? 'Todas' : c}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground rounded-3xl border border-dashed border-[var(--glass-border)]">
            <p className="text-sm font-semibold text-foreground">Nenhum template encontrado</p>
            <p className="text-xs mt-1">Ajuste os filtros ou crie um novo template.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(t => <TemplateCard key={t.id} t={t} />)}
          </div>
        )}
      </div>

      {/* ── Editor Dialog ── */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[800px] w-[96vw] max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar' : 'Novo'} template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 space-y-1.5">
                <Label>Nome do template</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Lembrete de audiência" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-10"><SelectValue>{form.category}</SelectValue></SelectTrigger>
                  <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Canal</Label>
                <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v as Template['channel'] }))}>
                  <SelectTrigger className="h-10"><SelectValue>{CHANNEL_LABELS[form.channel]}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Etiquetas</Label>
                <div className="flex flex-wrap gap-1 min-h-[40px] rounded-xl border border-border px-2 py-1.5 bg-background">
                  {labels.map(l => {
                    const sel = form.tag_ids.includes(l.id)
                    const c = getLabelStyle(l.color_index)
                    return (
                      <button key={l.id} onClick={() => toggleFormTag(l.id)}
                        className="inline-flex items-center gap-1 rounded-full text-[10px] px-2 py-0.5 border transition-all"
                        style={sel ? { backgroundColor: c.bg, color: c.text, borderColor: c.border } : { backgroundColor: 'transparent', color: 'var(--muted-foreground)', borderColor: 'var(--glass-border)' }}>
                        {sel && <Check className="h-2.5 w-2.5" />}{l.name}
                      </button>
                    )
                  })}
                  {labels.length === 0 && <span className="text-[10px] text-muted-foreground">Crie etiquetas na sidebar</span>}
                </div>
              </div>
            </div>

            {(form.channel === 'email' || form.channel === 'ambos') && (
              <div className="space-y-1.5">
                <Label>Assunto do e-mail</Label>
                <Input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Ex: Atualização — Processo {{numero_processo}}" className="h-10" />
              </div>
            )}

            {/* Variable dropdown */}
            <div className="space-y-1.5">
              <Label>Corpo da mensagem</Label>
              <div className="flex justify-end mb-1.5">
                <DropdownMenu open={varDropOpen} onOpenChange={setVarDropOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs rounded-xl gap-1">
                      Inserir variável <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-80 max-h-72 overflow-y-auto p-2 space-y-1">
                    {VARIABLE_GROUPS.map(g => (
                      <div key={g.group}>
                        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-1">{g.group}</p>
                        {g.vars.map(v => (
                          <button key={v.key} onClick={() => insertVar(v.key)}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-left">
                            <span className="text-xs text-foreground">{v.label}</span>
                            <span className="text-[10px] font-mono text-violet-500 ml-2 shrink-0">{v.key}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                rows={10} className="font-mono text-xs leading-relaxed resize-none"
                placeholder="Escreva a mensagem aqui. Use 'Inserir variável' para personalizar..." />
            </div>

            {/* Live preview */}
            {form.body && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Eye className="h-3 w-3" />Pré-visualização com dados de exemplo
                </Label>
                <div className="bg-muted/30 rounded-xl px-4 py-3">
                  {form.subject && <p className="text-xs font-medium mb-1 text-muted-foreground">Assunto: {applyVars(form.subject, EXAMPLE_VALS)}</p>}
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{applyVars(form.body, EXAMPLE_VALS)}</p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" size="lg" />}>Cancelar</DialogClose>
            <Button size="lg" onClick={saveTemplate} disabled={!form.name || !form.body}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Send Dialog ── */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="max-w-[640px] w-[96vw] max-h-[90vh] overflow-y-auto p-8">
          <DialogHeader>
            <DialogTitle>Usar template</DialogTitle>
            <p className="text-sm text-muted-foreground">{sendTpl?.name}</p>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Cliente (preenche variáveis automaticamente)</Label>
              <Select value={sendClient} onValueChange={autofill}>
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione...">
                    {sendClient ? clients.find(c => c.id === sendClient)?.name ?? '' : 'Nenhum'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Var inputs grouped */}
            {sendTpl && (() => {
              const toFill = (sendTpl.variables ?? []).filter(v => !officeDefaults[v])
              if (toFill.length === 0) return null
              return (
                <div className="space-y-3">
                  <Label className="text-xs text-muted-foreground">Preencher variáveis</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {toFill.map(v => {
                      const meta = ALL_VARIABLES.find(av => av.key === v)
                      return (
                        <div key={v} className="space-y-1">
                          <span className="text-[9px] font-mono text-violet-500">{v}</span>
                          <Input value={varVals[v] ?? ''} onChange={e => setVarVals(p => ({ ...p, [v]: e.target.value }))}
                            placeholder={meta?.label ?? v} className="h-8 text-xs" />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <button onClick={() => setPreviewOpen(p => !p)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <Eye className="h-3.5 w-3.5" />
              {previewOpen ? 'Ocultar pré-visualização' : 'Ver pré-visualização'}
              {previewOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {previewOpen && (
              <div className="bg-muted/30 rounded-xl px-4 py-3">
                {preview.subject && <p className="text-xs font-medium mb-2 text-muted-foreground">Assunto: {preview.subject}</p>}
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">{preview.body}</p>
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 flex-wrap gap-2">
            <Button variant="outline" onClick={() => { navigator.clipboard.writeText(preview.body); toast.success('Copiado!') }}>
              <Copy className="h-3.5 w-3.5 mr-1.5" />Copiar texto
            </Button>
            {(sendTpl?.channel === 'whatsapp' || sendTpl?.channel === 'ambos') && (
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={sendWA}>
                <Smartphone className="h-3.5 w-3.5 mr-1.5" />WhatsApp
              </Button>
            )}
            {(sendTpl?.channel === 'email' || sendTpl?.channel === 'ambos') && (
              <Button onClick={sendEmail}>
                <Mail className="h-3.5 w-3.5 mr-1.5" />E-mail
              </Button>
            )}
            <Button variant="outline" onClick={sendToPortal} disabled={!sendClient}
              className="border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-400">
              <Globe className="h-3.5 w-3.5 mr-1.5" />Enviar ao portal
            </Button>
            <DialogClose render={<Button variant="ghost" />}>Fechar</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
