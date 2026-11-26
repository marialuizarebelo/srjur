// Estados (UF) e identificação automática do estado pelo número do processo (padrão CNJ).
// Número CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO  (J = ramo da Justiça, TR = tribunal, OOOO = unidade de origem).
// Só identifica quando é seguro (um tribunal = um estado); nos demais casos fica vazio para escolher na mão.

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const

// Justiça Estadual (8), Eleitoral (6) e Militar estadual (7): código oficial do tribunal (01 = AC ... 25 = SE, 26 = SP, 27 = TO)
const CODIGO_UF = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'SP', 'TO']
const POR_CODIGO_UF: Record<number, string> = Object.fromEntries(CODIGO_UF.map((u, i) => [i + 1, u]))
// Justiça do Trabalho (5): TRT 1..24 (TRTs que cobrem mais de um estado ficam com o estado da sede)
const TRT: Record<number, string> = {
  1: 'RJ', 2: 'SP', 3: 'MG', 4: 'RS', 5: 'BA', 6: 'PE', 7: 'CE', 8: 'PA', 9: 'PR', 10: 'DF', 11: 'AM', 12: 'SC',
  13: 'PB', 14: 'RO', 15: 'SP', 16: 'MA', 17: 'ES', 18: 'GO', 19: 'AL', 20: 'SE', 21: 'RN', 22: 'PI', 23: 'MT', 24: 'MS',
}

export function ufFromCnj(numero: string | null | undefined): string | null {
  const d = String(numero ?? '').replace(/\D/g, '')
  if (d.length !== 20) return null
  const j = Number(d[13]), tr = Number(d.slice(14, 16)), origem = d.slice(16, 20)
  if (j === 8 || j === 6 || j === 7) return POR_CODIGO_UF[tr] ?? null
  if (j === 5) return TRT[tr] ?? null
  if (j === 4) {
    if (tr === 6) return 'MG'                                              // TRF6 = Minas Gerais
    if (tr === 4) return origem.startsWith('70') ? 'PR' : origem.startsWith('71') ? 'RS' : origem.startsWith('72') ? 'SC' : null   // TRF4 por seção judiciária
  }
  return null
}
