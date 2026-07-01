import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { searchDjen, stripHtml, type DjenItem } from '@/lib/djen'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  RefreshCw, Plus, Scale, ExternalLink, Trash2, X, CheckCircle2,
  AlertCircle, Settings2, Link2, EyeOff, Loader2, ChevronDown, ChevronUp,
  Check, Circle, FilePlus2, Info,
} from 'lucide-react'
import { toast } from 'sonner'
import { fmtDate } from '@/lib/format'

interface OabConfig { id: string; nome: string; numero_oab: string; uf_oab: string; ativo: boolean }
interface ProcessOption { id: string; title: string; number: string | null }

interface Intimacao {
  id: string
  djen_id: number
  numero_processo: string | null
  numero_processo_mascara: string | null
  tribunal: string | null
  orgao: string | null
  tipo_comunicacao: string | null
  texto: string | null
  data_disponibilizacao: string | null
  link: string | null
  advogado_nome: string | null
  advogado_oab: string | null
  advogado_uf: string | null
  process_id: string | null
  deadline_id: string | null
  status: string
  lida: boolean
}

interface ClientOption { id: string; name: string }

const UFS = ['RS','SC','PR','SP','RJ','MG','ES','BA','PE','CE','DF','GO','MT','MS','PA','AM','MA','PB','RN','AL','SE','PI','TO','RO','RR','AP','AC']

const AREAS = ['Cível', 'Trabalhista', 'Criminal', 'Previdenciário', 'Família e Sucessões', 'Empresarial', 'Consumidor', 'Administrativo', 'Tributário', 'Imobiliário']

const SISTEMA_POR_TRIBUNAL: Record<string, string> = {
  TJRS: 'eProc Estadual',
  TRF4: 'eProc Federal',
  TJSP: 'ESAJ',
}

function IntimacaoTexto({ texto }: { texto: string | null }) {
  const [expanded, setExpanded] = useState(false)
  const clean = stripHtml(texto)
  const isLong = clean.length > 280

  return (
    <div className="bg-muted/30 rounded-xl px-3 py-2.5 cursor-pointer" onClick={() => isLong && setExpanded(e => !e)}>
      <p className={`text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap ${!expanded && isLong ? 'line-clamp-4' : ''}`}>
        {clean || 'Sem detalhes do conteúdo da publicação — consulte os autos digitais.'}
      </p>
      {isLong && (
        <button className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1.5 hover:text-foreground transition-colors">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? 'Recolher' : 'Ver completo'}
        </button>
      )}
    </div>
  )
}

export default function SistemasEletronicos() {
  const [configs, setConfigs] = useState<OabConfig[]>([])
  const [intimacoes, setIntimacoes] = useState<Intimacao[]>([])
  const [processes, setProcesses] = useState<ProcessOption[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSyncLabel, setLastSyncLabel] = useState<string | null>(() => {
    const last = localStorage.getItem('djen_last_sync')
    return last ? new Date(Number(last)).toLocaleString('pt-BR') : null
  })
  const [readFilter, setReadFilter] = useState<'nao_lidas' | 'lidas' | 'ignoradas' | 'todas'>('nao_lidas')

  const [configOpen, setConfigOpen] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newOab, setNewOab] = useState('')
  const [newUf, setNewUf] = useState('RS')

  const [linkOpen, setLinkOpen] = useState(false)
  const [linking, setLinking] = useState<Intimacao | null>(null)
  const [linkProcessId, setLinkProcessId] = useState('')

  const [prazoOpen, setPrazoOpen] = useState(false)
  const [prazoSource, setPrazoSource] = useState<Intimacao | null>(null)
  const [prazoTitulo, setPrazoTitulo] = useState('')
  const [prazoData, setPrazoData] = useState('')
  const [prazoDias, setPrazoDias] = useState('15')

  const [processoOpen, setProcessoOpen] = useState(false)
  const [processoSource, setProcessoSource] = useState<Intimacao | null>(null)
  const [npf, setNpf] = useState({
    client_id: '', number: '', title: '', area: '', court: '', electronic_system: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: oc }, { data: it }, { data: pr }, { data: cl }] = await Promise.all([
      supabase.from('oab_config').select('*').order('created_at'),
      supabase.from('intimacoes').select('*').order('data_disponibilizacao', { ascending: false }),
      supabase.from('processes').select('id,title,number'),
      supabase.from('clients').select('id,name').order('name'),
    ])
    setConfigs((oc as OabConfig[]) ?? [])
    setIntimacoes((it as Intimacao[]) ?? [])
    setProcesses((pr as ProcessOption[]) ?? [])
    setClients((cl as ClientOption[]) ?? [])
    setLoading(false)
    return (oc as OabConfig[]) ?? []
  }

  async function toggleLida(i: Intimacao) {
    await supabase.from('intimacoes').update({ lida: !i.lida }).eq('id', i.id)
    loadData()
  }

  async function addConfig() {
    if (!newNome.trim() || !newOab.trim()) return
    await supabase.from('oab_config').insert({ nome: newNome, numero_oab: newOab.replace(/\D/g,''), uf_oab: newUf })
    setNewNome(''); setNewOab(''); setNewUf('RS')
    loadData()
  }
  async function removeConfig(id: string) {
    if (!confirm('Remover esta OAB do monitoramento?')) return
    await supabase.from('oab_config').delete().eq('id', id)
    loadData()
  }

  async function syncAll(silent = false, configsOverride?: OabConfig[]) {
    const list = configsOverride ?? configs
    if (list.length === 0) { if (!silent) toast.error('Cadastre ao menos uma OAB para sincronizar'); return }
    setSyncing(true)
    let totalNew = 0
    try {
      for (const c of list.filter(c => c.ativo)) {
        // Busca o histórico completo (sem filtro de data) — a API pagina
        // automaticamente até esgotar os resultados dessa OAB
        const items: DjenItem[] = await searchDjen({
          numeroOab: c.numero_oab,
          ufOab: c.uf_oab,
          itensPorPagina: 100,
        })

        for (const item of items) {
          const { data: exists } = await supabase.from('intimacoes').select('id').eq('djen_id', item.id).maybeSingle()
          if (exists) continue

          const adv = item.destinatarioadvogados?.find(d => d.advogado.numero_oab === c.numero_oab) ?? item.destinatarioadvogados?.[0]

          await supabase.from('intimacoes').insert({
            djen_id: item.id,
            numero_processo: item.numero_processo,
            numero_processo_mascara: item.numeroprocessocommascara,
            tribunal: item.siglaTribunal,
            orgao: item.nomeOrgao,
            tipo_comunicacao: item.tipoComunicacao,
            texto: stripHtml(item.texto),
            data_disponibilizacao: item.data_disponibilizacao,
            link: item.link,
            advogado_nome: adv?.advogado.nome ?? c.nome,
            advogado_oab: adv?.advogado.numero_oab ?? c.numero_oab,
            advogado_uf: adv?.advogado.uf_oab ?? c.uf_oab,
            status: 'novo',
          })
          totalNew++
        }
      }
      localStorage.setItem('djen_last_sync', String(Date.now()))
      setLastSyncLabel(new Date().toLocaleString('pt-BR'))
      if (!silent || totalNew > 0) {
        toast.success(totalNew > 0 ? `${totalNew} nova(s) intimação(ões) encontrada(s)!` : 'Nenhuma intimação nova')
      }
      loadData()
    } catch (e) {
      if (!silent) toast.error('Erro ao sincronizar com o DJEN. Tente novamente em instantes.')
    } finally {
      setSyncing(false)
    }
  }

  const filtered = useMemo(() => intimacoes.filter(i => {
    if (readFilter === 'nao_lidas') return !i.lida && i.status !== 'ignorado'
    if (readFilter === 'lidas') return i.lida && i.status !== 'ignorado'
    if (readFilter === 'ignoradas') return i.status === 'ignorado'
    return true
  }), [intimacoes, readFilter])

  const countNaoLidas = intimacoes.filter(i => !i.lida && i.status !== 'ignorado').length

  function findMatchingProcess(numProc: string | null) {
    if (!numProc) return null
    const clean = numProc.replace(/\D/g, '')
    return processes.find(p => p.number?.replace(/\D/g, '') === clean) ?? null
  }

  async function ignoreIntimacao(i: Intimacao) {
    await supabase.from('intimacoes').update({ status: 'ignorado', lida: true }).eq('id', i.id)
    loadData()
  }

  function openLink(i: Intimacao) {
    setLinking(i)
    const match = findMatchingProcess(i.numero_processo)
    setLinkProcessId(match?.id ?? '')
    setLinkOpen(true)
  }
  async function confirmLink() {
    if (!linking || !linkProcessId) return
    await supabase.from('intimacoes').update({ process_id: linkProcessId, status: 'vinculado', lida: true }).eq('id', linking.id)
    setLinkOpen(false)
    loadData()
  }

  function openProcesso(i: Intimacao) {
    setProcessoSource(i)
    setNpf({
      client_id: '',
      number: i.numero_processo_mascara ?? '',
      title: i.orgao ? `${i.tipo_comunicacao ?? 'Processo'} — ${i.orgao}` : 'Novo processo',
      area: '',
      court: i.orgao ?? '',
      electronic_system: (i.tribunal && SISTEMA_POR_TRIBUNAL[i.tribunal]) ?? '',
    })
    setProcessoOpen(true)
  }
  async function createProcesso() {
    if (!processoSource) return
    const { data: proc } = await supabase.from('processes').insert({
      client_id: npf.client_id || null,
      number: npf.number || null,
      title: npf.title,
      type: 'judicial',
      area: npf.area || null,
      status: 'em_andamento',
      phase: 'inicial',
      court: npf.court || null,
      electronic_system: npf.electronic_system || null,
      portal_visible: true,
    }).select().single()

    await supabase.from('intimacoes').update({
      process_id: proc?.id ?? null, status: 'vinculado', lida: true,
    }).eq('id', processoSource.id)

    toast.success('Processo criado e vinculado à intimação!')
    setProcessoOpen(false)
    loadData()
  }

  function openPrazo(i: Intimacao) {
    setPrazoSource(i)
    setPrazoTitulo(`Prazo — ${i.tipo_comunicacao ?? 'Intimação'}`)
    const base = new Date()
    base.setDate(base.getDate() + 15)
    setPrazoData(base.toISOString().slice(0, 10))
    setPrazoDias('15')
    setPrazoOpen(true)
  }
  function recalcPrazoData(dias: string) {
    setPrazoDias(dias)
    const n = parseInt(dias) || 0
    const d = new Date()
    d.setDate(d.getDate() + n)
    setPrazoData(d.toISOString().slice(0, 10))
  }
  async function createPrazo() {
    if (!prazoSource) return
    const match = findMatchingProcess(prazoSource.numero_processo)
    const { data: deadline } = await supabase.from('deadlines').insert({
      title: prazoTitulo,
      due_date: prazoData,
      process_id: match?.id ?? null,
      status: 'pendente',
      source: 'Intimação',
      notes: prazoSource.texto?.slice(0, 500),
    }).select().single()

    await supabase.from('intimacoes').update({
      status: 'vinculado',
      deadline_id: deadline?.id,
      process_id: match?.id ?? prazoSource.process_id,
      lida: true,
    }).eq('id', prazoSource.id)

    toast.success('Prazo criado a partir da intimação!')
    setPrazoOpen(false)
    loadData()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sistemas Eletrônicos</h1>
          <p className="text-sm text-muted-foreground">
            Intimações via DJEN (Diário de Justiça Eletrônico Nacional)
            {countNaoLidas > 0 && <span className="text-amber-600 font-medium"> · {countNaoLidas} não lida(s)</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfigOpen(true)} className="rounded-xl">
              <Settings2 className="h-3.5 w-3.5 mr-1.5" />OABs monitoradas
            </Button>
            <Button size="sm" onClick={() => syncAll()} disabled={syncing} className="rounded-xl">
              {syncing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
              {syncing ? 'Buscando novas intimações...' : 'Verificar novas intimações'}
            </Button>
          </div>
          {lastSyncLabel && !syncing && (
            <p className="text-[11px] text-muted-foreground">Última verificação: {lastSyncLabel}</p>
          )}
        </div>
      </div>

      {configs.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Nenhuma OAB cadastrada</p>
            <p className="text-xs text-amber-600/80 dark:text-amber-400/70 mt-0.5">
              Cadastre o número de OAB das advogadas em "OABs monitoradas" e depois clique em "Verificar novas intimações" para buscar no DJEN.
            </p>
          </div>
        </div>
      ) : intimacoes.length === 0 && !syncing && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <RefreshCw className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">Nenhuma intimação carregada ainda</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Clique em "Verificar novas intimações" acima para buscar no DJEN. A busca não é automática — só roda quando você pedir.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5 w-fit">
        {(['nao_lidas', 'lidas', 'ignoradas', 'todas'] as const).map(s => (
          <Button key={s} variant={readFilter === s ? 'default' : 'ghost'} size="sm" className="h-8"
            onClick={() => setReadFilter(s)}>
            {s === 'nao_lidas' ? 'Não lidas' : s === 'lidas' ? 'Lidas' : s === 'ignoradas' ? 'Ignoradas' : 'Todas'}
          </Button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && !loading && (
          <div className="py-16 text-center text-muted-foreground">
            <Scale className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma intimação {readFilter === 'nao_lidas' ? 'não lida' : ''} encontrada</p>
          </div>
        )}

        {filtered.map(i => {
          const match = findMatchingProcess(i.numero_processo)
          return (
            <div key={i.id} className={`rounded-2xl border bg-card shadow-sm p-5 space-y-3 transition-colors ${
              !i.lida && i.status !== 'ignorado' ? 'border-amber-200 dark:border-amber-900' : 'border-border/60'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => toggleLida(i)} className="shrink-0 mt-0.5" title={i.lida ? 'Marcar como não lida' : 'Marcar como lida'}>
                  {i.lida
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    : <Circle className="h-4 w-4 text-amber-500" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <Badge variant="outline" className="text-[10px]">{i.tribunal}</Badge>
                    <Badge variant="secondary" className="text-[10px]">{i.tipo_comunicacao}</Badge>
                    {!i.lida && i.status !== 'ignorado' && <Badge className="text-[10px] bg-amber-100 text-amber-700 hover:bg-amber-100">Não lida</Badge>}
                    {i.status === 'vinculado' && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Vinculado</Badge>}
                    <span className="text-[11px] text-muted-foreground ml-auto shrink-0">{i.data_disponibilizacao && fmtDate(i.data_disponibilizacao)}</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    Processo {i.numero_processo_mascara}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{i.orgao}</p>
                  {match && (
                    <p className="text-[11px] text-primary flex items-center gap-1 mt-1">
                      <Link2 className="h-3 w-3" />Vinculado a: {match.number ? `${match.number} — ${match.title}` : match.title}
                    </p>
                  )}
                  {!match && i.numero_processo && i.status !== 'vinculado' && (
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                      <Info className="h-3 w-3" />Processo ainda não cadastrado no sistema
                    </p>
                  )}
                </div>
              </div>

              <IntimacaoTexto texto={i.texto} />

              <div className="flex items-center gap-2 flex-wrap pt-1">
                {i.status !== 'vinculado' && match && (
                  <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => openLink(i)}>
                    <Link2 className="h-3 w-3 mr-1" />Vincular processo
                  </Button>
                )}
                {i.status !== 'vinculado' && !match && i.numero_processo && (
                  <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => openProcesso(i)}>
                    <FilePlus2 className="h-3 w-3 mr-1" />Criar processo
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => openPrazo(i)}>
                  <Plus className="h-3 w-3 mr-1" />Criar prazo
                </Button>
                {i.link && (
                  <a href={i.link} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg">
                      <ExternalLink className="h-3 w-3 mr-1" />Ver no DJE
                    </Button>
                  </a>
                )}
                {!i.lida && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg" onClick={() => toggleLida(i)}>
                    <Check className="h-3 w-3 mr-1" />Marcar como lida
                  </Button>
                )}
                {i.status !== 'ignorado' && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs rounded-lg text-muted-foreground ml-auto" onClick={() => ignoreIntimacao(i)}>
                    <EyeOff className="h-3 w-3 mr-1" />Ignorar
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Config Dialog ── */}
      <Dialog open={configOpen} onOpenChange={setConfigOpen}>
        <DialogContent className="max-w-[500px] w-[96vw] max-h-[80vh] overflow-y-auto p-6">
          <DialogHeader><DialogTitle>OABs monitoradas</DialogTitle></DialogHeader>
          <div className="space-y-2 pt-2">
            {configs.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.nome}</p>
                  <p className="text-[11px] text-muted-foreground">OAB {c.numero_oab}/{c.uf_oab}</p>
                </div>
                <button onClick={() => removeConfig(c.id)} className="p-1 hover:bg-muted rounded">
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                </button>
              </div>
            ))}
            {configs.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma OAB cadastrada</p>}
          </div>

          <div className="border rounded-xl p-4 space-y-3 mt-2 bg-muted/20">
            <p className="text-sm font-medium">Nova OAB</p>
            <Input placeholder="Nome da advogada" value={newNome} onChange={e => setNewNome(e.target.value)} className="h-9" />
            <div className="grid grid-cols-[1fr_100px] gap-2">
              <Input placeholder="Número OAB" value={newOab} onChange={e => setNewOab(e.target.value)} className="h-9" inputMode="numeric" />
              <Select value={newUf} onValueChange={setNewUf}>
                <SelectTrigger className="h-9"><SelectValue>{newUf}</SelectValue></SelectTrigger>
                <SelectContent>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button size="sm" className="w-full" onClick={addConfig} disabled={!newNome.trim() || !newOab.trim()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />Adicionar
            </Button>
          </div>

          <DialogFooter className="pt-2">
            <DialogClose render={<Button variant="outline" />}>Fechar</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link to process Dialog ── */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-[480px] w-[96vw] p-6">
          <DialogHeader><DialogTitle>Vincular ao processo</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <p className="text-xs text-muted-foreground">
              Processo na intimação: <strong>{linking?.numero_processo_mascara}</strong>
            </p>
            <Select value={linkProcessId} onValueChange={setLinkProcessId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Selecione o processo..." /></SelectTrigger>
              <SelectContent>
                {processes.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.number ? `${p.number} — ${p.title}` : p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={confirmLink} disabled={!linkProcessId}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Prazo Dialog ── */}
      <Dialog open={prazoOpen} onOpenChange={setPrazoOpen}>
        <DialogContent className="max-w-[520px] w-[96vw] p-6">
          <DialogHeader><DialogTitle>Criar prazo a partir da intimação</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={prazoTitulo} onChange={e => setPrazoTitulo(e.target.value)} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Dias de prazo</Label>
                <Input value={prazoDias} onChange={e => recalcPrazoData(e.target.value)} className="h-10" inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>Data limite</Label>
                <Input type="date" value={prazoData} onChange={e => setPrazoData(e.target.value)} className="h-10" />
              </div>
            </div>
            {prazoSource && findMatchingProcess(prazoSource.numero_processo) && (
              <p className="text-[11px] text-primary flex items-center gap-1">
                <Link2 className="h-3 w-3" />Será vinculado automaticamente ao processo correspondente
              </p>
            )}
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={createPrazo} disabled={!prazoTitulo || !prazoData}>Criar prazo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create Processo Dialog ── */}
      <Dialog open={processoOpen} onOpenChange={setProcessoOpen}>
        <DialogContent className="max-w-[600px] w-[96vw] max-h-[90vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Criar processo a partir da intimação</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-xs text-muted-foreground">
              Processo {processoSource?.numero_processo_mascara} ainda não estava cadastrado — preencha os dados para criá-lo.
            </p>
            <div className="space-y-1.5">
              <Label>Título do processo</Label>
              <Input value={npf.title} onChange={e => setNpf(f => ({ ...f, title: e.target.value }))} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={npf.client_id} onValueChange={v => setNpf(f => ({ ...f, client_id: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Área do direito</Label>
                <Select value={npf.area} onValueChange={v => setNpf(f => ({ ...f, area: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>{AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Número do processo</Label>
              <Input value={npf.number} onChange={e => setNpf(f => ({ ...f, number: e.target.value }))} className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vara / Tribunal</Label>
                <Input value={npf.court} onChange={e => setNpf(f => ({ ...f, court: e.target.value }))} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>Sistema eletrônico</Label>
                <Select value={npf.electronic_system} onValueChange={v => setNpf(f => ({ ...f, electronic_system: v }))}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    <SelectItem value="eProc Estadual">eProc Estadual</SelectItem>
                    <SelectItem value="eProc Federal">eProc Federal</SelectItem>
                    <SelectItem value="PJe">PJe</SelectItem>
                    <SelectItem value="ESAJ">ESAJ</SelectItem>
                    <SelectItem value="Projudi">Projudi</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="pt-4">
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={createProcesso} disabled={!npf.title}>Criar processo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
