import { useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

// Cadastro rápido de cliente, para usar de dentro de outras telas (ex.: Parcerias) sem sair delas.
// O cadastro completo continua em Clientes; aqui entra só o essencial.
export function QuickClientDialog({ open, onClose, onCreated }: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { profile } = useAuth()
  const [name, setName] = useState('')
  const [type, setType] = useState<'pessoa_fisica' | 'pessoa_juridica'>('pessoa_fisica')
  const [doc, setDoc] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const reset = () => { setName(''); setType('pessoa_fisica'); setDoc(''); setPhone(''); setEmail('') }

  async function save() {
    if (saving) return
    if (!name.trim()) { toast.error('Informe o nome do cliente'); return }
    setSaving(true)
    const { data, error } = await supabase.from('clients').insert({
      name: name.trim(), type, status: 'ativo',
      cpf_cnpj: doc.trim() || null, phone: phone.trim() || null, email: email.trim().toLowerCase() || null,
      created_by: profile?.id ?? null,
    }).select('id').single()
    setSaving(false)
    if (error || !data) { toast.error('Erro ao cadastrar o cliente: ' + (error?.message ?? '')); return }
    toast.success('Cliente cadastrado')
    reset()
    onCreated(data.id)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) { reset(); onClose() } }}>
      <DialogContent className="max-w-[460px] w-[96vw]">
        <DialogHeader><DialogTitle>Novo cliente</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} className="h-10" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <div className="inline-flex rounded-lg border p-0.5 bg-muted/40">
              {([['pessoa_fisica', 'Pessoa física'], ['pessoa_juridica', 'Pessoa jurídica']] as const).map(([k, label]) => (
                <button key={k} type="button" onClick={() => setType(k)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${type === k ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{type === 'pessoa_juridica' ? 'CNPJ' : 'CPF'} (opcional)</Label>
            <Input value={doc} onChange={e => setDoc(e.target.value)} className="h-10" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Telefone (opcional)</Label><Input value={phone} onChange={e => setPhone(e.target.value)} className="h-10" /></div>
            <div className="space-y-1.5"><Label>E-mail (opcional)</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-10" /></div>
          </div>
          <p className="text-[11px] text-muted-foreground">O cadastro completo pode ser feito depois, na tela de Clientes.</p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { reset(); onClose() }}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Cadastrar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
