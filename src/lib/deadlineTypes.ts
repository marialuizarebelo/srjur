// Tipos de prazo processual — em ordem alfabética. Cada tipo recebe uma cor
// fixa e determinística (hash do texto), pra funcionar como "tag" colorida
// nos cards sem precisar mapear cor por cor manualmente.
// Lista específica da Amabile (foco em Direito Criminal) — diferente da lista
// padrão usada no seu (main) e no demo.
export const TIPOS_PRAZO = [
  'Pedido de Liberdade', 'Habeas Corpus', 'Petição Simples', 'Resposta à Acusação',
  'Audiência de Instrução e Julgamento', 'Memoriais', 'Recurso de Apelação',
  'Contrarrazões de Apelação', 'Recurso em Sentido Estrito',
  'Contrarrazões de Recurso em Sentido Estrito', 'Recurso Especial',
  'Contrarrazões ao Recurso Especial', 'Recurso Extraordinário',
  'Contrarrazões ao Recurso Extraordinário', 'Queixa-Crime', 'Agravo em Execução',
  'Pedido de Remição', 'Pedido de Detração', 'Progressão de Regime',
  'Petições Simples no PEC', 'Revisão Criminal', 'Outro',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

const TAG_COLORS = [
  '#EC4899', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#14B8A6', '#6366F1', '#F97316', '#06B6D4',
  '#84CC16', '#D946EF', '#0EA5E9', '#A855F7', '#F43F5E',
]

export function getTagColor(text: string) {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}
