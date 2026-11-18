export const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n ?? 0)

export const fmtDate = (d: string) => {
  const date = new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  return date.toLocaleDateString('pt-BR')
}

export const fmtDateLong = (d: Date) =>
  d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

export const humanize = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

export const getDaysDiff = (dateStr: string) => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

// Lê um valor em reais digitado como a pessoa costuma digitar: "R$ 27.459,79", "27.459,79", "15.000", "27459,79", "27459.79".
// Devolve null se não houver número.
export function parseBRL(text: string | number | null | undefined): number | null {
  if (text == null) return null
  if (typeof text === 'number') return Number.isFinite(text) ? text : null
  let s = text.trim().replace(/[^\d.,-]/g, '')
  if (!/\d/.test(s)) return null
  const neg = s.startsWith('-')
  s = s.replace(/-/g, '')
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    // os dois aparecem: o que vem por último é o separador decimal
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (lastComma >= 0) {
    s = (s.match(/,/g) ?? []).length > 1 ? s.replace(/,/g, '') : s.replace(',', '.')
  } else if (lastDot >= 0) {
    // só pontos: "15.000" ou "1.500.000" são milhares; "27459.79" é decimal
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}
