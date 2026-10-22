import { Check } from 'lucide-react'
import { RECEITA_CATEGORIES, hasCategory } from '@/lib/partners'

// Escolha de categorias de receita (as mesmas do Financeiro) sobre as quais a comissão incide.
export function CategoryChips({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (c: string) => {
    const on = hasCategory(value, c)
    onChange(on ? value.filter(x => x.trim().toLowerCase() !== c.toLowerCase()) : [...value, c])
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {RECEITA_CATEGORIES.map(c => {
        const on = hasCategory(value, c)
        return (
          <button key={c} type="button" onClick={() => toggle(c)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors ${on ? 'bg-primary/10 border-primary/40 text-primary' : 'border-input text-muted-foreground hover:bg-muted'}`}>
            {on && <Check className="h-3 w-3" />}{c}
          </button>
        )
      })}
    </div>
  )
}
