import jsPDF from 'jspdf'
import { fmtBRL } from '@/lib/format'

// Dados congelados no momento em que o repasse é marcado como pago (partner_receipts.snapshot),
// pra o recibo sair sempre igual, mesmo se o parceiro ou o escritório mudarem depois.
export interface PartnerReceipt {
  number: string
  amount: number
  paid_at: string
  snapshot: {
    partner_name?: string; partner_document?: string | null; partner_oab?: string | null; partner_pix?: string | null
    client_name?: string; pct?: number; base_amount?: number; received_at?: string
    source_description?: string; payment_method?: string | null
    office_name?: string; office_logo?: string | null; office_color?: string | null
  }
}

const dmy = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')

function hexToRgb(hex?: string | null): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim())
  if (!m) return [207, 140, 147]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

async function loadImage(url?: string | null): Promise<{ data: string; w: number; h: number } | null> {
  if (!url) return null
  try {
    const blob = await (await fetch(url)).blob()
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(blob)
    })
    const dim = await new Promise<{ w: number; h: number }>((res, rej) => {
      const i = new Image(); i.onload = () => res({ w: i.width, h: i.height }); i.onerror = rej; i.src = data
    })
    return { data, ...dim }
  } catch { return null }
}

export async function buildPartnerReceiptPdf(r: PartnerReceipt): Promise<jsPDF> {
  const s = r.snapshot
  const [cr, cg, cb] = hexToRgb(s.office_color)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 20
  const logo = await loadImage(s.office_logo)

  // faixa de cabeçalho com a cor do escritório
  doc.setFillColor(cr, cg, cb)
  doc.rect(0, 0, W, 34, 'F')
  let textX = M
  if (logo) {
    const h = 20, w = Math.min(46, (logo.w / logo.h) * h)
    try {
      doc.setFillColor(255, 255, 255)
      doc.roundedRect(M - 2, 7, w + 4, h + 0, 2, 2, 'F')
      doc.addImage(logo.data, 'JPEG', M, 7, w, h)
      textX = M + w + 8
    } catch { /* logo em formato que o PDF não aceita: segue só com o nome */ }
  }
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text(s.office_name ?? 'Escritório', textX, 18)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('Recibo de pagamento de comissão de parceria', textX, 24)

  // título + número
  doc.setTextColor(40, 40, 40)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  doc.text('RECIBO', M, 54)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 110, 110)
  doc.text(`Nº ${r.number}`, W - M, 54, { align: 'right' })
  doc.setDrawColor(cr, cg, cb); doc.setLineWidth(0.6); doc.line(M, 58, W - M, 58)

  // valor em destaque
  const tint = (c: number) => Math.round(c + (255 - c) * 0.86)
  doc.setFillColor(tint(cr), tint(cg), tint(cb))
  doc.roundedRect(M, 66, W - 2 * M, 24, 3, 3, 'F')
  doc.setTextColor(110, 110, 110); doc.setFontSize(9)
  doc.text('VALOR PAGO', M + 6, 74)
  doc.setTextColor(30, 30, 30); doc.setFont('helvetica', 'bold'); doc.setFontSize(22)
  doc.text(fmtBRL(r.amount), M + 6, 85)

  // texto do recibo
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(50, 50, 50)
  const pct = s.pct != null ? `${String(s.pct).replace('.', ',')}%` : ''
  const texto =
    `${s.office_name ?? 'O escritório'} pagou a ${s.partner_name ?? 'o(a) parceiro(a)'} a quantia de ${fmtBRL(r.amount)}, ` +
    `referente à comissão de parceria de ${pct} sobre o pagamento recebido do(a) cliente ${s.client_name ?? '—'}` +
    `${s.received_at ? ` em ${dmy(s.received_at)}` : ''}, calculada sobre o valor líquido de ${fmtBRL(Number(s.base_amount ?? 0))}.`
  const linhas = doc.splitTextToSize(texto, W - 2 * M)
  doc.text(linhas, M, 104)

  // detalhes
  let y = 104 + linhas.length * 5.6 + 8
  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(110, 110, 110)
    doc.text(label.toUpperCase(), M, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(40, 40, 40)
    doc.text(doc.splitTextToSize(value || '—', W - 2 * M - 52), M + 52, y)
    y += 8
  }
  row('Parceiro(a)', s.partner_name ?? '')
  if (s.partner_document) row('CPF / CNPJ', s.partner_document)
  if (s.partner_oab) row('OAB', s.partner_oab)
  row('Cliente indicado', s.client_name ?? '')
  if (s.source_description) row('Pagamento de origem', s.source_description)
  row('Recebido em', dmy(s.received_at))
  row('Comissão', `${pct} sobre ${fmtBRL(Number(s.base_amount ?? 0))}`)
  row('Pago em', dmy(r.paid_at))
  if (s.payment_method) row('Forma de pagamento', s.payment_method)
  if (s.partner_pix) row('Chave PIX', s.partner_pix)

  // rodapé
  doc.setDrawColor(210, 210, 210); doc.setLineWidth(0.3); doc.line(M, 270, W - M, 270)
  doc.setFontSize(8); doc.setTextColor(140, 140, 140)
  doc.text(`${s.office_name ?? ''} · Recibo ${r.number}`, M, 276)
  doc.text('Documento gerado automaticamente pelo sistema.', W - M, 276, { align: 'right' })
  return doc
}

export async function downloadPartnerReceipt(r: PartnerReceipt) {
  const doc = await buildPartnerReceiptPdf(r)
  doc.save(`${r.number}.pdf`)
}
