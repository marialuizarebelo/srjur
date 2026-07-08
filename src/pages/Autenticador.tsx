import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { generateTOTP, secondsRemaining } from '@/lib/totp'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Plus, KeyRound, Copy, ExternalLink, Eye, EyeOff, Pencil, Trash2, ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'

interface System {
  id: string
  name: string
  url: string
  username: string | null
  password: string | null
  totp_secret: string | null
  notes: string | null
  color: string | null
}

const SYSTEM_COLORS = ['#6B7280','#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6']

const SUGGESTED = [
  { name: 'eProc Estadual (TJRS)', url: 'https://eproc1g.tjrs.jus.br' },
  { name: 'eProc Federal (JFRS)', url: 'https://eproc.jfrs.jus.br' },
  { name: 'PJe', url: 'https://pje.tjrs.jus.br' },
  { name: 'ESAJ', url: 'https://esaj.tjsp.jus.br' },
  { name: 'Projudi', url: 'https://projudi.tjrs.jus.br' },
]

function TOTPDisplay({ secret }: { secret: string }) {
  const [code, setCode] = useState('------')
  const [seconds, setSeconds] = useState(30)

  useEffect(() => {
    let active = true
    async function tick() {
      const c = await generateTOTP(secret)
      if (active) { setCode(c); setSeconds(secondsRemaining()) }
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => { active = false; clearInterval(interval) }
  }, [secret])

  const pct = (seconds / 30) * 100

  function copy() {
    navigator.clipboard.writeText(code)
    toast.success('Código copiado!')
  }

  return (
    <button onClick={copy} className="flex items-center gap-2.5 group" title="Copiar código">
      <div className="relative h-9 w-9 shrink-0">
        <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={`${(pct / 100) * 97.4} 97.4`}
            className={seconds <= 5 ? 'text-red-500' : 'text-primary'} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">{seconds}</span>
      </div>
      <div className="text-left">
        <p className="text-lg font-mono font-bold tracking-widest group-hover:text-primary transition-colors">
          {code.slice(0, 3)} {code.slice(3)}
        </p>
        <p className="text-[10px] text-muted-foreground">Toque para copiar</p>
      </div>
    </button>
  )
}

export default function Autenticador() {
  const [systems, setSystems] = useState<System[]>([])
  const [loading, setLoading] = useState(true)
  const [revealedPw, setRevealedPw] = useState<Record<string, boolean>>({})

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<System | null>(null)
  const [form, setForm] = useState({
    name: '', url: '', username: '', password: '', totp_secret: '', notes: '', color: SYSTEM_COLORS[0],
  })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('electronic_systems').select('*').order('created_at')
    setSystems((data as System[]) ?? [])
    setLoading(false)
  }

  function openNew(suggested?: { name: string; url: string }) {
    setEditing(null)
    setForm({ name: suggested?.name ?? '', url: suggested?.url ?? '', username: '', password: '', totp_secret: '', notes: '', color: SYSTEM_COLORS[0] })
    setDialogOpen(true)
  }
  function openEdit(s: System) {
    setEditing(s)
    setForm({ name: s.name, url: s.url, username: s.username ?? '', password: s.password ?? '',
      totp_secret: s.totp_secret ?? '', notes: s.notes ?? '', color: s.color ?? SYSTEM_COLORS[0] })
    setDialogOpen(true)
  }
  async function save() {
    const payload = {
      name: form.name, url: form.url, username: form.username || null, password: form.password || null,
      totp_secret: form.totp_secret.replace(/\s/g, '') || null, notes: form.notes || null, color: form.color,
    }
    if (editing) await supabase.from('electronic_systems').update(payload).eq('id', editing.id)
    else await supabase.from('electronic_systems').insert(payload)
    setDialogOpen(false)
    load()
  }
  async function remove(id: string) {
    if (!confirm('Remover este sistema?')) return
    await supabase.from('electronic_systems').delete().eq('id', id)
    load()
  }

  function copyText(text: string, label: string) {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado!`)
  }

  const notYetAdded = SUGGESTED.filter(s => !systems.some(sys => sys.name === s.name))

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Autenticador</h1>
          <p className="text-sm text-muted-foreground">Acessos compartilhados aos sistemas eletrônicos, com 2FA embutido</p>
        </div>
        <Button size="sm" onClick={() => openNew()} className="rounded-xl">
          <Plus className="h-3.5 w-3.5 mr-1.5" />Novo sistema
        </Button>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-900 p-4 flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 text-violet-600 shrink-0 mt-0.5" />
        <p className="text-xs text-violet-700 dark:text-violet-400">
          Os códigos de verificação (2FA) são gerados localmente no navegador a partir da chave secreta cadastrada — funciona como um Google Authenticator embutido, compartilhado entre as advogadas do escritório.
        </p>
      </div>

      <div className="space-y-3">
        {systems.map(s => (
          <div key={s.id} className="rounded-2xl border border-border/60 bg-card shadow-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${s.color}1A` }}>
                  <KeyRound className="h-4 w-4" style={{ color: s.color ?? '#8B5CF6' }} />
                </div>
                <div>
                  <p className="text-sm font-semibold">{s.name}</p>
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                    {s.url} <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(s)} className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => remove(s.id)} className="h-7 w-7 rounded-lg hover:bg-muted flex items-center justify-center">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border/40">
              {/* Credentials */}
              <div className="space-y-2">
                {s.username && (
                  <button onClick={() => copyText(s.username!, 'Usuário')}
                    className="w-full flex items-center justify-between text-left rounded-lg bg-muted/30 px-3 py-2 hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Usuário</p>
                      <p className="text-xs font-medium">{s.username}</p>
                    </div>
                    <Copy className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
                {s.password && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                    <div>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Senha</p>
                      <p className="text-xs font-medium font-mono">
                        {revealedPw[s.id] ? s.password : '•'.repeat(Math.min(s.password.length, 10))}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setRevealedPw(p => ({ ...p, [s.id]: !p[s.id] }))} className="p-1 hover:bg-muted rounded">
                        {revealedPw[s.id] ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : <Eye className="h-3 w-3 text-muted-foreground" />}
                      </button>
                      <button onClick={() => copyText(s.password!, 'Senha')} className="p-1 hover:bg-muted rounded">
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                )}
                {!s.username && !s.password && (
                  <p className="text-xs text-muted-foreground py-2">Nenhuma credencial salva</p>
                )}
              </div>

              {/* TOTP */}
              <div className="flex items-center justify-center rounded-lg bg-muted/30 px-3 py-2">
                {s.totp_secret ? (
                  <TOTPDisplay secret={s.totp_secret} />
                ) : (
                  <p className="text-xs text-muted-foreground">Sem 2FA configurado</p>
                )}
              </div>
            </div>

            {s.notes && <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/40">{s.notes}</p>}
          </div>
        ))}

        {systems.length === 0 && !loading && (
          <div className="py-12 text-center text-muted-foreground">
            <KeyRound className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum sistema cadastrado ainda</p>
          </div>
        )}
      </div>

      {notYetAdded.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">Adicionar rapidamente</p>
          <div className="flex flex-wrap gap-2">
            {notYetAdded.map(s => (
              <button key={s.name} onClick={() => openNew(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-border/60 text-muted-foreground hover:border-primary hover:text-primary transition-colors">
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[520px] w-[96vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader><DialogTitle>{editing ? 'Editar' : 'Novo'} sistema</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Nome do sistema</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-10" placeholder="Ex: eProc Estadual" />
            </div>
            <div className="space-y-1.5">
              <Label>URL</Label>
              <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} className="h-10" placeholder="https://..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Usuário</Label>
                <Input value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <Input value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Chave secreta 2FA (TOTP)</Label>
              <Input value={form.totp_secret} onChange={e => setForm(f => ({ ...f, totp_secret: e.target.value }))}
                className="h-10 font-mono" placeholder="Ex: JBSWY3DPEHPK3PXP" />
              <div className="text-[11px] text-muted-foreground bg-muted/40 rounded-lg p-3 space-y-1.5 mt-1">
                <p className="font-medium text-foreground">Como pegar essa chave no site do tribunal:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>No site do tribunal, vá em Segurança / Autenticação em duas etapas e escolha ativar o 2FA.</li>
                  <li>Quando aparecer o QR code, procure a opção "Não consigo ler o QR code" ou "Configurar manualmente".</li>
                  <li>O site vai mostrar um código de texto (algo como <span className="font-mono">JBSWY3DPEHPK3PXP</span>) — copie ele.</li>
                  <li>Cole esse código aqui no campo acima e salve.</li>
                  <li>Depois de salvo, este sistema já gera o código de 6 dígitos sozinho — é só copiar o número que aparecer aqui na hora de logar no tribunal.</li>
                </ol>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cor</Label>
              <div className="flex gap-1.5">
                {SYSTEM_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))}
                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${form.color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter className="pt-4">
            {editing && <Button variant="destructive" className="mr-auto" onClick={() => { remove(editing.id); setDialogOpen(false) }}>Excluir</Button>}
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={save} disabled={!form.name || !form.url}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
