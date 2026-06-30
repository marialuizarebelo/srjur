import { useState, useRef } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { parseExtrato, type ExtratoTransaction } from '@/lib/parse-extrato'
import { fmtBRL, fmtDate } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  Upload, AlertTriangle, Check, ArrowUpCircle, ArrowDownCircle, FileText,
} from 'lucide-react'

interface ExistingRow {
  date: string
  value: number
}

interface ParsedItem extends ExtratoTransaction {
  isDuplicate: boolean
  selected: boolean
}

interface ImportExtratoProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}

export function ImportExtrato({ open, onOpenChange, onComplete }: ImportExtratoProps) {
  const [items, setItems] = useState<ParsedItem[]>([])
  const [step, setStep] = useState<'upload' | 'review' | 'done'>('upload')
  const [importing, setImporting] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setItems([])
    setStep('upload')
    setImporting(false)
    setImportedCount(0)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const parsed = await parseExtrato(file.name, text)

    if (!parsed || parsed.length === 0) {
      alert('Não foi possível ler o arquivo. Verifique se é um extrato OFX ou CSV válido.')
      return
    }

    const { data: existing } = await supabase
      .from('finance')
      .select('date, value')

    const existingRows: ExistingRow[] = (existing ?? []) as ExistingRow[]

    const reviewed: ParsedItem[] = parsed.map(tx => {
      const isDuplicate = existingRows.some(
        ex => ex.date === tx.date && Math.abs(Number(ex.value) - tx.value) < 0.01
      )
      return { ...tx, isDuplicate, selected: !isDuplicate }
    })

    setItems(reviewed)
    setStep('review')
  }

  const toggleItem = (index: number) => {
    setItems(prev => prev.map((item, i) =>
      i === index ? { ...item, selected: !item.selected } : item
    ))
  }

  const selectAll = (val: boolean) => {
    setItems(prev => prev.map(item => ({ ...item, selected: val })))
  }

  const handleImport = async () => {
    setImporting(true)
    const toImport = items.filter(i => i.selected)

    const inserts = toImport.map(tx => ({
      type: tx.type,
      description: tx.description,
      value: tx.value,
      date: tx.date,
      paid: true,
      nature: 'real' as const,
      impacts_cash: true,
      origin: 'Extrato bancário',
      portal_visible: false,
    }))

    if (inserts.length > 0) {
      const batchSize = 50
      for (let i = 0; i < inserts.length; i += batchSize) {
        const { error } = await supabase.from('finance').insert(inserts.slice(i, i + batchSize))
        if (error) {
          console.error('Erro ao importar:', error)
          alert(`Erro ao importar: ${error.message}`)
          setImporting(false)
          return
        }
      }
    }

    setImportedCount(inserts.length)
    setStep('done')
    setImporting(false)
  }

  const totalSelected = items.filter(i => i.selected).length
  const totalDuplicates = items.filter(i => i.isDuplicate).length
  const totalReceitas = items.filter(i => i.selected && i.type === 'receita').reduce((s, i) => s + i.value, 0)
  const totalDespesas = items.filter(i => i.selected && i.type === 'despesa').reduce((s, i) => s + i.value, 0)

  return (
    <Dialog open={open} onOpenChange={o => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent className="max-w-[680px] w-[96vw] max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Extrato Bancário
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Upload */}
        {step === 'upload' && (
          <div className="py-12 text-center space-y-6">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-medium text-lg">Selecione o arquivo do extrato</p>
              <p className="text-sm text-muted-foreground mt-1">
                Formatos aceitos: OFX, CSV ou TXT
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Baixe o extrato do seu banco (Nubank, Itaú, Bradesco, Inter, etc.)
              </p>
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept=".ofx,.ofc,.csv,.txt"
                onChange={handleFile}
                className="hidden"
              />
              <Button size="lg" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Escolher arquivo
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-muted/50">
              <div className="text-sm">
                <span className="font-semibold">{items.length}</span> transações encontradas
              </div>
              {totalDuplicates > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {totalDuplicates} possíveis duplicatas
                </Badge>
              )}
              <div className="ml-auto flex items-center gap-3 text-sm">
                <span className="text-green-600 font-medium">+{fmtBRL(totalReceitas)}</span>
                <span className="text-red-500 font-medium">-{fmtBRL(totalDespesas)}</span>
              </div>
            </div>

            {/* Select all */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={totalSelected === items.length}
                  onCheckedChange={(v) => selectAll(!!v)}
                />
                <span className="text-sm text-muted-foreground">
                  {totalSelected} de {items.length} selecionados
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Itens marcados em amarelo podem ser duplicatas — confira antes de importar
              </p>
            </div>

            {/* Transaction list */}
            <div className="max-h-[350px] overflow-y-auto overflow-x-hidden space-y-1.5">
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 p-3 rounded-lg border transition-colors ${
                    item.isDuplicate
                      ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
                      : 'bg-background'
                  } ${!item.selected ? 'opacity-50' : ''}`}
                >
                  <Checkbox
                    checked={item.selected}
                    onCheckedChange={() => toggleItem(idx)}
                  />

                  <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{
                    backgroundColor: item.type === 'receita' ? '#dcfce7' : '#fee2e2',
                  }}>
                    {item.type === 'receita'
                      ? <ArrowUpCircle className="h-4 w-4 text-green-600" />
                      : <ArrowDownCircle className="h-4 w-4 text-red-500" />
                    }
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{fmtDate(item.date)}</span>
                      {item.isDuplicate && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">
                          <AlertTriangle className="h-3 w-3 mr-0.5" />
                          Duplicata?
                        </Badge>
                      )}
                    </div>
                  </div>

                  <p className={`text-sm font-semibold whitespace-nowrap ${
                    item.type === 'receita' ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {item.type === 'receita' ? '+' : '-'}{fmtBRL(item.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* STEP 3: Done */}
        {step === 'done' && (
          <div className="py-12 text-center space-y-4">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <p className="font-medium text-lg">Importação concluída!</p>
            <p className="text-sm text-muted-foreground">
              {importedCount} lançamentos importados com sucesso.
            </p>
          </div>
        )}

        <DialogFooter className="pt-4">
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => { reset() }}>Voltar</Button>
              <Button
                onClick={handleImport}
                disabled={importing || totalSelected === 0}
              >
                {importing ? 'Importando...' : `Importar ${totalSelected} lançamentos`}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => { onOpenChange(false); reset(); onComplete() }}>
              Fechar
            </Button>
          )}
          {step === 'upload' && (
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
