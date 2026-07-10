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
      <PopoverTrigger asChild>
        <button type="button" className="w-full h-10 flex items-center justify-between gap-2 border rounded-md px-3 hover:border-primary/50 transition-colors bg-background text-left text-sm min-w-0">
          {value ? (
            <span className="flex items-center gap-1.5 truncate">
              <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: getTagColor(value) }} />
              <span className="truncate font-medium">{value}</span>
            </span>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite pra buscar..." />
          <CommandList>
            <CommandEmpty>Nenhum tipo encontrado</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => { onChange(''); setOpen(false) }}>
                <span className="text-muted-foreground">Nenhum</span>
                {!value && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-auto" />}
              </CommandItem>
              {TIPOS_PRAZO.map(t => (
                <CommandItem key={t} value={t} onSelect={() => { onChange(t); setOpen(false) }}>
                  <span className="h-2 w-2 rounded-full shrink-0 mr-1.5" style={{ backgroundColor: getTagColor(t) }} />
                  <span className="truncate">{t}</span>
                  {value === t && <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-auto" />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
