import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

// Atalhos para abrir direto a ficha/pop-up de cada coisa em sua tela (cliente, processo, tarefa, prazo).
export const entityPath = {
  cliente: (id: string) => `/clientes?open=${id}`,
  processo: (id: string) => `/processos?open=${id}`,
  tarefa: (id: string) => `/tarefas?open=${id}`,
  prazo: (id: string) => `/prazos?open=${id}`,
}

export function EntityLink({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      title="Abrir"
      className={`text-left text-primary hover:underline underline-offset-2 ${className}`}
      onClick={e => { e.stopPropagation(); navigate(to) }}
    >
      {children}
    </button>
  )
}
