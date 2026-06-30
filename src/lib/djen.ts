// Cliente para a API pública do DJEN (Diário de Justiça Eletrônico Nacional / CNJ)
// Docs: https://comunicaapi.pje.jus.br — endpoint público, sem autenticação
const BASE_URL = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao'

export interface DjenItem {
  id: number
  data_disponibilizacao: string
  siglaTribunal: string
  tipoComunicacao: string
  nomeOrgao: string
  texto: string
  numero_processo: string
  numeroprocessocommascara: string
  link: string | null
  tipoDocumento: string
  destinatarioadvogados: {
    advogado: { nome: string; numero_oab: string; uf_oab: string }
  }[]
}

interface DjenResponse {
  status: string
  message: string
  count: number
  items: DjenItem[]
}

export interface DjenSearchParams {
  numeroOab?: string
  ufOab?: string
  dataDisponibilizacaoInicio?: string // YYYY-MM-DD
  dataDisponibilizacaoFim?: string
  numeroProcesso?: string
  itensPorPagina?: number
  pagina?: number
}

async function searchDjenPage(params: DjenSearchParams): Promise<DjenItem[]> {
  const qs = new URLSearchParams()
  if (params.numeroOab) qs.set('numeroOab', params.numeroOab)
  if (params.ufOab) qs.set('ufOab', params.ufOab)
  if (params.dataDisponibilizacaoInicio) qs.set('dataDisponibilizacaoInicio', params.dataDisponibilizacaoInicio)
  if (params.dataDisponibilizacaoFim) qs.set('dataDisponibilizacaoFim', params.dataDisponibilizacaoFim)
  if (params.numeroProcesso) qs.set('numeroProcesso', params.numeroProcesso)
  qs.set('itensPorPagina', String(params.itensPorPagina ?? 50))
  qs.set('pagina', String(params.pagina ?? 1))

  const res = await fetch(`${BASE_URL}?${qs.toString()}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`DJEN respondeu ${res.status}`)
  const data: DjenResponse = await res.json()
  if (data.status !== 'success') throw new Error(data.message || 'Erro ao consultar DJEN')
  return data.items ?? []
}

// Busca todas as páginas (a API não informa o total, então paginamos até
// receber menos itens do que o tamanho da página)
export async function searchDjen(params: DjenSearchParams): Promise<DjenItem[]> {
  const pageSize = params.itensPorPagina ?? 100
  const all: DjenItem[] = []
  let pagina = 1
  const MAX_PAGES = 20 // trava de segurança

  while (pagina <= MAX_PAGES) {
    const items = await searchDjenPage({ ...params, itensPorPagina: pageSize, pagina })
    all.push(...items)
    if (items.length < pageSize) break
    pagina++
  }
  return all
}

// Remove tags HTML simples que vêm no campo `texto` do DJEN
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
