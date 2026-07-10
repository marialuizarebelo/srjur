import { ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useState } from 'react'

interface ClientOption { id: string; name: string }

export function ClientCombobox({ clients, value, onChange, placeholder = 'Nenhum', allowNone = true }: {
  clients: ClientOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  allowNone?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = clients.find(c => c.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:hover:bg-input/50"
      >
        <span className={selected ? 'truncate font-medium' : 'truncate text-muted-foreground'}>
          {selected ? selected.name : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-(--anchor-width) min-w-48 p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite pra buscar..." />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
            <CommandGroup>
              {allowNone && (
                <CommandItem value="__none__" onSelect={() => { onChange(''); setOpen(false) }}>
                  <span className="text-muted-foreground">Nenhum</span>
                  {!value && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                </CommandItem>
              )}
              {clients.map(c => (
                <CommandItem key={c.id} value={c.name} onSelect={() => { onChange(c.id); setOpen(false) }}>
                  <span className="truncate">{c.name}</span>
                  {value === c.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
