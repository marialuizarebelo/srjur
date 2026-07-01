import { type ReactNode, useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/integrations/supabase/client'
import {
  LayoutDashboard, Scale, DollarSign, FileText, MessageSquare,
  CalendarDays, User, LogOut, Moon, Sun, Bell,
} from 'lucide-react'
import { applyThemeColor } from '@/lib/themeColor'

const NAV = [
  { title: 'Início', url: '/portal', icon: LayoutDashboard },
  { title: 'Meus Processos', url: '/portal/processos', icon: Scale },
  { title: 'Financeiro', url: '/portal/financeiro', icon: DollarSign },
  { title: 'Documentos', url: '/portal/documentos', icon: FileText },
  { title: 'Agenda', url: '/portal/agenda', icon: CalendarDays },
  { title: 'Comunicados', url: '/portal/comunicados', icon: MessageSquare },
  { title: 'Meu Perfil', url: '/portal/perfil', icon: User },
]

export function PortalLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [office, setOffice] = useState<{ name: string; logo_url: string | null }>({ name: 'Escritório', logo_url: null })
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    supabase.from('office_settings').select('name, logo_url, primary_color').limit(1).maybeSingle().then(({ data }) => {
      if (data) setOffice({ name: data.name ?? 'Escritório', logo_url: data.logo_url })
      applyThemeColor(data?.primary_color)
    })
    loadUnread()
  }, [])

  async function loadUnread() {
    const { count } = await supabase.from('portal_messages').select('id', { count: 'exact', head: true }).is('read_at', null)
    setUnread(count ?? 0)
  }

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background border-b border-border/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Row 1: brand + actions */}
          <div className="h-16 flex items-center gap-3">
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
                {office.logo_url ? <img src={office.logo_url} alt="" className="w-full h-full object-cover" /> : 'SR'}
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{office.name}</p>
                <p className="text-[10px] text-muted-foreground">Portal do Cliente</p>
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={toggleTheme} className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center transition-colors">
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>
              <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold overflow-hidden">
                {profile?.photo_url ? <img src={profile.photo_url} alt="" className="w-full h-full object-cover" /> : (profile?.display_name ?? 'C').charAt(0)}
              </div>
              <button onClick={signOut} className="h-9 w-9 rounded-xl hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground" title="Sair">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Row 2: nav, wraps instead of scrolling/cutting off */}
          <nav className="flex flex-wrap items-center gap-1 pb-2.5">
            {NAV.map(item => {
              const active = location.pathname === item.url
              const Icon = item.icon
              return (
                <NavLink key={item.url} to={item.url}
                  className={`flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-medium whitespace-nowrap transition-colors relative ${
                    active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  }`}>
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.title}</span>
                  {item.title === 'Comunicados' && unread > 0 && (
                    <span className="h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center">
                      {unread}
                    </span>
                  )}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
