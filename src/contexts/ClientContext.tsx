import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from './AuthContext'

interface ClientRecord {
  id: string
  name: string
  email: string | null
  phone: string | null
  cpf_cnpj: string | null
  cep: string | null
  street: string | null
  address_number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  profession: string | null
}

interface ClientContextType {
  client: ClientRecord | null
  loading: boolean
  refresh: () => Promise<void>
}

const ClientContext = createContext<ClientContextType>({ client: null, loading: true, refresh: async () => {} })

const FIELDS = 'id, name, email, phone, cpf_cnpj, cep, street, address_number, complement, neighborhood, city, state, profession'

export function ClientProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [client, setClient] = useState<ClientRecord | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    const { data } = await supabase.from('clients').select(FIELDS).maybeSingle()
    setClient(data as ClientRecord | null)
  }

  useEffect(() => {
    if (!session) { setLoading(false); return }
    load().then(() => setLoading(false))
  }, [session])

  return <ClientContext.Provider value={{ client, loading, refresh: load }}>{children}</ClientContext.Provider>
}

export function useClient() {
  return useContext(ClientContext)
}
