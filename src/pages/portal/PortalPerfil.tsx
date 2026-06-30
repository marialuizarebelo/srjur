import { useState } from 'react'
import { useClient } from '@/contexts/ClientContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImageUploadCrop } from '@/components/ImageUploadCrop'
import {
  Mail, Phone, IdCard, KeyRound, Eye, EyeOff, Pencil, MapPin, Briefcase,
} from 'lucide-react'
import { toast } from 'sonner'

function maskPhone(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15)
}
function maskCEP(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 9)
}

export default function PortalPerfil() {
  const { client, refresh } = useClient()
  const { profile, refreshProfile } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [changing, setChanging] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [savingInfo, setSavingInfo] = useState(false)
  const [ef, setEf] = useState({
    phone: '', cep: '', street: '', address_number: '', complement: '',
    neighborhood: '', city: '', state: '', profession: '',
  })

  function openEdit() {
    setEf({
      phone: client?.phone ?? '', cep: client?.cep ?? '', street: client?.street ?? '',
      address_number: client?.address_number ?? '', complement: client?.complement ?? '',
      neighborhood: client?.neighborhood ?? '', city: client?.city ?? '', state: client?.state ?? '',
      profession: client?.profession ?? '',
    })
    setEditOpen(true)
  }

  async function saveInfo() {
    setSavingInfo(true)
    const { error } = await supabase.rpc('update_my_client_info', { updates: ef })
    setSavingInfo(false)
    if (error) { toast.error('Erro ao salvar: ' + error.message); return }
    toast.success('Dados atualizados! O escritório foi notificado.')
    setEditOpen(false)
    refresh()
  }

  async function uploadAvatar(url: string) {
    const { error } = await supabase.rpc('update_my_avatar', { new_photo_url: url })
    if (error) { toast.error('Erro ao salvar foto'); return }
    await refreshProfile()
    toast.success('Foto atualizada!')
  }

  async function changePassword() {
    if (newPassword.length < 6) { toast.error('A senha deve ter ao menos 6 caracteres'); return }
    if (newPassword !== confirmPassword) { toast.error('As senhas não coincidem'); return }
    setChanging(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChanging(false)
    if (error) { toast.error('Erro ao alterar senha'); return }
    toast.success('Senha alterada com sucesso!')
    setNewPassword(''); setConfirmPassword('')
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meu Perfil</h1>
        <p className="text-sm text-muted-foreground">Seus dados cadastrais</p>
      </div>

      {/* Avatar + nome */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-4">
        <ImageUploadCrop
          value={profile?.photo_url ?? null}
          onChange={uploadAvatar}
          bucket="avatars"
          shape="circle"
          size={72}
          label={client?.name ?? profile?.display_name ?? 'Foto de perfil'}
        />
      </div>

      {/* Dados de contato */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-1">
        <div className="flex items-center justify-between pb-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Dados de contato</p>
          <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={openEdit}>
            <Pencil className="h-3 w-3 mr-1" />Editar
          </Button>
        </div>

        {[
          { icon: Mail, label: 'E-mail (não editável)', value: client?.email },
          { icon: Phone, label: 'Telefone', value: client?.phone },
          { icon: IdCard, label: 'CPF/CNPJ (não editável)', value: client?.cpf_cnpj },
          { icon: Briefcase, label: 'Profissão', value: client?.profession },
          { icon: MapPin, label: 'Endereço', value: client ? [client.street, client.address_number, client.neighborhood, client.city, client.state].filter(Boolean).join(', ') : '' },
        ].map((f, i) => {
          const Icon = f.icon
          return (
            <div key={i} className="flex items-center gap-3 py-2.5 border-t border-border/40 first:border-t-0">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{f.label}</p>
                <p className="text-sm truncate">{f.value || '—'}</p>
              </div>
            </div>
          )
        })}
        <p className="text-[11px] text-muted-foreground pt-3">
          E-mail e CPF/CNPJ são usados para acesso e identificação — para alterá-los, fale com o escritório.
        </p>
      </div>

      {/* Edição de contato — inline (sem dialog pesado) */}
      {editOpen && (
        <div className="rounded-2xl border border-primary/40 bg-card shadow-sm p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Editar dados de contato</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={ef.phone} onChange={e => setEf(f => ({ ...f, phone: maskPhone(e.target.value) }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Profissão</Label>
              <Input value={ef.profession} onChange={e => setEf(f => ({ ...f, profession: e.target.value }))} className="h-10" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input value={ef.cep} onChange={e => setEf(f => ({ ...f, cep: maskCEP(e.target.value) }))} className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Rua</Label>
              <Input value={ef.street} onChange={e => setEf(f => ({ ...f, street: e.target.value }))} className="h-10" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input value={ef.address_number} onChange={e => setEf(f => ({ ...f, address_number: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Complemento</Label>
              <Input value={ef.complement} onChange={e => setEf(f => ({ ...f, complement: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input value={ef.neighborhood} onChange={e => setEf(f => ({ ...f, neighborhood: e.target.value }))} className="h-10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input value={ef.city} onChange={e => setEf(f => ({ ...f, city: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Input value={ef.state} onChange={e => setEf(f => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))} className="h-10" />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={saveInfo} disabled={savingInfo}>{savingInfo ? 'Salvando...' : 'Salvar alterações'}</Button>
          </div>
        </div>
      )}

      {/* Segurança */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5" />Alterar senha
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
        <Button onClick={changePassword} disabled={changing || !newPassword} className="rounded-xl">Alterar senha</Button>
      </div>
    </div>
  )
}
