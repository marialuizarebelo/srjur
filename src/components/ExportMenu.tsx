import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FileDown, FileSpreadsheet, FileText, Loader2 } from 'lucide-react'

interface ExportMenuProps {
  onExcelExport: () => void | Promise<void>
  onPdfExport: () => void | Promise<void>
  label?: string
}

export function ExportMenu({ onExcelExport, onPdfExport, label }: ExportMenuProps) {
  const [loading, setLoading] = useState<'excel' | 'pdf' | null>(null)

  async function handle(type: 'excel' | 'pdf', fn: () => void | Promise<void>) {
    setLoading(type)
    try { await fn() } finally { setLoading(null) }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={!!loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5 mr-1.5" />}
          {label ?? 'Exportar'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handle('excel', onExcelExport)}>
          <FileSpreadsheet className="h-4 w-4 mr-2 text-green-600" />
          Excel completo (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle('pdf', onPdfExport)}>
          <FileText className="h-4 w-4 mr-2 text-red-500" />
          PDF resumido (.pdf)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
