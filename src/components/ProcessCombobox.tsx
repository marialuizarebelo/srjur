import { ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useState } from 'react'

interface ProcessOption { id: string; title: string; number: string | null; client_id?: string | null }

export function ProcessCombobox({ processes, value, onChange, placeholder = 'Nenhum', allowNone = true }: {
  processes: ProcessOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  allowNone?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = processes.find(p => p.id === value)
  const label = (p: ProcessOption) => p.number ? `${p.title} — ${p.number}` : p.title

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 py-2 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
      >
        <span className={selected ? 'line-clamp-2 font-medium' : 'truncate text-muted-foreground'}>
          {selected ? label(selected) : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-48 p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite pra buscar..." />
          <CommandList>
            <CommandEmpty>Nenhum processo encontrado</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem value="__none__" onSelect={() => { onChange(''); setOpen(false) }}>
                  <span className="text-muted-foreground">Nenhum</span>
                  {!value && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                </CommandItem>
              )}
              {processes.map(p => (
                <CommandItem key={p.id} value={label(p)} onSelect={() => { onChange(p.id); setOpen(false) }}>
                  <span className="truncate">{label(p)}</span>
                  {value === p.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
