import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Excel ──────────────────────────────────────────────────────────────────────
export function exportExcel(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dados')

  // Auto column width
  const cols = Object.keys(rows[0] ?? {})
  ws['!cols'] = cols.map(k => ({
    wch: Math.max(k.length, ...rows.map(r => String(r[k] ?? '').length), 10),
  }))

  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ── PDF ────────────────────────────────────────────────────────────────────────
interface PdfColumn { header: string; key: string; width?: number }

export function exportPDF(
  title: string,
  subtitle: string,
  columns: PdfColumn[],
  rows: Record<string, unknown>[],
  filename: string,
) {
  const doc = new jsPDF({ orientation: columns.length > 6 ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()

  // Header
  doc.setFillColor(26, 26, 26)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('SRJUR', 12, 10)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Scartezzini & Rebelo Advocacia', 12, 16)

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(title, pageW / 2, 10, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(subtitle, pageW / 2, 16, { align: 'center' })

  const dateStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  doc.text(dateStr, pageW - 12, 10, { align: 'right' })

  // Table
  autoTable(doc, {
    startY: 28,
    head: [columns.map(c => c.header)],
    body: rows.map(r => columns.map(c => String(r[c.key] ?? '—'))),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [26, 26, 26], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { cellWidth: c.width ?? 'auto' }])
    ),
    margin: { left: 12, right: 12 },
  })

  // Footer
  const pages = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(`Página ${i} de ${pages}`, pageW / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' })
  }

  doc.save(`${filename}.pdf`)
}

// ── Helpers de formatação ──────────────────────────────────────────────────────
export function fmtDateBR(s?: string | null) {
  if (!s) return ''
  try { return new Date(s.includes('T') ? s : s + 'T00:00').toLocaleDateString('pt-BR') } catch { return s }
}

export function fmtBRLStr(v?: number | null) {
  if (v == null) return ''
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
