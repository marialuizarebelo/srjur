import { useState } from 'react'
import {
  LayoutDashboard, DollarSign, Users, Briefcase, Trophy,
} from 'lucide-react'
import VisaoGeralTab from './metricas/VisaoGeral'
import FinanceiroTab from './metricas/Financeiro'
import ComercialTab from './metricas/Comercial'
import JuridicoTab from './metricas/Juridico'
import ProdutoSaasTab from './metricas/ProdutoSaas'
import ProdutividadeTab from './metricas/Produtividade'
import MetasTab from './metricas/Metas'
import ClientesTab from './metricas/Clientes'
import {
  MetricasFiltersContext, useMetricasFiltersState,
  PeriodPicker, ResponsavelFilter, UnidadeFilter,
} from './metricas/shared'

/*
 * Organização por pergunta que o escritório precisa responder:
 *  - Resumo ........ "Como estamos este mês?"
 *  - Dinheiro ...... "Quanto entra, quanto sai, quanto devem?"  (Financeiro, Inadimplência, SaaS, Metas financeiras)
 *  - Clientes e Vendas "Quem são e quantos entram?"             (Vendas, Carteira, Metas comerciais)
 *  - Operação ...... "A equipe está dando conta?"               (Jurídico, Equipe)
 *  - Metas ......... todas as metas num lugar só.
 * Cada indicador mora em um único lugar; o período, o responsável e a unidade são filtros únicos no topo.
 */

type Control = 'periodo' | 'responsavel' | 'unidade'
type Sub = { key: string; label: string; controls: Control[]; render: () => React.ReactNode }
type Area = { key: string; label: string; icon: React.ElementType; question: string; subs: Sub[] }

const AREAS: Area[] = [
  {
    key: 'resumo', label: 'Resumo', icon: LayoutDashboard, question: 'Como o escritório está neste mês?',
    subs: [{ key: 'geral', label: 'Resumo do mês', controls: [], render: () => <VisaoGeralTab /> }],
  },
  {
    key: 'dinheiro', label: 'Dinheiro', icon: DollarSign, question: 'Quanto entra, quanto sai e quanto está em atraso?',
    subs: [
      { key: 'financeiro', label: 'Financeiro', controls: ['periodo', 'unidade', 'responsavel'], render: () => <FinanceiroTab /> },
      { key: 'inadimplencia', label: 'Inadimplência', controls: ['responsavel'], render: () => <ClientesTab section="inadimplencia" /> },
      { key: 'saas', label: 'Produto SaaS', controls: ['periodo'], render: () => <ProdutoSaasTab /> },
      { key: 'metas', label: 'Metas financeiras', controls: [], render: () => <MetasTab only="financeiro" /> },
    ],
  },
  {
    key: 'clientes', label: 'Clientes e Vendas', icon: Users, question: 'Quantos clientes entram e quem são?',
    subs: [
      { key: 'vendas', label: 'Vendas', controls: ['periodo', 'responsavel'], render: () => <ComercialTab /> },
      { key: 'carteira', label: 'Carteira', controls: ['responsavel'], render: () => <ClientesTab section="carteira" /> },
      { key: 'metas', label: 'Metas comerciais', controls: [], render: () => <MetasTab only="comercial" /> },
    ],
  },
  {
    key: 'operacao', label: 'Operação', icon: Briefcase, question: 'A equipe está dando conta do trabalho?',
    subs: [
      { key: 'juridico', label: 'Jurídico', controls: ['periodo', 'responsavel'], render: () => <JuridicoTab /> },
      { key: 'equipe', label: 'Equipe', controls: ['responsavel'], render: () => <ProdutividadeTab /> },
    ],
  },
  {
    key: 'metas', label: 'Metas', icon: Trophy, question: 'Estamos batendo as metas?',
    subs: [{ key: 'todas', label: 'Todas as metas', controls: [], render: () => <MetasTab /> }],
  },
]

export default function Metricas() {
  const filters = useMetricasFiltersState()
  const [areaKey, setAreaKey] = useState('resumo')
  const [subKeys, setSubKeys] = useState<Record<string, string>>({})

  const area = AREAS.find(a => a.key === areaKey) ?? AREAS[0]
  const sub = area.subs.find(s => s.key === subKeys[area.key]) ?? area.subs[0]

  return (
    <MetricasFiltersContext.Provider value={filters}>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Métricas e Metas</h1>
          <p className="text-sm text-muted-foreground">{area.question}</p>
        </div>

        {/* Áreas */}
        <div className="flex gap-1 bg-muted/40 rounded-2xl p-1 flex-wrap w-fit max-w-full">
          {AREAS.map(a => {
            const Icon = a.icon
            return (
              <button
                key={a.key}
                onClick={() => setAreaKey(a.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  area.key === a.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {a.label}
              </button>
            )
          })}
        </div>

        {/* Seções da área */}
        {area.subs.length > 1 && (
          <div className="flex gap-1.5 flex-wrap">
            {area.subs.map(s => (
              <button
                key={s.key}
                onClick={() => setSubKeys(k => ({ ...k, [area.key]: s.key }))}
                className={`h-8 px-4 rounded-full text-xs font-semibold border transition-all ${
                  sub.key === s.key
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-[var(--glass-border)] text-muted-foreground hover:text-foreground'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {/* Filtros únicos: só aparecem os que valem para a seção aberta */}
        {sub.controls.length > 0 && (
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2">
            {sub.controls.includes('periodo') && <PeriodPicker p={filters.period} />}
            {sub.controls.includes('unidade') && <UnidadeFilter f={filters.unidade} />}
            {sub.controls.includes('responsavel') && <ResponsavelFilter f={filters.resp} />}
          </div>
        )}

        {/* key força remontar ao trocar de seção, mantendo os filtros (que vivem no contexto) */}
        <div key={`${area.key}/${sub.key}`}>{sub.render()}</div>
      </div>
    </MetricasFiltersContext.Provider>
  )
}
