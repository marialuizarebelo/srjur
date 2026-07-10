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
  '#EC4899', '#8B5CF6', '#3B82F6', '#10B981', '#F59E0B',
  '#EF4444', '#14B8A6', '#6366F1', '#F97316', '#06B6D4',
  '#84CC16', '#D946EF', '#0EA5E9', '#A855F7', '#F43F5E',
]

export function getTagColor(text: string) {
  let hash = 0
  for (let i = 0; i < text.length; i++) hash = text.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}
