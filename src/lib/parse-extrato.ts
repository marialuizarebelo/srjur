import { parse as parseOFX } from 'ofx-js'

export interface ExtratoTransaction {
  date: string
  description: string
  value: number
  type: 'receita' | 'despesa'
  raw_id?: string
}

export async function parseOFXFile(text: string): Promise<ExtratoTransaction[]> {
  const data = await parseOFX(text)
  const transactions: ExtratoTransaction[] = []

  const stmtrs =
    data?.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS ??
    data?.OFX?.CREDITCARDMSGSRSV1?.CCSTMTTRNRS?.CCSTMTRS

  const list = stmtrs?.BANKTRANLIST?.STMTTRN ?? []
  const items = Array.isArray(list) ? list : [list]

  for (const tx of items) {
    if (!tx) continue
    let amount = parseFloat(tx.TRNAMT)
    const dateRaw = tx.DTPOSTED?.slice(0, 8) ?? ''
    const date = dateRaw
      ? `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
      : ''

    transactions.push({
      date,
      description: tx.MEMO || tx.NAME || 'Sem descrição',
      value: Math.abs(amount),
      type: amount >= 0 ? 'receita' : 'despesa',
      raw_id: tx.FITID,
    })
  }

  return transactions
}

export function parseCSVFile(text: string): ExtratoTransaction[] {
  const transactions: ExtratoTransaction[] = []
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const header = lines[0].toLowerCase()
  const sep = header.includes(';') ? ';' : ','

  const cols = header.split(sep).map(c => c.trim().replace(/"/g, ''))

  const dateIdx = cols.findIndex(c => /data|date/.test(c))
  const descIdx = cols.findIndex(c => /descri|memo|hist|detail/.test(c))
  const valIdx = cols.findIndex(c => /valor|value|amount|quantia/.test(c))

  if (dateIdx === -1 || valIdx === -1) return []

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''))
    if (row.length <= valIdx) continue

    const rawDate = row[dateIdx]
    let date = rawDate
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
      const [d, m, y] = rawDate.split('/')
      date = `${y}-${m}-${d}`
    }

    let rawVal = row[valIdx]
    // "1.234,56" (BR format) → has both . and , with , after .
    // "50.00" (US/Nubank format) → has . but no ,
    // "50,00" (BR simple) → has , but no .
    if (rawVal.includes(',') && rawVal.includes('.')) {
      // BR thousands: 1.234,56 → 1234.56
      rawVal = rawVal.replace(/\./g, '').replace(',', '.')
    } else if (rawVal.includes(',') && !rawVal.includes('.')) {
      // BR decimal only: 50,00 → 50.00
      rawVal = rawVal.replace(',', '.')
    }
    // else: already US format like 50.00 — keep as is
    const amount = parseFloat(rawVal)
    if (isNaN(amount)) continue

    transactions.push({
      date,
      description: descIdx >= 0 ? row[descIdx] : 'Sem descrição',
      value: Math.abs(amount),
      type: amount >= 0 ? 'receita' : 'despesa',
    })
  }

  return transactions
}

export function parseExtrato(fileName: string, text: string): Promise<ExtratoTransaction[]> | ExtratoTransaction[] {
  const ext = fileName.toLowerCase().split('.').pop()
  if (ext === 'ofx' || ext === 'ofc') return parseOFXFile(text)
  if (ext === 'csv' || ext === 'txt') return parseCSVFile(text)
  return []
}
