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
      <PopoverTrigger asChild>
        <button type="button" className="w-full h-10 flex items-center justify-between gap-2 border rounded-md px-3 hover:border-primary/50 transition-colors bg-background text-left text-sm min-w-0">
          <span className={selected ? 'font-medium truncate' : 'text-muted-foreground truncate'}>
            {selected ? label(selected) : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite pra buscar..." />
          <CommandList>
            <CommandEmpty>Nenhum processo encontrado</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem value="__none__" onSelect={() => { onChange(''); setOpen(false) }}>
                  <span className="text-muted-foreground">Nenhum</span>
                  {!value && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-auto" />}
                </CommandItem>
              )}
              {processes.map(p => (
                <CommandItem key={p.id} value={label(p)} onSelect={() => { onChange(p.id); setOpen(false) }}>
                  <span className="truncate">{label(p)}</span>
                  {value === p.id && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
