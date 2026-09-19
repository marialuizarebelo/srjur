import { Card } from '@/components/ui/card'
import { Rocket } from 'lucide-react'

export default function ProdutoSaasTab() {
  return (
    <Card className="p-8 text-center">
      <Rocket className="h-8 w-8 mx-auto mb-3 text-muted-foreground opacity-40" />
      <p className="text-sm font-medium">Em construção</p>
      <p className="text-xs text-muted-foreground mt-1.5 max-w-md mx-auto">
        Indicadores de MRR, churn e assinantes do SRJUR como produto (vendido pra outros escritórios) ainda não
        têm nenhum controle de dados por trás — hoje não existe registro de quem paga, quanto ou quando.
        Precisa desenhar esse controle antes de dar pra medir qualquer coisa aqui.
      </p>
    </Card>
  )
}
