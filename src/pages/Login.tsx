import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'

export default function Login() {
  const { signIn } = useAuth()
  const [office, setOffice] = useState<{ name: string; logo_url: string | null }>({ name: 'SRJUR', logo_url: null })
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [forgotMode, setForgotMode] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  useEffect(() => {
    supabase.from('office_settings').select('name, logo_url').limit(1).maybeSingle().then(({ data }) => {
      if (data) setOffice({ name: data.name ?? 'SRJUR', logo_url: data.logo_url })
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error: err } = await signIn(email, password)
    if (err) setError('E-mail ou senha incorretos.')
    setLoading(false)
  }

  async function handleForgotSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotLoading(true)
    await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    setForgotLoading(false)
    // Sempre mostra a mesma confirmação, exista ou não o e-mail — evita
    // que alguém descubra quais e-mails têm cadastro no sistema.
    setForgotSent(true)
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#f4f1eb]">
      {/* Left panel */}
      <div className="relative overflow-hidden md:flex-[0_0_44%] bg-gradient-to-br from-[#0e1829] via-[#13243f] to-[#0e1829] px-8 py-10 md:px-14 md:py-13 flex flex-col justify-between">
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-80" viewBox="0 0 480 800" preserveAspectRatio="xMidYMid slice">
          <circle cx="420" cy="120" r="180" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          <circle cx="420" cy="120" r="120" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <circle cx="420" cy="120" r="60" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
          <circle cx="60" cy="700" r="200" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="1" />
          <line x1="0" y1="0" x2="480" y2="800" stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
        </svg>

        <div className="relative z-10">
          <div className="h-[50px] w-[50px] rounded-[10px] bg-white/10 border border-white/15 flex items-center justify-center text-white/90 font-medium text-[15px] tracking-wide shadow-lg mb-8 overflow-hidden">
            {office.logo_url ? <img src={office.logo_url} alt="" className="w-full h-full object-cover" /> : 'SR'}
          </div>
          <div className="font-semibold text-[32px] text-white tracking-tight leading-none mb-3">SRJUR</div>
          <div className="w-8 h-0.5 bg-white/25 mb-3.5" />
          <div className="text-xs font-light text-white/40 tracking-[2px] uppercase">{office.name}</div>
        </div>

        <div className="relative z-10 hidden md:block">
          <div className="text-lg font-light text-white/55 leading-relaxed mb-6">
            "Gestão jurídica com precisão, clareza e controle total."
          </div>
          <div className="flex flex-col gap-3">
            {['Processos e prazos centralizados', 'Financeiro e inadimplência em tempo real', 'Portal do cliente integrado'].map(p => (
              <div key={p} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-white/30 shrink-0" />
                <span className="text-[13px] text-white/45 font-light tracking-wide">{p}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-white/20 tracking-wide hidden md:block">SRJUR © 2026</div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-10 md:px-10">
        <div className="w-full max-w-[380px]">
          {!forgotMode ? (
            <>
              <div className="mb-8">
                <div className="font-semibold text-[28px] text-[#0e1829] tracking-tight mb-1.5">Bem-vindo de volta</div>
                <div className="text-sm text-[#8a8880] font-light">Acesse sua conta para continuar</div>
              </div>

              <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 shadow-[0_2px_8px_rgba(14,24,41,0.06),0_16px_40px_rgba(14,24,41,0.08)] space-y-5">
                <div>
                  <Label className="text-[11px] font-medium text-[#555] tracking-wide uppercase mb-1.5 block">E-mail</Label>
                  <Input
                    type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="seu@email.com.br"
                    className="h-[46px] bg-[#faf9f7] border-[#e8e4dc] rounded-[7px] focus-visible:ring-[#1a3a6b]/20 focus-visible:border-[#1a3a6b]"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-medium text-[#555] tracking-wide uppercase mb-1.5 block">Senha</Label>
                  <div className="relative">
                    <Input
                      type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
                      placeholder="••••••••"
                      className="h-[46px] bg-[#faf9f7] border-[#e8e4dc] rounded-[7px] pr-11 focus-visible:ring-[#1a3a6b]/20 focus-visible:border-[#1a3a6b]"
                    />
                    <button
                      type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#aaa] hover:text-[#555] transition-colors"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-right -mt-2">
                  <button
                    type="button"
                    onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotSent(false) }}
                    className="text-xs text-[#a0a09a] hover:text-[#1a3a6b] transition-colors"
                  >
                    Esqueceu a senha?
                  </button>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  type="submit" disabled={loading}
                  className="w-full h-12 bg-[#1a3a6b] hover:bg-[#0f2a52] rounded-[7px] text-sm font-medium tracking-wide shadow-[0_4px_14px_rgba(26,58,107,0.35)]"
                >
                  {loading ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-8">
                <div className="font-semibold text-[28px] text-[#0e1829] tracking-tight mb-1.5">Redefinir senha</div>
                <div className="text-sm text-[#8a8880] font-light">
                  {forgotSent ? 'Confira seu e-mail' : 'Informe seu e-mail de acesso'}
                </div>
              </div>

              <div className="bg-white rounded-xl p-8 shadow-[0_2px_8px_rgba(14,24,41,0.06),0_16px_40px_rgba(14,24,41,0.08)]">
                {forgotSent ? (
                  <div className="space-y-4">
                    <p className="text-sm text-[#0e1829]">
                      Se <strong>{forgotEmail}</strong> tiver uma conta no sistema, enviamos um link pra redefinir a senha. Verifica sua caixa de entrada (e o spam).
                    </p>
                    <Button variant="outline" className="w-full h-11 rounded-[7px]" onClick={() => setForgotMode(false)}>
                      Voltar ao login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotSubmit} className="space-y-5">
                    <div>
                      <Label className="text-[11px] font-medium text-[#555] tracking-wide uppercase mb-1.5 block">E-mail</Label>
                      <Input
                        type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required
                        placeholder="seu@email.com.br"
                        className="h-[46px] bg-[#faf9f7] border-[#e8e4dc] rounded-[7px] focus-visible:ring-[#1a3a6b]/20 focus-visible:border-[#1a3a6b]"
                      />
                    </div>
                    <Button type="submit" disabled={forgotLoading} className="w-full h-12 bg-[#1a3a6b] hover:bg-[#0f2a52] rounded-[7px] text-sm font-medium">
                      {forgotLoading ? 'Enviando...' : 'Enviar link de redefinição'}
                    </Button>
                    <button type="button" onClick={() => setForgotMode(false)} className="w-full text-center text-xs text-[#a0a09a] hover:text-[#1a3a6b] transition-colors">
                      Voltar ao login
                    </button>
                  </form>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
