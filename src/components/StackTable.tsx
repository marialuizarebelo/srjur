import { useEffect, useRef } from 'react'
import { Table } from '@/components/ui/table'

// Tabela que, em tela pequena (< md), vira uma lista de cartões: cada célula mostra o nome da coluna
// ao lado do valor. Os nomes vêm do cabeçalho (thead), então não precisa rotular célula por célula.
const STACK = [
  'max-md:block max-md:[&_tbody]:block max-md:[&_thead]:hidden',
  'max-md:[&_tr]:block max-md:[&_tr]:border-b max-md:[&_tr]:py-2',
  'max-md:[&_td]:flex max-md:[&_td]:items-start max-md:[&_td]:justify-between max-md:[&_td]:gap-3 max-md:[&_td]:px-3 max-md:[&_td]:py-1',
  'max-md:[&_td]:text-right max-md:[&_td]:whitespace-normal max-md:[&_td]:break-words',
  'max-md:[&_td]:before:content-[attr(data-label)] max-md:[&_td]:before:text-xs max-md:[&_td]:before:text-muted-foreground max-md:[&_td]:before:text-left max-md:[&_td]:before:shrink-0',
  'max-md:[&_td:first-child]:justify-start max-md:[&_td:first-child]:text-left max-md:[&_td:first-child]:text-base max-md:[&_td:first-child]:font-semibold max-md:[&_td:first-child]:before:hidden',
  'max-md:[&_td:empty]:hidden',
].join(' ')

export function StackTable({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  // roda a cada renderização: o conteúdo da tabela muda (filtros, carregamento)
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const heads = Array.from(root.querySelectorAll('thead th')).map(th => (th.textContent ?? '').trim())
    root.querySelectorAll('tbody tr').forEach(tr => {
      Array.from(tr.children).forEach((td, i) => {
        const cell = td as HTMLTableCellElement
        cell.setAttribute('data-label', cell.colSpan > 1 ? '' : (heads[i] ?? ''))
      })
    })
  })
  return <div ref={ref}><Table className={STACK}>{children}</Table></div>
}
