import { useState, useEffect } from 'react'
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
import { Loader2, Search, X, UserPlus } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'
import { DriveFileList } from '@/components/DriveFileList'

const AREAS = [
  'Cível', 'Trabalhista', 'Família', 'Sucessões', 'Empresarial',
  'Consumidor', 'Penal', 'Criminal', 'Tributário', 'Imobiliário',
  'Previdenciário', 'Administrativo', 'Outro',
]

const GENDERS = ['Masculino', 'Feminino', 'Outro', 'Não informado']
const MARITAL_STATUSES = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'União Estável', 'Não informado']
const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const ORIGINS = ['Indicação', 'Google', 'Instagram', 'WhatsApp', 'Site', 'Evento', 'Outro']

// ── Masks ──
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

export interface ClientFormData {
  name: string; type: string; cpf_cnpj: string; email: string; phone: string
  gender: string; nationality: string; marital_status: string; profession: string
  rg_number: string; rg_issuer: string
  cep: string; street: string; address_number: string; complement: string
  neighborhood: string; city: string; state: string
  responsible: string; origin: string; area: string; areas_selected: string[]
  potential_value: string; drive_url: string; drive_folder_id: string; tags: string; notes: string
  status: string; portal_visible: boolean; birth_date: string
}

export const emptyClientForm: ClientFormData = {
  name: '', type: 'pessoa_fisica', cpf_cnpj: '', email: '', phone: '',
  gender: 'Não informado', nationality: 'brasileira', marital_status: 'Não informado',
  profession: '', rg_number: '', rg_issuer: '',
  cep: '', street: '', address_number: '', complement: '',
  neighborhood: '', city: '', state: '',
  responsible: '', origin: '', area: '', areas_selected: [],
  potential_value: '', drive_url: '', drive_folder_id: '', tags: '', notes: '',
  status: 'ativo', portal_visible: false, birth_date: '',
}

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

export function ClientFormDialog({
  open, onOpenChange, form, setForm, onSave, onDelete, isEditing, clientId,
}: ClientFormDialogProps) {
  const [cepLoading, setCepLoading] = useState(false)
  const [driveRootFolderId, setDriveRootFolderId] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('office_settings').select('drive_root_folder_id').limit(1).maybeSingle().then(({ data }) => {
      setDriveRootFolderId(data?.drive_root_folder_id ?? null)
    })
  }, [])
  const [creatingAccess, setCreatingAccess] = useState(false)
  const [credentialsOpen, setCredentialsOpen] = useState(false)
  const [generatedPassword, setGeneratedPassword] = useState('')

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

  const toggleArea = (area: string) => {
    setForm(f => ({
      ...f,
      areas_selected: f.areas_selected.includes(area)
        ? f.areas_selected.filter(a => a !== area)
        : [...f.areas_selected, area],
    }))
  }

  const docMask = form.type === 'pessoa_fisica' ? maskCPF : maskCNPJ
  const docPlaceholder = form.type === 'pessoa_fisica' ? '000.000.000-00' : '00.000.000/0000-00'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[800px] w-[96vw] max-h-[92vh] overflow-y-auto p-8">
        <DialogHeader>
          <DialogTitle className="text-lg">{isEditing ? 'Editar' : 'Novo'} Cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 pt-2">

          {/* ── Dados pessoais ── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Dados Pessoais</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
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

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label>{form.type === 'pessoa_fisica' ? 'CPF' : 'CNPJ'}</Label>
                <Input
                  value={form.cpf_cnpj}
                  onChange={e => setForm(f => ({ ...f, cpf_cnpj: docMask(e.target.value) }))}
                  placeholder={docPlaceholder}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: maskPhone(e.target.value) }))}
                  placeholder="(00) 00000-0000"
                  className="h-10"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Data de nascimento</Label>
                <Input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Gênero</Label>
                <Select value={form.gender} onValueChange={v => setForm(f => ({ ...f, gender: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GENDERS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Estado civil</Label>
                <Select value={form.marital_status} onValueChange={v => setForm(f => ({ ...f, marital_status: v }))}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MARITAL_STATUSES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Nacionalidade</Label>
                <Input value={form.nationality} onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Profissão</Label>
                <Input value={form.profession} onChange={e => setForm(f => ({ ...f, profession: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>RG</Label>
                <div className="flex gap-2">
                  <Input value={form.rg_number} onChange={e => setForm(f => ({ ...f, rg_number: e.target.value }))} placeholder="Número" className="h-10" />
                  <Input value={form.rg_issuer} onChange={e => setForm(f => ({ ...f, rg_issuer: e.target.value }))} placeholder="Órgão" className="h-10 w-24" />
                </div>
              </div>
            </div>
          </div>

          {/* ── Endereço ── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Endereço</p>
            <div className="grid grid-cols-[140px_1fr_100px] gap-4">
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label>Rua</Label>
                <Input value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} placeholder="Rua / Avenida" className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Nº</Label>
                <Input value={form.address_number} onChange={e => setForm(f => ({ ...f, address_number: e.target.value }))} className="h-10" />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input value={form.complement} onChange={e => setForm(f => ({ ...f, complement: e.target.value }))} placeholder="Apto, Sala..." className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Bairro</Label>
                <Input value={form.neighborhood} onChange={e => setForm(f => ({ ...f, neighborhood: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Select value={form.state} onValueChange={v => setForm(f => ({ ...f, state: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>
                    {STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── Jurídico / Comercial ── */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Jurídico / Comercial</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
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
              <div className="space-y-2">
                <Label>Origem</Label>
                <Select value={form.origin} onValueChange={v => setForm(f => ({ ...f, origin: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {ORIGINS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <Label>Áreas do Direito</Label>
              <div className="flex flex-wrap gap-2">
                {AREAS.map(area => (
                  <Badge
                    key={area}
                    variant={form.areas_selected.includes(area) ? 'default' : 'outline'}
                    className="cursor-pointer text-xs py-1 px-2.5"
                    onClick={() => toggleArea(area)}
                  >
                    {area}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label>Potencial financeiro (R$)</Label>
                <Input value={form.potential_value} onChange={e => setForm(f => ({ ...f, potential_value: e.target.value }))} placeholder="0,00" className="h-10" />
              </div>
              <div className="space-y-2">
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

            <div className="space-y-2 mt-4">
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

            <div className="space-y-2 mt-4">
              <Label>Tags (separadas por vírgula)</Label>
              <Input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="urgente, família" className="h-10" />
            </div>

            <div className="space-y-2 mt-4">
              <Label>Observações estratégicas</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>

          {/* ── Toggles ── */}
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch checked={form.portal_visible} onCheckedChange={v => setForm(f => ({ ...f, portal_visible: v }))} />
            <Label>Visível no portal do cliente</Label>
          </div>

          {isEditing && clientId && (
            <div className="rounded-xl border border-border/60 bg-muted/20 p-4 flex items-center gap-3">
              <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">Acesso ao portal</p>
                <p className="text-[11px] text-muted-foreground">
                  Cria o login do cliente na hora, com uma senha provisória que você pode copiar e enviar.
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={createPortalAccess} disabled={creatingAccess || !form.email} className="shrink-0">
                {creatingAccess ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5 mr-1.5" />}
                {creatingAccess ? 'Criando...' : 'Criar acesso'}
              </Button>
            </div>
          )}
        </div>

        {/* ── Credentials Dialog ── */}
        <Dialog open={credentialsOpen} onOpenChange={setCredentialsOpen}>
          <DialogContent className="max-w-[420px] w-[96vw] p-6">
            <DialogHeader><DialogTitle>Acesso criado!</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                Envie essas credenciais para {form.name.split(' ')[0]} (por WhatsApp, por exemplo). Recomende trocar a senha no primeiro acesso.
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

        <DialogFooter className="pt-4">
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
