import { useState } from 'react'
import {
  DndContext, PointerSensor, TouchSensor, useSensor, useSensors, closestCenter, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Palette } from 'lucide-react'

// Paleta ampliada — as 10 cores "clássicas" de etapa + a mesma faixa de tons
// usada na cor de preferência do sistema (Configurações), pra dar mais opção
// sem ficar uma sopa de cores aleatórias.
export const EXTENDED_STAGE_COLORS = [
  '#E2654B', '#EF8A6E', '#D9A441', '#8FA96A', '#6E9C7D', '#5FA39A', '#5AA5C4',
  '#6A8FC7', '#8577C9', '#A07BC9', '#C4567C', '#D96C87', '#6E7A94',
]

export function StageColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXTENDED_STAGE_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${value.toLowerCase() === c.toLowerCase() ? 'border-foreground scale-110' : 'border-transparent'}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label
        className="h-6 w-6 rounded-full border-2 border-dashed border-border flex items-center justify-center cursor-pointer overflow-hidden relative shrink-0"
        title="Cor personalizada"
      >
        <Palette className="h-3 w-3 text-muted-foreground" />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
    </div>
  )
}

export interface StageRowItem {
  id: string
  label: string
  color: string
}

function SortableStageRow({ item, children }: { item: StageRowItem; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground shrink-0" title="Arrastar para reordenar">
        <GripVertical className="h-4 w-4" />
      </button>
      {children}
    </div>
  )
}

// Lista de etapas arrastável — cada item já vem com id/label/color; o resto
// (botões de editar/excluir) é passado via renderActions pra cada tela poder
// manter seus próprios botões e comportamentos.
export function SortableStageList({ items, onReorder, renderActions }: {
  items: StageRowItem[]
  onReorder: (newOrder: StageRowItem[]) => void
  renderActions: (item: StageRowItem) => React.ReactNode
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  )

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex(i => i.id === active.id)
    const newIndex = items.findIndex(i => i.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    onReorder(arrayMove(items, oldIndex, newIndex))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {items.map(item => (
            <SortableStageRow key={item.id} item={item}>
              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-sm flex-1 truncate">{item.label}</span>
              {renderActions(item)}
            </SortableStageRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
