import type { ReactNode } from 'react'
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors,
  useDraggable, useDroppable, type DragEndEvent,
} from '@dnd-kit/core'

export function KanbanDndContext({ onDropOnColumn, children }: {
  onDropOnColumn: (itemId: string, columnValue: string) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
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
    <div ref={setNodeRef} className={`${className} rounded-xl transition-colors ${isOver ? 'bg-primary/10 ring-2 ring-primary/40' : ''}`}>
      {children}
    </div>
  )
}

export function DraggableCard({ id, children, className = '' }: { id: string; children: ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={`${className} ${isDragging ? 'opacity-40' : ''} touch-none`}>
      {children}
    </div>
  )
}
