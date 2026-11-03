import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog'

export interface CardFieldDef { key: string; label: string }

// Botão "Campos": abre a janela para escolher o que aparece nos cartões da tela.
export function CardFieldsButton({ defs, fields, onChange, onReset, className = '' }: {
  defs: CardFieldDef[]
  fields: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
  onReset: () => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" className={`shrink-0 ${className}`} onClick={() => setOpen(true)}>
        <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" />Campos
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[380px] w-[96vw] p-6">
          <DialogHeader>
            <DialogTitle>Campos visíveis no card</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2 max-h-[60vh] overflow-y-auto">
            {defs.map(f => (
              <div key={f.key} className="flex items-center gap-3">
                <Checkbox id={`cf-${f.key}`} checked={!!fields[f.key]} onCheckedChange={v => onChange({ ...fields, [f.key]: !!v })} />
                <Label htmlFor={`cf-${f.key}`} className="cursor-pointer">{f.label}</Label>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground pt-1">A escolha fica salva no seu usuário.</p>
          <DialogFooter className="pt-3">
            <Button variant="outline" size="sm" onClick={onReset}>Restaurar padrão</Button>
            <DialogClose render={<Button size="sm" />}>OK</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
