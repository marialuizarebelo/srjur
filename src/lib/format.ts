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
