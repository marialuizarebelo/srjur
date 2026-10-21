import { ChevronDown, Check, Plus, Settings2, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { toast } from 'sonner'
import { getTagColor } from '@/lib/deadlineTypes'
import { useDeadlineTypes } from '@/lib/useDeadlineTypes'

export function TipoPrazoCombobox({ value, onChange, placeholder = 'Nenhum' }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [manageOpen, setManageOpen] = useState(false)
  const { all, custom, add, remove } = useDeadlineTypes()

  const typed = search.replace(/\s+/g, ' ').trim()
  const canCreate = typed.length > 0 && !all.some(t => t.toLowerCase() === typed.toLowerCase())

  async function createTyped() {
    const name = await add(typed)
    if (!name) { toast.error('Não foi possível criar o tipo de prazo'); return }
    onChange(name)
    setSearch('')
    setOpen(false)
    toast.success(`Tipo "${name}" criado`)
  }

  return (
    <>
      <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setSearch('') }}>
        <PopoverTrigger
          className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getTagColor(value) }} />
              <span className="truncate font-medium">{value}</span>
            </span>
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent className="w-(--anchor-width) min-w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="Digite para buscar ou criar..." value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>{canCreate ? 'Nenhum tipo com esse nome.' : 'Nenhum tipo encontrado'}</CommandEmpty>
              <CommandGroup>
                <CommandItem value="__none__" onSelect={() => { onChange(''); setOpen(false) }}>
                  <span className="text-muted-foreground">Nenhum</span>
                  {!value && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                </CommandItem>
                {all.map(t => (
                  <CommandItem key={t} value={t} onSelect={() => { onChange(t); setOpen(false) }}>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getTagColor(t) }} />
                    <span className="truncate">{t}</span>
                    {value === t && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
            <div className="border-t p-1">
              {canCreate && (
                <button type="button" onClick={createTyped}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-primary hover:bg-muted">
                  <Plus className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Criar tipo "{typed}"</span>
                </button>
              )}
              <button type="button" onClick={() => { setOpen(false); setManageOpen(true) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted">
                <Settings2 className="h-3.5 w-3.5" />Gerenciar meus tipos
              </button>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-[420px] w-[96vw] p-6">
          <DialogHeader><DialogTitle>Meus tipos de prazo</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Os tipos que você criou aparecem aqui. Excluir um tipo não apaga os prazos que já o usam, eles só deixam de oferecer esse tipo na lista.</p>
          <div className="space-y-1.5 pt-2">
            {custom.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 text-center">Você ainda não criou nenhum tipo. Para criar, digite o nome no campo de tipo do prazo e escolha "Criar tipo".</p>
            ) : custom.map(c => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getTagColor(c.name) }} />
                <span className="flex-1 truncate text-sm">{c.name}</span>
                <button type="button" onClick={() => remove(c.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive" title="Excluir tipo">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <DialogFooter className="pt-2">
            <DialogClose render={<Button variant="outline" />}>Fechar</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
