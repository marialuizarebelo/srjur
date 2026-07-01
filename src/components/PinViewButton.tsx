import { Pin, PinOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PinViewButton({ isPinned, currentValue, onPin, onUnpin }: {
  isPinned: boolean
  currentValue: string
  onPin: (v: string) => void
  onUnpin: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      title={isPinned ? 'Desafixar visualização padrão' : 'Fixar esta visualização como padrão'}
      onClick={() => (isPinned ? onUnpin() : onPin(currentValue))}
    >
      {isPinned ? <Pin className="h-3.5 w-3.5 fill-current text-primary" /> : <PinOff className="h-3.5 w-3.5" />}
    </Button>
  )
}
