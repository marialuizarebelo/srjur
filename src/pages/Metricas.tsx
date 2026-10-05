import { useState } from 'react'
import {
  LayoutDashboard, DollarSign, Target, Scale, Rocket, ClipboardList, Trophy, Users,
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
  PeriodPicker, ResponsavelFilter, UnidadeSwitch, UnidadeNotice, type UnidadeKey,
} from './metricas/shared'

/*
 * Mesmas oito abas de sempre. O que muda é o conteúdo de cada uma e os filtros,
 * que agora são únicos aqui no topo:
 *  - Visão: Empresa toda (Advocacia + SaaS como uma empresa só) · Advocacia · SaaS
 *  - Período e Responsável aparecem só nas abas em que fazem sentido.
 */
type Control = 'periodo' | 'responsavel'
const TABS = [
  { key: 'visao_geral', label: 'Visão Geral', icon: LayoutDashboard, controls: ['periodo'] as Control[], render: () => <VisaoGeralTab /> },
  { key: 'financeiro', label: 'Financeiro', icon: DollarSign, controls: ['periodo', 'responsavel'] as Control[], render: () => <FinanceiroTab /> },
  {
    key: 'comercial', label: 'Comercial', icon: Target, controls: ['periodo', 'responsavel'] as Control[], render: () => <ComercialTab />,
    notice: (u: UnidadeKey) => u === 'saas' ? 'Os leads ainda não são marcados por unidade, então o funil mostra a operação comercial como um todo. A receita do SaaS está nas abas Financeiro e Produto/SaaS.' : null,
  },
  {
    key: 'juridico', label: 'Jurídico', icon: Scale, controls: ['periodo', 'responsavel'] as Control[], render: () => <JuridicoTab />,
    notice: (u: UnidadeKey) => u === 'saas' ? 'Processos, prazos e audiências são da Advocacia e não entram na visão SaaS.' : null,
  },
  {
    key: 'produto_saas', label: 'Produto/SaaS', icon: Rocket, controls: ['periodo'] as Control[], render: () => <ProdutoSaasTab />,
    notice: (u: UnidadeKey) => u === 'advocacia' ? 'O SaaS não faz parte da visão Advocacia. Escolha Empresa toda ou SaaS para ver estes números.' : null,
  },
  {
    key: 'produtividade', label: 'Produtividade', icon: ClipboardList, controls: ['periodo', 'responsavel'] as Control[], render: () => <ProdutividadeTab />,
    notice: (u: UnidadeKey) => u ? 'Tarefas e prazos ainda não são marcados por unidade: a carga da equipe é a mesma em qualquer visão.' : null,
  },
  { key: 'metas', label: 'Metas', icon: Trophy, controls: [] as Control[], render: () => <MetasTab /> },
  { key: 'clientes', label: 'Clientes', icon: Users, controls: ['periodo', 'responsavel'] as Control[], render: () => <ClientesTab /> },
]

export default function Metricas() {
  const filters = useMetricasFiltersState()
  const [tabKey, setTabKey] = useState('visao_geral')
  const tab = TABS.find(t => t.key === tabKey) ?? TABS[0]
  const notice = 'notice' in tab && tab.notice ? tab.notice(filters.unidade.unidade) : null

  return (
    <MetricasFiltersContext.Provider value={filters}>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Métricas e Metas</h1>
            <p className="text-sm text-muted-foreground">Indicadores e planejamento do escritório e do SaaS, juntos ou separados</p>
          </div>
          {/* Dois CNPJs, uma empresa: tudo abaixo respeita esta visão */}
          <UnidadeSwitch f={filters.unidade} />
        </div>

        <div className="flex gap-1 bg-muted/40 rounded-2xl p-1 flex-wrap w-fit max-w-full">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTabKey(t.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                  tab.key === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {tab.controls.length > 0 && (
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-surface)] px-3 py-2">
            {tab.controls.includes('periodo') && <PeriodPicker p={filters.period} />}
            {tab.controls.includes('responsavel') && <ResponsavelFilter f={filters.resp} />}
          </div>
        )}

        {notice && <UnidadeNotice>{notice}</UnidadeNotice>}

        <div key={tab.key}>{tab.render()}</div>
      </div>
    </MetricasFiltersContext.Provider>
  )
}
