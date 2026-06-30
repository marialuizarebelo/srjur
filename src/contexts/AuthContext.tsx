import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/integrations/supabase/client'

type Role = 'admin' | 'client'

interface Profile {
  id: string
  display_name: string | null
  full_name: string | null
  nickname: string | null
  role: Role
  photo_url: string | null
  role_title: string | null
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
      .select('id, display_name, full_name, nickname, role, photo_url, role_title')
      .eq('user_id', userId)
      .maybeSingle()
    setProfile(data as Profile | null)
  }

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s)
      if (s?.user) await fetchProfile(s.user.id)
      if (active) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setLoading(true)
      setSession(s)
      if (s?.user) await fetchProfile(s.user.id)
      else setProfile(null)
      if (active) setLoading(false)
    })

    return () => { active = false; subscription.unsubscribe() }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error as Error | null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
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
