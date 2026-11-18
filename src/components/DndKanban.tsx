import { useSyncExternalStore, type ReactNode } from 'react'
import { GripVertical } from 'lucide-react'
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent,
} from '@dnd-kit/core'

// Celular/tablet: tela de toque, onde arrastar o dedo precisa ROLAR a página. Lá os cards só se movem pelos
// "pontinhos" laterais; no computador (mouse) continua arrastando pelo card inteiro.
function subscribeTouch(cb: () => void) {
  const mq = window.matchMedia('(pointer: coarse)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getTouch = () => window.matchMedia('(pointer: coarse)').matches
export function useCoarsePointer() {
  return useSyncExternalStore(subscribeTouch, getTouch, () => false)
}

export function KanbanDndContext({ onDropOnColumn, children }: {
  onDropOnColumn: (itemId: string, columnValue: string) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // no toque só chega aqui quem pegou o cabo de arrastar, então não precisa segurar para ativar
    useSensor(TouchSensor, { activationConstraint: { distance: 4 } }),
  )

  function handleDragEnd(e: DragEndEvent) {
    const columnValue = e.over?.id
    const itemId = e.active?.id
    if (columnValue && itemId) onDropOnColumn(String(itemId), String(columnValue))
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {children}
    </DndContext>
  )
}

export function DroppableColumn({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={`${className} rounded-2xl transition-colors ${isOver ? 'bg-primary/10 ring-2 ring-primary/40' : ''}`}>
      {children}
    </div>
  )
}

export function DraggableCard({ id, children, className = '', noTouchDrag = false }: {
  id: string
  children: ReactNode
  className?: string
  /** em tela de toque não permite arrastar (itens pequenos demais para ter cabo); no mouse arrasta normalmente */
  noTouchDrag?: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const touch = useCoarsePointer()
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined

  if (touch) {
    if (noTouchDrag) return <div className={className}>{children}</div>
    return (
      <div ref={setNodeRef} style={style} className={`${className} flex items-stretch gap-1 ${isDragging ? 'opacity-40' : ''}`}>
        <div className="flex-1 min-w-0">{children}</div>
        <button
          type="button"
          aria-label="Segure e arraste para mover"
          title="Segure e arraste para mover"
          className="shrink-0 w-7 rounded-lg bg-muted/60 text-muted-foreground flex items-center justify-center active:bg-muted"
          style={{ touchAction: 'none' }}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={`${className} ${isDragging ? 'opacity-40' : ''} touch-none`}>
      {children}
    </div>
  )
}
