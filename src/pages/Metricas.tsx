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

const TABS = [
  { key: 'visao_geral', label: 'Visão Geral', icon: LayoutDashboard },
  { key: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { key: 'comercial', label: 'Comercial', icon: Target },
  { key: 'juridico', label: 'Jurídico', icon: Scale },
  { key: 'produto_saas', label: 'Produto/SaaS', icon: Rocket },
  { key: 'produtividade', label: 'Produtividade', icon: ClipboardList },
  { key: 'metas', label: 'Metas', icon: Trophy },
  { key: 'clientes', label: 'Clientes', icon: Users },
] as const

type TabKey = typeof TABS[number]['key']

export default function Metricas() {
  const [tab, setTab] = useState<TabKey>('visao_geral')

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Métricas e Metas</h1>
        <p className="text-sm text-muted-foreground">Indicadores e planejamento do escritório como um todo</p>
      </div>

      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 flex-wrap w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'visao_geral' && <VisaoGeralTab />}
      {tab === 'financeiro' && <FinanceiroTab />}
      {tab === 'comercial' && <ComercialTab />}
      {tab === 'juridico' && <JuridicoTab />}
      {tab === 'produto_saas' && <ProdutoSaasTab />}
      {tab === 'produtividade' && <ProdutividadeTab />}
      {tab === 'metas' && <MetasTab />}
      {tab === 'clientes' && <ClientesTab />}
    </div>
  )
}
