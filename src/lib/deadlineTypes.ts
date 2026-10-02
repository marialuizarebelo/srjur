// Tipos de prazo processual — em ordem alfabética. Cada tipo recebe uma cor
// fixa e determinística (hash do texto), pra funcionar como "tag" colorida
// nos cards sem precisar mapear cor por cor manualmente.
export const TIPOS_PRAZO = [
  'Petição Inicial', 'Emenda à Inicial', 'Contestação', 'Réplica', 'Reconvenção',
  'Manifestação à Reconvenção', 'Petição de Tutela de Urgência', 'Agravo de Instrumento',
  'Embargos de Declaração', 'CR de Embargos', 'Apelação', 'CR de Apelação',
  'CR de Agravo de Instrumento', 'Agravo Interno', 'CR Agravo Interno',
  'Embargos Infringentes', 'Recurso Especial (STJ)', 'Recurso Extraordinário (STF)',
  'CR de Especial/Extraordinário', 'Agravo em RESP/RESxp', 'Provas/Testemunhas',
  'Quesitos/Assistente Técnico', 'Man/Impug. Laudo', 'Juntada', 'Memoriais',
  'Cumprimento de Sentença', 'Impug. Cumprimento de Sentença', 'Embargos à Execução',
  'Exceção Pré-Executividade', 'Impug. à Exceção de Pré-Ex.', 'Habilitação',
  'Notificação Extrajudicial', 'Defesa Administrativa', 'Recurso Administrativo',
  'Petição Simples', 'Outro',
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
