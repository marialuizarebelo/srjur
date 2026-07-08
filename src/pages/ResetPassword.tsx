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
    <div className="min-h-screen flex items-center justify-center bg-[#f4f1eb] px-6">
      <div className="w-full max-w-[380px]">
        <div className="mb-8">
          <div className="font-semibold text-[28px] text-[#0e1829] tracking-tight mb-1.5">Definir nova senha</div>
          <div className="text-sm text-[#8a8880] font-light">Escolha uma nova senha de acesso</div>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 shadow-[0_2px_8px_rgba(14,24,41,0.06),0_16px_40px_rgba(14,24,41,0.08)] space-y-5">
          <div>
            <Label className="text-[11px] font-medium text-[#555] tracking-wide uppercase mb-1.5 block">Nova senha</Label>
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="h-[46px] bg-[#faf9f7] border-[#e8e4dc] rounded-[7px]" />
          </div>
          <div>
            <Label className="text-[11px] font-medium text-[#555] tracking-wide uppercase mb-1.5 block">Confirmar nova senha</Label>
            <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
              className="h-[46px] bg-[#faf9f7] border-[#e8e4dc] rounded-[7px]" />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12 bg-[#1a3a6b] hover:bg-[#0f2a52] rounded-[7px] text-sm font-medium">
            {loading ? 'Salvando...' : 'Redefinir senha'}
          </Button>
        </form>
      </div>
    </div>
  )
}
