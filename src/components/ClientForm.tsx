import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Loader2, X, UserPlus, ChevronDown, Check } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'
import { DriveFileList } from '@/components/DriveFileList'

// ── Áreas com cores estilo Notion ──────────────────────────────────────────────
const AREA_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Cível':           { bg: 'bg-blue-100 dark:bg-blue-900/40',       text: 'text-blue-700 dark:text-blue-300',       dot: 'bg-blue-500'    },
  'Trabalhista':     { bg: 'bg-orange-100 dark:bg-orange-900/40',   text: 'text-orange-700 dark:text-orange-300',   dot: 'bg-orange-500'  },
  'Família':         { bg: 'bg-pink-100 dark:bg-pink-900/40',       text: 'text-pink-700 dark:text-pink-300',       dot: 'bg-pink-500'    },
  'Sucessões':       { bg: 'bg-purple-100 dark:bg-purple-900/40',   text: 'text-purple-700 dark:text-purple-300',   dot: 'bg-purple-500'  },
  'Empresarial':     { bg: 'bg-teal-100 dark:bg-teal-900/40',       text: 'text-teal-700 dark:text-teal-300',       dot: 'bg-teal-500'    },
  'Consumidor':      { bg: 'bg-yellow-100 dark:bg-yellow-900/40',   text: 'text-yellow-700 dark:text-yellow-300',   dot: 'bg-yellow-500'  },
  'Penal':           { bg: 'bg-red-100 dark:bg-red-900/40',         text: 'text-red-700 dark:text-red-300',         dot: 'bg-red-500'     },
  'Criminal':        { bg: 'bg-red-100 dark:bg-red-900/40',         text: 'text-red-700 dark:text-red-300',         dot: 'bg-red-500'     },
  'Tributário':      { bg: 'bg-indigo-100 dark:bg-indigo-900/40',   text: 'text-indigo-700 dark:text-indigo-300',   dot: 'bg-indigo-500'  },
  'Imobiliário':     { bg: 'bg-amber-100 dark:bg-amber-900/40',     text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500'   },
  'Previdenciário':  { bg: 'bg-cyan-100 dark:bg-cyan-900/40',       text: 'text-cyan-700 dark:text-cyan-300',       dot: 'bg-cyan-500'    },
  'Administrativo':  { bg: 'bg-slate-100 dark:bg-slate-800',        text: 'text-slate-700 dark:text-slate-300',     dot: 'bg-slate-500'   },
  'Outro':           { bg: 'bg-gray-100 dark:bg-gray-800',          text: 'text-gray-600 dark:text-gray-400',       dot: 'bg-gray-400'    },
}
const AREAS = Object.keys(AREA_COLORS)

function AreaTag({ area, onRemove }: { area: string; onRemove?: () => void }) {
  const c = AREA_COLORS[area] ?? AREA_COLORS['Outro']
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
      {area}
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-0.5 hover:opacity-70">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )
}

// ── MultiSelect de Áreas ───────────────────────────────────────────────────────
function AreasMultiSelect({ selected, onChange }: {
  selected: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  function toggle(area: string) {
    onChange(selected.includes(area) ? selected.filter(a => a !== area) : [...selected, area])
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full min-h-10 px-3 py-2 rounded-md border border-input bg-background text-sm flex items-center gap-1.5 flex-wrap hover:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {selected.length === 0 ? (
          <span className="text-muted-foreground flex-1 text-left">Selecione as áreas...</span>
        ) : (
          <div className="flex flex-wrap gap-1 flex-1">
            {selected.map(a => (
              <AreaTag key={a} area={a} onRemove={() => toggle(a)} />
            ))}
          </div>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 ml-auto" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div className="p-1 max-h-52 overflow-y-auto">
            {AREAS.map(area => {
              const c = AREA_COLORS[area]
              const sel = selected.includes(area)
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => toggle(area)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md hover:bg-muted transition-colors text-sm text-left"
                >
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${c.dot}`} />
                  <span className="flex-1">{area}</span>
                  {sel && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Masks ──────────────────────────────────────────────────────────────────────
function maskCPF(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14)
}
function maskCNPJ(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2').slice(0, 18)
}
function maskPhone(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15)
}
function maskCEP(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9)
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface ClientFormData {
  name: string; type: string; cpf_cnpj: string; email: string; phone: string
  gender: string; nationality: string; marital_status: string; profession: string
  rg_number: string; rg_issuer: string
  cep: string; street: string; address_number: string; complement: string
  neighborhood: string; city: string; state: string
  responsible: string; origin: string; referred_by: string; referral_fee_pct: string
  area: string; areas_selected: string[]
  potential_value: string; drive_url: string; drive_folder_id: string; tags: string; notes: string
  status: string; portal_visible: boolean; birth_date: string
  signed_at: string; first_contact_at: string
}

export const emptyClientForm: ClientFormData = {
  name: '', type: 'pessoa_fisica', cpf_cnpj: '', email: '', phone: '',
  gender: 'Não informado', nationality: 'brasileira', marital_status: 'Não informado',
  profession: '', rg_number: '', rg_issuer: '',
  cep: '', street: '', address_number: '', complement: '',
  neighborhood: '', city: '', state: '',
  responsible: '', origin: '', referred_by: '', referral_fee_pct: '', area: '', areas_selected: [],
  potential_value: '', drive_url: '', drive_folder_id: '', tags: '', notes: '',
  status: 'ativo', portal_visible: false, birth_date: '',
  signed_at: '', first_contact_at: '',
}

const GENDERS = ['Masculino', 'Feminino', 'Outro', 'Não informado']
const MARITAL_STATUSES = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Não informado']
const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const ORIGINS = ['Indicação', 'Google', 'Instagram', 'WhatsApp', 'Site', 'Evento', 'Outro']

interface ClientFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  form: ClientFormData
  setForm: React.Dispatch<React.SetStateAction<ClientFormData>>
  onSave: () => void
  onDelete?: () => void
  isEditing: boolean
  clientId?: string
}

// ── Seção visual ───────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground pb-1 border-b">
        {title}
      </p>
      {children}
    </div>
  )
}

export function ClientFormDialog({
  open, onOpenChange, form, setForm, onSave, onDelete, isEditing, clientId,
}: ClientFormDialogProps) {
  const [cepLoading, setCepLoading] = useState(false)
  const [driveRootFolderId, setDriveRootFolderId] = useState<string | null>(null)
  const [creatingAccess, setCreatingAccess] = useState(false)
  const [credentialsOpen, setCredentialsOpen] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState('')

  useEffect(() => {
    supabase.from('office_settings').select('drive_root_folder_id').limit(1).maybeSingle().then(({ data }) => {
      setDriveRootFolderId(data?.drive_root_folder_id ?? null)
    })
  }, [])

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let pw = ''
    for (let i = 0; i < 10; i++) pw += chars[Math.floor(Math.random() * chars.length)]
    return pw
  }

  async function createPortalAccess() {
    if (!clientId || !form.email) return
    setCreatingAccess(true)
    const password = generatePassword()
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-client-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: form.email, password, display_name: form.name, client_id: clientId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Erro desconhecido')
      setGeneratedPassword(password)
      setCredentialsOpen(true)
    } catch (e: any) {
      toast.error('Erro ao criar acesso: ' + e.message)
    } finally {
      setCreatingAccess(false)
    }
  }

  function copyCredentials() {
    const portalUrl = window.location.origin + '/login'
    const text = `Acesso ao Portal do Cliente:\n${portalUrl}\n\nE-mail: ${form.email}\nSenha provisória: ${generatedPassword}\n\nRecomendamos trocar a senha no primeiro acesso.`
    navigator.clipboard.writeText(text)
    toast.success('Credenciais copiadas!')
  }

  const fetchCEP = async () => {
    const cep = form.cep.replace(/\D/g, '')
    if (cep.length !== 8) return
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = await res.json()
      if (!data.erro) {
        setForm(f => ({
          ...f,
          street: data.logradouro || f.street,
          neighborhood: data.bairro || f.neighborhood,
          city: data.localidade || f.city,
          state: data.uf || f.state,
          complement: data.complemento || f.complement,
        }))
      }
    } catch { /* ignore */ }
    setCepLoading(false)
  }

  const docMask = form.type === 'pessoa_fisica' ? maskCPF : maskCNPJ
  const docPlaceholder = form.type === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[800px] w-[96vw] max-h-[92vh] overflow-y-auto p-6 md:p-8"
        // Não fecha ao clicar fora nem ao trocar de janela
        onInteractOutside={e => e.preventDefault()}
        onPointerDownOutside={e => e.preventDefault()}
        onFocusOutside={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg">{isEditing ? 'Editar' : 'Novo'} Cliente</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">

          {/* ── Dados pessoais ── */}
          <Section title="Dados Pessoais">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nome completo *</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v, cpf_cnpj: '' }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pessoa_fisica">Pessoa Física</SelectItem>
                    <SelectItem value="pessoa_juridica">Pessoa Jurídica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{form.type === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label>
                <Input
                  value={form.cpf_cnpj}
                  onChange={e => setForm(f => ({ ...f, cpf_cnpj: docMask(e.target.value) }))}
                  placeholder={docPlaceholder}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: maskPhone(e.target.value) }))}
                  placeholder="(00) 00000-0000"
                  className="h-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Data de nascimento</Label>
                <Input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Gênero</Label>
                <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado civil</Label>
                <Select value={form.marital_status} onValueChange={v => setForm(f => ({ ...f, marital_status: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>{MARITAL_STATUSES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Nacionalidade</Label>
                <Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Profissão</Label>
                <Input value={form.profession} onChange={e => setForm(f => ({ ...f, profession: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>RG</Label>
                <div className="flex gap-2">
                  <Input value={form.rg_number} onChange={e => setForm(f => ({ ...f, rg_number: e.target.value }))} placeholder="Número" className="h-10 flex-1" />
                  <Input value={form.rg_issuer} onChange={e => setForm(f => ({ ...f, rg_issuer: e.target.value }))} placeholder="Órgão" className="h-10 w-20" />
                </div>
              </div>
            </div>
          </Section>

          {/* ── Endereço ── */}
          <Section title="Endereço">
            <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr_90px] gap-4">
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <div className="relative">
                  <Input
                    value={form.cep}
                    onChange={e => setForm(f => ({ ...f, cep: maskCEP(e.target.value) }))}
                    onBlur={fetchCEP}
                    placeholder="00000-000"
                    className="h-10 pr-8"
                  />
                  {cepLoading && <Loader2 className="absolute right-2 top-3 h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Rua / Avenida</Label>
                <Input value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Nº</Label>
                <Input value={form.address_number} onChange={e => setForm(f => ({ ...f, address_number: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label>Complemento</Label>
                <Input value={form.complement} onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} placeholder="Apto, Sala..." className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Bairro</Label>
                <Input value={form.neighborhood} onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>UF</Label>
                <Select value={form.state} onValueChange={v => setForm(f => ({ ...f, state: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* ── Jurídico / Comercial ── */}
          <Section title="Jurídico / Comercial">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select value={form.responsible} onValueChange={v => setForm(f => ({ ...f, responsible: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Maria Luiza">Maria Luiza</SelectItem>
                    <SelectItem value="Juliana">Juliana</SelectItem>
                    <SelectItem value="Ambas">Ambas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={form.origin} onValueChange={v => setForm(f => ({ ...f, origin: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Encerrado</SelectItem>
                    <SelectItem value="prospecto">Prospecto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Campos de indicação — aparecem só quando origem é Indicação */}
            {form.origin === 'Indicação' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Indicado por</Label>
                  <Input value={form.referred_by} onChange={e => setForm(f => ({ ...f, referred_by: e.target.value }))} placeholder="Nome de quem indicou" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label>% de repasse acordado</Label>
                  <div className="relative">
                    <Input value={form.referral_fee_pct} onChange={e => setForm(f => ({ ...f, referral_fee_pct: e.target.value }))} placeholder="Ex: 10" className="h-10 pr-8" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data de assinatura do contrato</Label>
                <Input type="date" value={form.signed_at} onChange={e => setForm(f => ({ ...f, signed_at: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Data do primeiro contato</Label>
                <Input type="date" value={form.first_contact_at} onChange={e => setForm(f => ({ ...f, first_contact_at: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Áreas do Direito</Label>
              <AreasMultiSelect
                selected={form.areas_selected}
                onChange={v => setForm(f => ({ ...f, areas_selected: v }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Potencial financeiro (R$)</Label>
                <Input value={form.potential_value} onChange={e => setForm(f => ({ ...f, potential_value: e.target.value }))} placeholder="0,00" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Tags (separadas por vírgula)</Label>
                <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="urgente, família" className="h-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pasta no Google Drive</Label>
              <DriveFolderPicker
                value={{ folder_id: form.drive_folder_id, drive_url: form.drive_url }}
                onChange={f => setForm(prev => ({ ...prev, drive_folder_id: f.folder_id, drive_url: f.drive_url }))}
                folderNameSuggestion={form.name}
                parentFolderId={driveRootFolderId}
              />
              {form.drive_folder_id && (
                <div className="rounded-xl border border-border/60 p-3 mt-2">
                  <DriveFileList folderId={form.drive_folder_id} />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Observações estratégicas</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </Section>

          {/* ── Toggles ── */}
          <div className="flex items-center gap-3 py-3 px-4 rounded-lg bg-muted/40 border">
            <Switch checked={form.portal_visible} onCheckedChange={v => setForm(f => ({ ...f, portal_visible: v }))} />
            <div>
              <p className="text-sm font-medium">Visível no portal do cliente</p>
              <p className="text-xs text-muted-foreground">Permite que o cliente acesse esse cadastro pelo portal</p>
            </div>
          </div>

          {isEditing && clientId && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex items-center gap-3">
              <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Acesso ao portal</p>
                <p className="text-[11px] text-muted-foreground">Cria o login do cliente com senha provisória para copiar e enviar.</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={createPortalAccess} disabled={creatingAccess || !form.email} className="shrink-0">
                {creatingAccess ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                {creatingAccess ? 'Criando...' : 'Criar acesso'}
              </Button>
            </div>
          )}
        </div>

        {/* ── Credenciais ── */}
        <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
          <DialogContent className="max-w-[420px] w-[96vw] p-6">
            <DialogHeader><DialogTitle>Acesso criado!</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Envie essas credenciais para {form.name.split(' ')[0]}. Recomende trocar a senha no primeiro acesso.
              </p>
              <div className="rounded-xl bg-muted/40 p-4 space-y-2 font-mono text-xs">
                <p><span className="text-muted-foreground">Link:</span> {window.location.origin}/login</p>
                <p><span className="text-muted-foreground">E-mail:</span> {form.email}</p>
                <p><span className="text-muted-foreground">Senha:</span> {generatedPassword}</p>
              </div>
              <Button className="w-full" onClick={copyCredentials}>Copiar credenciais</Button>
            </div>
            <DialogFooter className="pt-2">
              <DialogClose render={<Button variant="outline" />}>Fechar</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DialogFooter className="pt-4 border-t mt-2">
          {isEditing && onDelete && (
            <Button variant="destructive" className="mr-auto" onClick={onDelete}>Excluir</Button>
          )}
          <DialogClose render={<Button variant="outline" size="lg" />}>Cancelar</DialogClose>
          <Button size="lg" onClick={onSave} disabled={!form.name}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
