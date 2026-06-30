import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Copy, RotateCcw, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { toast } from 'sonner'
import { fmtBRL } from '@/lib/format'

// ── Helpers ───────────────────────────────────────────────────────────────
function maskBRL(raw: string) {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const n = parseInt(digits) / 100
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(n)
}
function parseBRL(v: string) {
  return parseFloat(v.replace(/\./g, '').replace(',', '.')) || 0
}

// ── Scales ────────────────────────────────────────────────────────────────
const COMPLEXIDADE = [
  { label: 'Simples',         desc: 'Caso rotineiro, precedentes claros, baixa pesquisa',           mult: 1.0 },
  { label: 'Moderada',        desc: 'Alguma complexidade, mas dentro do ordinário do escritório',   mult: 1.25 },
  { label: 'Complexa',        desc: 'Múltiplas questões, pesquisa aprofundada necessária',          mult: 1.6 },
  { label: 'Muito complexa',  desc: 'Tese nova, alta litigiosidade, demanda intensiva',             mult: 2.0 },
  { label: 'Excepcional',     desc: 'Caso paradigma, grande repercussão ou risco reputacional',     mult: 2.5 },
]

const RISCO = [
  { label: 'Baixo',      desc: 'Resultado praticamente certo, farta jurisprudência favorável',  mult: 1.0 },
  { label: 'Moderado',   desc: 'Possibilidade razoável de êxito, alguma incerteza',              mult: 1.2 },
  { label: 'Alto',       desc: 'Incerteza relevante, dependente de prova ou convicção judicial', mult: 1.5 },
  { label: 'Muito alto', desc: 'Tese controvertida, alto risco de derrota',                      mult: 1.9 },
]

const URGENCIA = [
  { label: 'Normal',          desc: 'Prazo confortável para execução',      mult: 1.0 },
  { label: 'Urgente',         desc: 'Prazo curto, reorganização da agenda',  mult: 1.3 },
  { label: 'Muito urgente',   desc: 'Imediato, prioridade máxima',           mult: 1.6 },
]

const INSTANCIAS = [
  { label: 'Apenas 1ª instância',         mult: 1.0 },
  { label: 'Até 2ª instância (TJ/TRF)',   mult: 1.35 },
  { label: 'Até tribunais superiores',    mult: 1.7 },
]

const AREAS = [
  'Cível', 'Trabalhista', 'Criminal', 'Previdenciário',
  'Família e Sucessões', 'Empresarial', 'Consumidor',
  'Administrativo', 'Tributário', 'Imobiliário',
]

const MODALIDADES_SUGERIDAS = [
  { value: 'fixo',          label: 'Valor fixo' },
  { value: 'fixo_parcelas', label: 'Fixo parcelado' },
  { value: 'fixo_exito',    label: 'Fixo + êxito' },
  { value: 'mensal',        label: 'Mensalidade (retainer)' },
]

// ── Scale Selector ────────────────────────────────────────────────────────
function ScaleSelector({
  label, options, value, onChange, info,
}: {
  label: string
  options: { label: string; desc: string; mult: number }[]
  value: number
  onChange: (i: number) => void
  info?: string
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm">{label}</Label>
        {info && <span className="text-[10px] text-muted-foreground">({info})</span>}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
        {options.map((o, i) => (
          <button key={i} onClick={() => onChange(i)}
            title={o.desc}
            className={`rounded-xl border px-2 py-2.5 text-center transition-all text-xs font-medium leading-tight
              ${value === i
                ? 'border-primary bg-primary/8 text-primary shadow-sm'
                : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground'
              }`}>
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{options[value].desc}</p>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function Calculadora() {
  const [area, setArea]               = useState(AREAS[0])
  const [complexIdx, setComplexIdx]   = useState(1)
  const [riscoIdx, setRiscoIdx]       = useState(1)
  const [urgenciaIdx, setUrgenciaIdx] = useState(0)
  const [instanciaIdx, setInstanciaIdx] = useState(0)
  const [horasEstimadas, setHorasEstimadas] = useState('')
  const [valorHora, setValorHora]     = useState('')
  const [custasExtras, setCustasExtras] = useState('')
  const [margemLucro, setMargemLucro] = useState([20])
  const [temExito, setTemExito]       = useState(false)
  const [pctExito, setPctExito]       = useState('')
  const [modalidade, setModalidade]   = useState('fixo_parcelas')
  const [parcelas, setParcelas]       = useState('3')
  const [observacoes, setObservacoes] = useState('')
  const [showResult, setShowResult]   = useState(false)
  const [showDetail, setShowDetail]   = useState(false)

  const horas    = parseFloat(horasEstimadas.replace(',', '.')) || 0
  const vHora    = parseBRL(valorHora)
  const custas   = parseBRL(custasExtras)
  const margem   = margemLucro[0] / 100
  const nParc    = parseInt(parcelas) || 1
  const pExito   = parseFloat(pctExito.replace(',', '.')) || 0

  const calc = useMemo(() => {
    const custoBase  = horas * vHora
    const multComplex = COMPLEXIDADE[complexIdx].mult
    const multRisco   = RISCO[riscoIdx].mult
    const multUrg     = URGENCIA[urgenciaIdx].mult
    const multInst    = INSTANCIAS[instanciaIdx].mult

    // Honorário base: custo ajustado pelos fatores
    const honorarioBase = custoBase * multComplex * multRisco * multUrg * multInst

    // Adiciona margem sobre o total (incluindo custas)
    const totalComCustas = honorarioBase + custas
    const comMargem = totalComCustas * (1 + margem)

    // Faixas: conservadora (–15%), recomendada, premium (+25%)
    const conservadora = comMargem * 0.85
    const recomendada  = comMargem
    const premium      = comMargem * 1.25

    return { custoBase, honorarioBase, conservadora, recomendada, premium, comMargem, custas }
  }, [horas, vHora, complexIdx, riscoIdx, urgenciaIdx, instanciaIdx, custas, margem])

  const ready = horas > 0 && vHora > 0

  function reset() {
    setArea(AREAS[0]); setComplexIdx(1); setRiscoIdx(1); setUrgenciaIdx(0)
    setInstanciaIdx(0); setHorasEstimadas(''); setValorHora(''); setCustasExtras('')
    setMargemLucro([20]); setTemExito(false); setPctExito(''); setParcelas('3')
    setObservacoes(''); setShowResult(false)
  }

  function copyResult() {
    const lines = [
      `PRECIFICAÇÃO DE HONORÁRIOS — ${new Date().toLocaleDateString('pt-BR')}`,
      `Área: ${area}`,
      `Complexidade: ${COMPLEXIDADE[complexIdx].label}`,
      `Risco: ${RISCO[riscoIdx].label}`,
      `Urgência: ${URGENCIA[urgenciaIdx].label}`,
      `Instâncias: ${INSTANCIAS[instanciaIdx].label}`,
      `Horas estimadas: ${horasEstimadas}h`,
      `Valor/hora: ${fmtBRL(parseBRL(valorHora))}`,
      `Custas estimadas: ${fmtBRL(parseBRL(custasExtras))}`,
      `Margem: ${margemLucro[0]}%`,
      '',
      `Conservador: ${fmtBRL(calc.conservadora)}`,
      `Recomendado: ${fmtBRL(calc.recomendada)}`,
      `Premium:     ${fmtBRL(calc.premium)}`,
      '',
      `Modalidade sugerida: ${MODALIDADES_SUGERIDAS.find(m=>m.value===modalidade)?.label}`,
      nParc > 1 ? `Parcelado em: ${nParc}× de ${fmtBRL(calc.recomendada / nParc)}` : '',
      temExito && pExito ? `+ ${pExito}% sobre ganho em caso de êxito` : '',
      observacoes ? `\nObservações: ${observacoes}` : '',
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(lines)
    toast.success('Resumo copiado!')
  }

  const factorTotal = COMPLEXIDADE[complexIdx].mult * RISCO[riscoIdx].mult * URGENCIA[urgenciaIdx].mult * INSTANCIAS[instanciaIdx].mult

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Calculadora de Honorários</h1>
          <p className="text-sm text-muted-foreground">Precifique o caso com base em complexidade, risco e custo real</p>
        </div>
        <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5" />Limpar
        </Button>
      </div>

      {/* ── Seção 1: Análise do caso ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-6">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">1. Análise do caso</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Área do direito</Label>
            <Select value={area} onValueChange={setArea}>
              <SelectTrigger className="h-10"><SelectValue>{area}</SelectValue></SelectTrigger>
              <SelectContent>{AREAS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Instâncias previstas</Label>
            <Select value={String(instanciaIdx)} onValueChange={v => setInstanciaIdx(Number(v))}>
              <SelectTrigger className="h-10"><SelectValue>{INSTANCIAS[instanciaIdx].label}</SelectValue></SelectTrigger>
              <SelectContent>
                {INSTANCIAS.map((o,i) => <SelectItem key={i} value={String(i)}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <ScaleSelector
          label="Complexidade do caso"
          options={COMPLEXIDADE}
          value={complexIdx}
          onChange={setComplexIdx}
          info="impacto no tempo e esforço"
        />

        <ScaleSelector
          label="Risco do caso"
          options={RISCO}
          value={riscoIdx}
          onChange={setRiscoIdx}
          info="probabilidade de êxito"
        />

        <ScaleSelector
          label="Urgência"
          options={URGENCIA}
          value={urgenciaIdx}
          onChange={setUrgenciaIdx}
        />
      </div>

      {/* ── Seção 2: Custo e tempo ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">2. Custo e tempo estimados</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Horas estimadas no caso</Label>
            <Input value={horasEstimadas} onChange={e => setHorasEstimadas(e.target.value)}
              placeholder="Ex: 15" className="h-10" inputMode="decimal" />
            <p className="text-[10px] text-muted-foreground">Total de horas de trabalho previstas — pesquisa, petições, audiências</p>
          </div>
          <div className="space-y-1.5">
            <Label>Valor da sua hora (R$)</Label>
            <Input value={valorHora} onChange={e => setValorHora(maskBRL(e.target.value))}
              placeholder="0,00" className="h-10" inputMode="numeric" />
            <p className="text-[10px] text-muted-foreground">Quanto vale 1h do seu tempo hoje</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Custas e despesas previstas (R$)</Label>
          <Input value={custasExtras} onChange={e => setCustasExtras(maskBRL(e.target.value))}
            placeholder="0,00" className="h-10" inputMode="numeric" />
          <p className="text-[10px] text-muted-foreground">
            Inclua: guias judiciais, peritos, deslocamento, cópias, diligências, taxas de cartório, etc.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Margem de lucro desejada</Label>
            <span className="text-sm font-semibold text-primary">{margemLucro[0]}%</span>
          </div>
          <Slider
            value={margemLucro}
            onValueChange={setMargemLucro}
            min={0} max={100} step={5}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
          </div>
        </div>

        {horas > 0 && vHora > 0 && (
          <div className="rounded-xl bg-muted/30 px-4 py-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Custo base ({horas}h × {fmtBRL(vHora)})</span>
            <span className="text-sm font-semibold">{fmtBRL(calc.custoBase)}</span>
          </div>
        )}
      </div>

      {/* ── Seção 3: Proposta ── */}
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm p-6 space-y-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">3. Estrutura da proposta</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Modalidade de cobrança</Label>
            <Select value={modalidade} onValueChange={setModalidade}>
              <SelectTrigger className="h-10"><SelectValue>{MODALIDADES_SUGERIDAS.find(m=>m.value===modalidade)?.label}</SelectValue></SelectTrigger>
              <SelectContent>
                {MODALIDADES_SUGERIDAS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {(modalidade === 'fixo_parcelas' || modalidade === 'mensal') && (
            <div className="space-y-1.5">
              <Label>{modalidade === 'mensal' ? 'Meses de duração estimada' : 'Número de parcelas'}</Label>
              <Input value={parcelas} onChange={e => setParcelas(e.target.value)}
                placeholder="3" className="h-10" inputMode="numeric" />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50">
          <Switch checked={temExito} onCheckedChange={setTemExito} />
          <div className="flex-1">
            <Label className="cursor-pointer">Incluir cláusula de êxito</Label>
            <p className="text-[10px] text-muted-foreground">% adicional sobre o benefício econômico em caso de procedência</p>
          </div>
          {temExito && (
            <div className="flex items-center gap-2">
              <Input value={pctExito} onChange={e => setPctExito(e.target.value)}
                placeholder="%" className="h-8 w-16 text-center" inputMode="decimal" />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Observações / condições especiais</Label>
          <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)}
            placeholder="Ex: inclui acompanhamento por 12 meses, exclui recursos extraordinários, revisão anual..."
            rows={2} className="resize-none text-sm" />
        </div>

        <Button className="w-full h-11 rounded-xl text-sm font-medium" onClick={() => setShowResult(true)} disabled={!ready}>
          Calcular honorários sugeridos
        </Button>
      </div>

      {/* ── Resultado ── */}
      {showResult && ready && (
        <div className="rounded-2xl border border-border/60 bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
            <p className="text-sm font-semibold">Sugestão de honorários</p>
            <Button variant="ghost" size="sm" onClick={copyResult} className="gap-1.5 text-xs">
              <Copy className="h-3.5 w-3.5" />Copiar resumo
            </Button>
          </div>

          {/* Three tiers */}
          <div className="grid grid-cols-3 divide-x divide-border/40 px-0">
            {[
              { label: 'Conservador', value: calc.conservadora, note: 'Mínimo aceitável', muted: true },
              { label: 'Recomendado', value: calc.recomendada,  note: 'Valor equilibrado', highlight: true },
              { label: 'Premium',     value: calc.premium,       note: 'Caso diferenciado', muted: true },
            ].map((t, i) => (
              <div key={i} className={`px-5 py-5 text-center ${t.highlight ? 'bg-primary/5' : ''}`}>
                <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1 ${t.highlight ? 'text-primary' : 'text-muted-foreground'}`}>
                  {t.label}
                </p>
                <p className={`text-xl font-bold ${t.highlight ? 'text-primary' : 'text-foreground'}`}>
                  {fmtBRL(t.value)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">{t.note}</p>
                {nParc > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {nParc}× de {fmtBRL(t.value / nParc)}
                  </p>
                )}
              </div>
            ))}
          </div>

          {temExito && pExito > 0 && (
            <div className="mx-6 mb-2 mt-0 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 px-4 py-2.5">
              <p className="text-xs text-violet-700 dark:text-violet-400">
                + cláusula de êxito: <strong>{pExito}%</strong> sobre o benefício econômico obtido
              </p>
            </div>
          )}

          {/* Detail breakdown */}
          <div className="border-t border-border/40">
            <button className="w-full flex items-center justify-between px-6 py-3 hover:bg-muted/20 transition-colors text-left"
              onClick={() => setShowDetail(d => !d)}>
              <div className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Como foi calculado</span>
              </div>
              {showDetail ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
            {showDetail && (
              <div className="px-6 pb-5 space-y-2 border-t border-border/40">
                {[
                  { label: `Custo base (${horas}h × ${fmtBRL(vHora)})`,                         value: calc.custoBase },
                  { label: `× Complexidade (${COMPLEXIDADE[complexIdx].label} — ${COMPLEXIDADE[complexIdx].mult}×)`, value: null },
                  { label: `× Risco (${RISCO[riscoIdx].label} — ${RISCO[riscoIdx].mult}×)`,     value: null },
                  { label: `× Urgência (${URGENCIA[urgenciaIdx].label} — ${URGENCIA[urgenciaIdx].mult}×)`, value: null },
                  { label: `× Instâncias (${INSTANCIAS[instanciaIdx].label} — ${INSTANCIAS[instanciaIdx].mult}×)`, value: null },
                  { label: `= Honorário ajustado pelos fatores (${factorTotal.toFixed(2)}×)`,     value: calc.honorarioBase },
                  { label: `+ Custas e despesas estimadas`,                                        value: calc.custas },
                  { label: `+ Margem de lucro (${margemLucro[0]}%)`,                             value: calc.comMargem - calc.honorarioBase - calc.custas },
                  { label: `= Base de cálculo (valor recomendado)`,                               value: calc.recomendada, bold: true },
                ].map((row, i) => (
                  <div key={i} className={`flex items-center justify-between py-1 ${i > 0 && row.value !== null ? 'border-t border-border/30' : ''}`}>
                    <span className={`text-xs ${row.bold ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{row.label}</span>
                    {row.value !== null && (
                      <span className={`text-xs font-medium ${row.bold ? 'text-primary' : ''}`}>{fmtBRL(row.value)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {observacoes && (
            <div className="mx-6 mb-5 rounded-xl bg-muted/30 px-4 py-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Condições / observações</p>
              <p className="text-xs whitespace-pre-wrap">{observacoes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
