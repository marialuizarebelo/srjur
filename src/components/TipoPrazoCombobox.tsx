import { ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useState } from 'react'
import { TIPOS_PRAZO, getTagColor } from '@/lib/deadlineTypes'

export function TipoPrazoCombobox({ value, onChange, placeholder = 'Nenhum' }: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
      <PopoverContent className="w-(--anchor-width) min-w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite pra buscar..." />
          <CommandList>
            <CommandEmpty>Nenhum tipo encontrado</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => { onChange(''); setOpen(false) }}>
                <span className="text-muted-foreground">Nenhum</span>
                {!value && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
              </CommandItem>
              {TIPOS_PRAZO.map(t => (
                <CommandItem key={t} value={t} onSelect={() => { onChange(t); setOpen(false) }}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getTagColor(t) }} />
                  <span className="truncate">{t}</span>
                  {value === t && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
