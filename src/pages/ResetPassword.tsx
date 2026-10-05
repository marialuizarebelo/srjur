import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) { toast.error('A senha deve ter ao menos 6 caracteres'); return }
    if (password !== confirm) { toast.error('As senhas não coincidem'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) { toast.error('Erro ao redefinir senha: ' + error.message); return }
    toast.success('Senha redefinida com sucesso!')
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <div className="font-display text-[32px] text-foreground text-glow mb-1.5">Definir nova senha</div>
          <div className="text-sm text-muted-foreground">Escolha uma nova senha de acesso</div>
        </div>
        <form onSubmit={handleSubmit} className="bg-card rounded-3xl border border-[var(--glass-border)] p-8 shadow-[0_20px_50px_-30px_rgba(20,33,61,0.25)] dark:shadow-[0_20px_50px_-28px_rgba(0,0,0,0.6)] space-y-5">
          <div>
            <Label className="text-[11px] font-bold text-muted-foreground tracking-[0.1em] uppercase mb-1.5 block">Nova senha</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="h-[46px]" />
          </div>
          <div>
            <Label className="text-[11px] font-bold text-muted-foreground tracking-[0.1em] uppercase mb-1.5 block">Confirmar nova senha</Label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              className="h-[46px]" />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12 text-sm font-medium">
            {loading ? 'Salvando...' : 'Redefinir senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
