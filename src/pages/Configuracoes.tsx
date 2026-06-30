import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  Building2, Users, Shield, Palette, Plus, Pencil, Trash2,
  Save, Eye, EyeOff, Link2, KeyRound, CalendarDays, Unlink, Bell, BellOff, BellRing,
} from 'lucide-react'
import { toast } from 'sonner'
import { ImageUploadCrop } from '@/components/ImageUploadCrop'
import { connectGoogle, disconnectGoogle } from '@/lib/googleCalendar'
import { DriveFolderPicker } from '@/components/DriveFolderPicker'
import { subscribeToPush, getNotificationStatus } from '@/hooks/usePushNotifications'

// ── Types ─────────────────────────────────────────────────────────────────
interface OfficeSettings {
  id: string
  name: string
  logo_url: string | null
  whatsapp_url: string | null
}

interface ProfileRow {
  id: string
  user_id: string
  display_name: string | null
  full_name: string | null
  nickname: string | null
  role: 'admin' | 'client'
  role_title: string | null
  photo_url: string | null
  color: string | null
}

const USER_COLORS = ['#EC4899', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#14B8A6', '#6366F1']

const TABS = [
  { key: 'escritorio', label: 'Escritório', icon: Building2 },
  { key: 'usuarios', label: 'Usuários', icon: Users },
  { key: 'seguranca', label: 'Segurança', icon: Shield },
  { key: 'aparencia', label: 'Preferências', icon: Palette },
] as const

export default function Configuracoes() {
  const { profile, user, session, refreshProfile } = useAuth()
  const [tab, setTab] = useState<typeof TABS[number]['key']>('escritorio')
  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'default' | 'unsupported'>('default')
  const [enablingNotif, setEnablingNotif] = useState(false)

  useEffect(() => {
    getNotificationStatus().then(setNotifStatus)
  }, [])

  async function handleEnableNotif() {
    if (!session?.user?.id) return
    setEnablingNotif(true)
    const result = await subscribeToPush(session.user.id)
    setNotifStatus(result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'default')
    if (result === 'granted') toast.success('Notificações ativadas!')
    else if (result === 'denied') toast.error('Permissão negada. Habilite nas configurações do navegador/celular.')
    else toast.error('Não foi possível ativar as notificações.')
    setEnablingNotif(false)
  }

  // Office
  const [office, setOffice] = useState<OfficeSettings | null>(null)
  const [officeForm, setOfficeForm] = useState({ name: '', logo_url: '', whatsapp_url: '', drive_root_folder_id: '', drive_root_folder_name: '' })
  const [savingOffice, setSavingOffice] = useState(false)

  // Users
  const [users, setUsers] = useState<ProfileRow[]>([])
  const [userDialogOpen, setUserDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<ProfileRow | null>(null)
  const [uf, setUf] = useState({ display_name: '', full_name: '', nickname: '', role_title: '', color: USER_COLORS[0], role: 'admin' as 'admin' | 'client', photo_url: '' })

  // Security
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [changingPw, setChangingPw] = useState(false)

  // Google Calendar
  const [googleConns, setGoogleConns] = useState<Record<string, { google_email: string | null; last_synced_at: string | null }>>({})
  const [connectingKey, setConnectingKey] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    const params = new URLSearchParams(window.location.search)
    if (params.get('google') === 'connected') {
      toast.success('Google Agenda conectada!')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  async function loadData() {
    const [{ data: os }, { data: us }, { data: gc }] = await Promise.all([
      supabase.from('office_settings').select('*').limit(1).maybeSingle(),
      supabase.from('profiles').select('*').order('created_at'),
      supabase.from('google_calendar_connections').select('*'),
    ])
    if (os) {
      setOffice(os as OfficeSettings)
      setOfficeForm({
        name: os.name ?? '', logo_url: os.logo_url ?? '', whatsapp_url: os.whatsapp_url ?? '',
        drive_root_folder_id: os.drive_root_folder_id ?? '', drive_root_folder_name: os.drive_root_folder_name ?? '',
      })
    }
    setUsers((us as ProfileRow[]) ?? [])
    const connMap: Record<string, any> = {}
    for (const c of gc ?? []) {
      const key = c.owner_type === 'office' ? 'office' : `user:${c.profile_id}`
      connMap[key] = c
    }
    setGoogleConns(connMap)
  }

  async function handleConnectGoogle(ownerType: 'user' | 'office', profileId: string | null) {
    const key = ownerType === 'office' ? 'office' : `user:${profileId}`
    setConnectingKey(key)
    try {
      await connectGoogle(ownerType, profileId)
    } catch (e: any) {
      toast.error(e.message)
      setConnectingKey(null)
    }
  }

  async function handleDisconnectGoogle(ownerType: 'user' | 'office', profileId: string | null) {
    if (!confirm('Desconectar essa agenda do Google?')) return
    try {
      await disconnectGoogle(ownerType, profileId)
      toast.success('Desconectado')
      loadData()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  async function saveOffice() {
    setSavingOffice(true)
    if (office) {
      await supabase.from('office_settings').update(officeForm).eq('id', office.id)
    } else {
      await supabase.from('office_settings').insert(officeForm)
    }
    toast.success('Dados do escritório salvos!')
    setSavingOffice(false)
    loadData()
    window.dispatchEvent(new Event('office-settings-updated'))
  }

  function openEditUser(u: ProfileRow) {
    setEditingUser(u)
    setUf({ display_name: u.display_name ?? '', full_name: u.full_name ?? '', nickname: u.nickname ?? '', role_title: u.role_title ?? '', color: u.color ?? USER_COLORS[0], role: u.role, photo_url: u.photo_url ?? '' })
    setUserDialogOpen(true)
  }

  async function saveUser() {
    if (!editingUser) return
    await supabase.from('profiles').update({
      display_name: uf.display_name, full_name: uf.full_name || null, nickname: uf.nickname || null, role_title: uf.role_title || null, color: uf.color, role: uf.role,
      photo_url: uf.photo_url || null,
    }).eq('id', editingUser.id)
    setUserDialogOpen(false)
    toast.success('Usuário atualizado!')
    loadData()
    await refreshProfile()
  }

  async function changePassword() {
    if (newPassword.length < 6) { toast.error('A senha deve ter ao menos 6 caracteres'); return }
    if (newPassword !== confirmPassword) { toast.error('As senhas não coincidem'); return }
    setChangingPw(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPw(false)
    if (error) { toast.error('Erro ao alterar senha: ' + error.message); return }
    toast.success('Senha alterada com sucesso!')
    setNewPassword(''); setConfirmPassword('')
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">Dados do escritório, usuários e segurança</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted rounded-xl p-1 overflow-x-auto w-full md:w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="h-3.5 w-3.5" />{t.label}
            </button>
          )
        })}
      </div>

      {/* ── Escritório ── */}
      {tab === 'escritorio' && (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Dados do escritório</p>

          <div className="space-y-1.5">
            <Label>Nome do escritório</Label>
            <Input value={officeForm.name} onChange={e => setOfficeForm(f => ({ ...f, name: e.target.value }))} className="h-10" />
          </div>

          <ImageUploadCrop
            value={officeForm.logo_url || null}
            onChange={url => setOfficeForm(f => ({ ...f, logo_url: url }))}
            bucket="logos"
            shape="square"
            size={88}
            label="Logo do escritório"
          />

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />Link do chat (WhatsApp Web)</Label>
            <Input value={officeForm.whatsapp_url} onChange={e => setOfficeForm(f => ({ ...f, whatsapp_url: e.target.value }))}
              placeholder="https://web.whatsapp.com/" className="h-10" />
            <p className="text-[11px] text-muted-foreground">
              URL aberta ao clicar em "Abrir chat" nos cards de lead/cliente. Se vazio, usa o WhatsApp do cliente diretamente.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Pasta raiz de Clientes</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Selecione a pasta "02. CLIENTES" (ou equivalente) do seu Drive. Pastas de clientes novos nascem dentro dela; pastas de processo nascem dentro da pasta do respectivo cliente, numeradas automaticamente. Precisa conectar a Google Agenda do escritório primeiro (abaixo).
            </p>
            {officeForm.drive_root_folder_name && (
              <p className="text-[11px] text-muted-foreground">Selecionada: <strong className="text-foreground">{officeForm.drive_root_folder_name}</strong></p>
            )}
            <DriveFolderPicker
              value={{ folder_id: officeForm.drive_root_folder_id, drive_url: officeForm.drive_root_folder_id ? `https://drive.google.com/drive/folders/${officeForm.drive_root_folder_id}` : '' }}
              onChange={f => setOfficeForm(prev => ({ ...prev, drive_root_folder_id: f.folder_id, drive_root_folder_name: f.name ?? '' }))}
              folderNameSuggestion="02. CLIENTES"
            />
          </div>

          <Button onClick={saveOffice} disabled={savingOffice} className="rounded-xl">
            <Save className="h-3.5 w-3.5 mr-1.5" />Salvar
          </Button>

          <div className="pt-2 border-t border-border/40 space-y-3">
            <Label className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />Google Agenda do escritório</Label>
            <p className="text-[11px] text-muted-foreground -mt-2">
              Usada para compromissos vinculados a clientes (audiências, reuniões, prazos com cliente associado).
            </p>
            {googleConns.office ? (
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 px-4 py-3">
                <div>
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">Conectado</p>
                  <p className="text-[11px] text-emerald-600/80">{googleConns.office.google_email}</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => handleDisconnectGoogle('office', null)}>
                  <Unlink className="h-3 w-3 mr-1" />Desconectar
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="rounded-xl" disabled={connectingKey === 'office'}
                onClick={() => handleConnectGoogle('office', null)}>
                <CalendarDays className="h-3.5 w-3.5 mr-1.5" />
                {connectingKey === 'office' ? 'Abrindo Google...' : 'Conectar Google Agenda'}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Usuários ── */}
      {tab === 'usuarios' && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Novos usuários são criados diretamente no painel do Supabase (Authentication → Users). Aqui você edita nome, cargo e cor de exibição de quem já tem acesso.
            </p>
          </div>

          {users.map(u => {
            const connKey = `user:${u.id}`
            const conn = googleConns[connKey]
            return (
              <div key={u.id} className="rounded-2xl border border-border/60 bg-card shadow-sm p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 overflow-hidden"
                    style={{ backgroundColor: u.color ?? '#8B5CF6' }}>
                    {u.photo_url ? <img src={u.photo_url} alt="" className="w-full h-full object-cover" /> : (u.display_name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {u.display_name ?? 'Sem nome'}
                      {u.user_id === user?.id && <span className="text-[10px] text-muted-foreground ml-2">(você)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.role_title ?? (u.role === 'admin' ? 'Administradora' : 'Cliente')}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    u.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {u.role === 'admin' ? 'Admin' : 'Cliente'}
                  </span>
                  <button onClick={() => openEditUser(u)} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center">
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>

                {u.role === 'admin' && (
                  <div className="flex items-center justify-between pl-14">
                    {conn ? (
                      <div className="flex items-center gap-2 text-[11px] text-emerald-600">
                        <CalendarDays className="h-3 w-3" />Google Agenda: {conn.google_email}
                        <button onClick={() => handleDisconnectGoogle('user', u.id)} className="text-muted-foreground hover:text-red-500 ml-1">
                          <Unlink className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => handleConnectGoogle('user', u.id)} disabled={connectingKey === connKey}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors">
                        <CalendarDays className="h-3 w-3" />
                        {connectingKey === connKey ? 'Abrindo Google...' : 'Conectar Google Agenda pessoal'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {users.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário encontrado</p>}
        </div>
      )}

      {/* ── Segurança ── */}
      {tab === 'seguranca' && (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-5">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />Alterar minha senha
          </p>

          <div className="space-y-1.5">
            <Label>Nova senha</Label>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="h-10 pr-10" placeholder="Mínimo 6 caracteres" />
              <button type="button" onClick={() => setShowPw(s => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Confirmar nova senha</Label>
            <Input type={showPw ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="h-10" />
          </div>

          <Button onClick={changePassword} disabled={changingPw || !newPassword} className="rounded-xl">
            <Shield className="h-3.5 w-3.5 mr-1.5" />Alterar senha
          </Button>

          <div className="pt-4 border-t border-border/40 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Sobre a segurança do sistema</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
              <li>Apenas usuárias autenticadas com login válido acessam o painel administrativo</li>
              <li>Clientes só enxergam dados marcados como "visível no portal" do próprio cadastro</li>
              <li>Todas as regras de acesso são aplicadas no banco de dados (Row Level Security), não apenas na tela</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Aparência ── */}
      {tab === 'aparencia' && (
        <div className="space-y-4">
          {/* Tema */}
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Tema</p>
            <p className="text-sm text-muted-foreground">
              O tema claro/escuro pode ser alterado a qualquer momento pelo ícone no topo da tela.
            </p>
          </div>

          {/* Notificações */}
          <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Notificações push</p>

            {notifStatus === 'unsupported' && (
              <div className="flex items-start gap-3">
                <BellOff className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Não suportado</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Este dispositivo ou navegador não suporta notificações push. Use o app instalado na tela inicial.</p>
                </div>
              </div>
            )}

            {notifStatus === 'granted' && (
              <div className="flex items-start gap-3">
                <BellRing className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-green-600">Notificações ativas</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Você receberá avisos de compromissos com horário e pagamentos recebidos.</p>
                </div>
              </div>
            )}

            {notifStatus === 'denied' && (
              <div className="flex items-start gap-3">
                <BellOff className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-600">Permissão negada</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Para ativar, vá nas configurações do celular → Aplicativos → Navegador → Notificações e permita para app.srjur.com.</p>
                </div>
              </div>
            )}

            {(notifStatus === 'default') && (
              <div className="flex items-start gap-3">
                <Bell className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Notificações desativadas</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">Ative para receber lembretes de compromissos e avisos de pagamentos recebidos.</p>
                  <Button size="sm" onClick={handleEnableNotif} disabled={enablingNotif} className="rounded-xl">
                    <Bell className="h-3.5 w-3.5 mr-2" />
                    {enablingNotif ? 'Ativando...' : 'Ativar notificações'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── User Edit Dialog ── */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="max-w-[440px] w-[96vw] p-6">
          <DialogHeader><DialogTitle>Editar usuário</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <ImageUploadCrop
              value={uf.photo_url || null}
              onChange={url => setUf(f => ({ ...f, photo_url: url }))}
              bucket="avatars"
              shape="circle"
              size={80}
              label="Foto de perfil"
            />
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input value={uf.full_name} onChange={e => setUf(f => ({ ...f, full_name: e.target.value }))} placeholder="Ex: Maria Luiza Rebelo" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Apelido (como gosta de ser chamada)</Label>
              <Input value={uf.nickname} onChange={e => setUf(f => ({ ...f, nickname: e.target.value }))} placeholder="Ex: Maria, Malu..." className="h-10" />
              <p className="text-[11px] text-muted-foreground">Usado no "Olá," do painel</p>
            </div>
            <div className="space-y-1.5">
              <Label>Nome de exibição (sidebar/avatares)</Label>
              <Input value={uf.display_name} onChange={e => setUf(f => ({ ...f, display_name: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Cargo</Label>
              <Input value={uf.role_title} onChange={e => setUf(f => ({ ...f, role_title: e.target.value }))}
                placeholder="Ex: Advogada, Sócia-fundadora..." className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Perfil de acesso</Label>
              <Select value={uf.role} onValueChange={v => setUf(f => ({ ...f, role: v as 'admin' | 'client' }))}>
                <SelectTrigger className="h-10"><SelectValue>{uf.role === 'admin' ? 'Administradora' : 'Cliente'}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Administradora</SelectItem>
                  <SelectItem value="client">Cliente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap gap-2">
                {USER_COLORS.map(c => (
                  <button key={c} onClick={() => setUf(f => ({ ...f, color: c }))}
                    className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${uf.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={saveUser}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
