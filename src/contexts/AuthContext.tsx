import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase, setSupportMode } from '@/integrations/supabase/client'

type Role = 'admin' | 'client'

interface Profile {
  id: string
  display_name: string | null
  full_name: string | null
  nickname: string | null
  role: Role
  photo_url: string | null
  role_title: string | null
  allowed_modules: string[] | null
  is_support?: boolean | null
}

interface AuthContextType {
  session: Session | null
  user: User | null
  profile: Profile | null
  role: Role | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    // Login de suporte: liga o "modo suporte" ANTES de publicar o perfil. As telas
    // só montam depois do perfil (ver ProtectedRoutes), então toda busca de dados
    // já sai com o escritório do link. '*' (e não a lista de colunas) pra continuar
    // funcionando em instância onde a coluna is_support ainda não existe.
    setSupportMode(!!(data as Profile | null)?.is_support)
    setProfile(data as Profile | null)
  }

  useEffect(() => {
    let active = true
    let currentUserId: string | null = null

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s)
      currentUserId = s?.user?.id ?? null
      if (s?.user) await fetchProfile(s.user.id)
      if (active) setLoading(false)
    })

    // onAuthStateChange dispara com frequência (renovação de token ao voltar o foco na aba,
    // reconexão de rede etc.) — não podemos colocar a tela inteira em "Carregando" nesses casos,
    // só na primeira carga. Atualizamos sessão/perfil em segundo plano, sem re-exibir o spinner.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s)
      const newUserId = s?.user?.id ?? null
      if (newUserId !== currentUserId) {
        currentUserId = newUserId
        // Limpa o perfil antes de buscar o novo — nunca deixa o role da sessão
        // anterior "vazar" na tela enquanto o perfil da nova sessão carrega.
        setProfile(null)
        setSupportMode(false)
        if (s?.user) await fetchProfile(s.user.id)
      }
    })

    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setSupportMode(false)
    setProfile(null)
  }

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id)
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      loading,
      signIn,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
