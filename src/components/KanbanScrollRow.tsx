import { useRef, useState, useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Wrapper pra linhas de kanban com scroll horizontal — em vez de depender da
// barra de rolagem lá embaixo (que obriga rolar até o fim da tela pra poder
// navegar os cards), mostra setinhas fixas nos cantos superiores.
export function KanbanScrollRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canLeft, setCanLeft] = useState(false)
  const [canRight, setCanRight] = useState(false)

  function updateArrows() {
    const el = ref.current
    if (!el) return
    setCanLeft(el.scrollLeft > 4)
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    updateArrows()
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', updateArrows)
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateArrows); ro.disconnect() }
  }, [children])

  function scrollBy(dir: 1 | -1) {
    ref.current?.scrollBy({ left: dir * 320, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {canLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          className="hidden md:flex absolute -top-1 left-0 z-10 h-7 w-7 rounded-full border bg-background shadow-sm items-center justify-center hover:bg-muted transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {canRight && (
        <button
          type="button"
          onClick={() => scrollBy(1)}
          className="hidden md:flex absolute -top-1 right-0 z-10 h-7 w-7 rounded-full border bg-background shadow-sm items-center justify-center hover:bg-muted transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
      <div ref={ref} className={`flex flex-col md:flex-row md:overflow-x-auto scrollbar-thin ${className}`}>
        {children}
      </div>
    </div>
  )
}
