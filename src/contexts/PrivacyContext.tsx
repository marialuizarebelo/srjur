import { createContext, useContext, useState, type ReactNode } from 'react'

interface PrivacyContextType {
  hidden: boolean
  toggleHidden: () => void
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined)

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState<boolean>(() => sessionStorage.getItem('srjur-privacy') === '1')

  const toggleHidden = () => setHidden(h => {
    const next = !h
    sessionStorage.setItem('srjur-privacy', next ? '1' : '0')
    return next
  })

  return (
    <PrivacyContext.Provider value={{ hidden, toggleHidden }}>
      {children}
    </PrivacyContext.Provider>
  )
}

export function usePrivacy() {
  const ctx = useContext(PrivacyContext)
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider')
  return ctx
}
