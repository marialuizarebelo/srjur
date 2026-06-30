import { Card, CardContent } from '@/components/ui/card'
import { Construction } from 'lucide-react'

export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Construction className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Módulo em construção</p>
          <p className="text-sm mt-1">Este módulo será implementado em breve.</p>
        </CardContent>
      </Card>
    </div>
  )
}
