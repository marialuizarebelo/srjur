import { AREA_COLORS } from '@/lib/areaColors'

// Tag colorida por área do direito (mesma cor usada no cadastro e nos processos).
// Aceita o valor salvo em clients.area, que guarda várias áreas separadas por vírgula.
export function AreaTags({ area, className = '' }: { area: string | null | undefined; className?: string }) {
  const areas = (area ?? '').split(',').map(a => a.trim()).filter(Boolean)
  if (areas.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {areas.map(a => {
        const c = AREA_COLORS[a] ?? AREA_COLORS['Outro']
        return (
          <span key={a} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${c.bg} ${c.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${c.dot}`} />
            {a}
          </span>
        )
      })}
    </span>
  )
}
