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
  '#C4567C', '#8577C9', '#6A8FC7', '#6E9C7D', '#D9A441',
  '#D96C87', '#5FA39A', '#7A84C9', '#E2654B', '#5AA9B5',
  '#8FA96A', '#B873B8', '#5AA5C4', '#A07BC9', '#D96C87',
]

export function getTagColor(text: string) {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}
