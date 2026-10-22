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
    source_description?: string; payment_method?: string | null; business_unit?: string | null
    office_name?: string; office_logo?: string | null; office_color?: string | null
  }
}

// Identidade visual do sistema: azul marinho + bege (mesmos tons da barra lateral e do fundo do app).
const NAVY: [number, number, number] = [15, 27, 51]        // #0F1B33
const INK: [number, number, number] = [20, 33, 61]         // #14213D
const MUTED: [number, number, number] = [107, 118, 145]    // azul-acinzentado
const BEIGE: [number, number, number] = [247, 243, 233]    // #F7F3E9
const BEIGE_DEEP: [number, number, number] = [237, 229, 210]
const BEIGE_TEXT: [number, number, number] = [245, 241, 230] // #F5F1E6

// Quem paga o parceiro depende de onde veio o dinheiro: o que é do sistema (SaaS) é da SRJUR; o resto é do escritório.
const SRJUR_ISSUER = { name: 'SRJUR', cnpj: '57.409.676/0001-50' }
const OFFICE_CNPJ = '67.620.842/0001-17'
function issuerOf(s: PartnerReceipt['snapshot']) {
  return s.business_unit === 'saas' ? SRJUR_ISSUER : { name: s.office_name ?? 'Escritório', cnpj: OFFICE_CNPJ }
}

const dmy = (s?: string | null) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '—')

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
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, H = 297, M = 20
  const logo = await loadImage(s.office_logo)
  const issuer = issuerOf(s)

  // fundo bege na página toda
  doc.setFillColor(...BEIGE); doc.rect(0, 0, W, H, 'F')

  // faixa azul marinho com logo + nome do escritório
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 38, 'F')
  let textX = M
  if (logo) {
    const h = 22, w = Math.min(46, (logo.w / logo.h) * h)
    try {
      doc.setFillColor(...BEIGE_TEXT)
      doc.roundedRect(M - 1.5, 8, w + 3, h, 2.5, 2.5, 'F')
      doc.addImage(logo.data, 'JPEG', M, 8.5, w, h - 1)
      textX = M + w + 9
    } catch { /* logo em formato que o PDF não aceita: segue só com o nome */ }
  }
  doc.setTextColor(...BEIGE_TEXT)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15)
  doc.text(issuer.name, textX, 20)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.setTextColor(152, 162, 188)
  doc.text(`CNPJ ${issuer.cnpj}`, textX, 26)
  doc.text('Recibo de pagamento de comissão de parceria', textX, 31)

  // título + número
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22)
  doc.text('RECIBO', M, 58)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...MUTED)
  doc.text(`Nº ${r.number}`, W - M, 58, { align: 'right' })
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.5); doc.line(M, 62, W - M, 62)

  // valor em destaque
  doc.setFillColor(...BEIGE_DEEP)
  doc.roundedRect(M, 70, W - 2 * M, 25, 3, 3, 'F')
  doc.setFillColor(...NAVY); doc.roundedRect(M, 70, 2.2, 25, 1, 1, 'F')
  doc.setTextColor(...MUTED); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  doc.text('VALOR PAGO', M + 8, 78)
  doc.setTextColor(...INK); doc.setFont('helvetica', 'bold'); doc.setFontSize(23)
  doc.text(fmtBRL(r.amount), M + 8, 89)

  // texto do recibo
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...INK)
  const pct = s.pct != null ? `${String(s.pct).replace('.', ',')}%` : ''
  const texto =
    `${issuer.name}, inscrita no CNPJ ${issuer.cnpj}, pagou a ${s.partner_name ?? 'o(a) parceiro(a)'} a quantia de ${fmtBRL(r.amount)}, ` +
    `referente à comissão de parceria de ${pct} sobre o pagamento recebido do(a) cliente ${s.client_name ?? '—'}` +
    `${s.received_at ? ` em ${dmy(s.received_at)}` : ''}, calculada sobre o valor líquido de ${fmtBRL(Number(s.base_amount ?? 0))}.`
  const linhas = doc.splitTextToSize(texto, W - 2 * M)
  doc.text(linhas, M, 108)

  // detalhes
  let y = 108 + linhas.length * 5.6 + 9
  const row = (label: string, value: string) => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...MUTED)
    doc.text(label.toUpperCase(), M, y)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...INK)
    doc.text(doc.splitTextToSize(value || '—', W - 2 * M - 52), M + 52, y)
    doc.setDrawColor(...BEIGE_DEEP); doc.setLineWidth(0.2); doc.line(M, y + 3, W - M, y + 3)
    y += 9
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

  // rodapé azul marinho
  doc.setFillColor(...NAVY); doc.rect(0, H - 16, W, 16, 'F')
  doc.setFontSize(8); doc.setTextColor(...BEIGE_TEXT)
  doc.text(`${issuer.name} · CNPJ ${issuer.cnpj} · Recibo ${r.number}`, M, H - 9.5)
  doc.setTextColor(152, 162, 188)
  doc.text('Documento gerado automaticamente pelo sistema.', M, H - 4.8)
  return doc
}

export async function downloadPartnerReceipt(r: PartnerReceipt) {
  const doc = await buildPartnerReceiptPdf(r)
  doc.save(`${r.number}.pdf`)
}
