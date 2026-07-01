import type { ReactNode } from 'react'
import { usePrivacy } from '@/contexts/PrivacyContext'

export function Sensitive({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { hidden } = usePrivacy()
  if (!hidden) return <>{children}</>
  return <span className={`blur-sm select-none ${className}`} aria-hidden="true">{children}</span>
}
