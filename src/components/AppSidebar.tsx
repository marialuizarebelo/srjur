import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import {
  LayoutDashboard, Users, Scale, ClipboardList, Calendar,
  DollarSign, Megaphone, MessageSquare, Calculator, KeyRound,
  Inbox, Settings, LogOut, Bell, MonitorSmartphone, BarChart3,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/UserAvatar'

// Módulos sempre visíveis independente de restrição (dashboard e as próprias
// configurações — nunca faz sentido travar uma usuária fora da tela onde ela
// troca a própria senha).
const ALWAYS_ALLOWED = ['/', '/configuracoes']

export function isModuleAllowed(url: string, allowedModules: string[] | null | undefined) {
  if (!allowedModules || allowedModules.length === 0) return true // null/vazio = acesso total
  if (ALWAYS_ALLOWED.includes(url)) return true
  const key = url.replace(/^\//, '')
  return allowedModules.includes(key)
}

const sections = [
  {
    label: 'Geral',
    items: [
      { title: 'Painel', url: '/', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Jurídico',
    items: [
      { title: 'Clientes', url: '/clientes', icon: Users },
      { title: 'Processos', url: '/processos', icon: Scale },
      { title: 'Compromissos & Tarefas', url: '/tarefas', icon: ClipboardList },
      { title: 'Prazos', url: '/prazos', icon: Bell },
      { title: 'Calendário', url: '/calendario', icon: Calendar },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { title: 'Métricas e Metas', url: '/metricas', icon: BarChart3 },
      { title: 'Financeiro', url: '/financeiro', icon: DollarSign },
      { title: 'Calculadora', url: '/calculadora', icon: Calculator },
      { title: 'Marketing', url: '/marketing', icon: Megaphone },
      { title: 'Portal do Cliente', url: '/portal-admin', icon: MonitorSmartphone },
      { title: 'Comunicações', url: '/comunicacoes', icon: MessageSquare },
    ],
  },
  {
    label: 'Ferramentas',
    items: [
      { title: 'Intimações', url: '/sistemas', icon: Inbox },
      { title: 'Autenticador', url: '/autenticador', icon: KeyRound },
      { title: 'Configurações', url: '/configuracoes', icon: Settings },
    ],
  },
]

export function AppSidebar() {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const { profile, signOut } = useAuth()
  const location = useLocation()

  const [office, setOffice] = useState<{ name: string; logo_url: string | null }>({
    name: 'SRJUR', logo_url: null,
  })

  useEffect(() => {
    const load = async () => {
      // office_settings deveria ter só 1 linha, mas já teve linhas fantasma
      // criadas por um bug antigo (~200 linhas em branco) — limit(1) sem
      // order pegava uma qualquer, às vezes uma vazia, e o logo sumia. Pegar
      // sempre a mais antiga garante a linha real mesmo se isso se repetir.
      const { data } = await supabase.from('office_settings').select('name, logo_url').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (data) setOffice({ name: data.name ?? 'SRJUR', logo_url: data.logo_url })
    }
    load()
    window.addEventListener('office-settings-updated', load)
    return () => window.removeEventListener('office-settings-updated', load)
  }, [])

  return (
    <Sidebar collapsible="icon" variant="floating" className="border-r-0">
      <SidebarContent
        className="flex flex-col h-full rounded-[28px]"
        style={{
          background: 'linear-gradient(180deg, rgba(20,33,61,0.96) 0%, rgba(13,24,46,0.98) 100%)',
          color: 'var(--sidebar-foreground)',
          border: '1px solid rgba(245,241,230,0.10)',
          boxShadow: 'inset 0 1px 0 rgba(245,241,230,0.10), 0 2px 6px rgba(0,0,0,0.18), 0 28px 60px -24px rgba(11,21,38,0.65)',
        }}
      >
        {/* Brand — logo do escritório; sem logo, usa o monograma SRJUR */}
        <div className="px-5 pt-6 pb-3">
          {!collapsed ? (
            <div className="flex items-center gap-3">
              {office.logo_url
                ? <div className="h-9 w-9 rounded-xl overflow-hidden shrink-0"><img src={office.logo_url} alt="" className="w-full h-full object-cover" /></div>
                : <img src="/brand/srjur-monogram-cream.png" alt="SRJUR" className="h-9 w-9 object-contain shrink-0" />}
              <div className="min-w-0">
                <p className="font-display text-base text-[var(--sidebar-primary-foreground)] leading-tight">SRJUR</p>
                <p className="text-[11px] text-[var(--sidebar-foreground)] truncate max-w-[140px]">{office.name}</p>
              </div>
            </div>
          ) : (
            office.logo_url
              ? <div className="h-9 w-9 rounded-xl mx-auto overflow-hidden"><img src={office.logo_url} alt="" className="w-full h-full object-cover" /></div>
              : <img src="/brand/srjur-monogram-cream.png" alt="SRJUR" className="h-9 w-9 object-contain mx-auto" />
          )}
        </div>

        {/* Nav */}
        <div className="flex-1 overflow-y-auto no-scrollbar py-1">
          {sections.map(section => {
            const visibleItems = section.items.filter(item => isModuleAllowed(item.url, profile?.allowed_modules))
            if (visibleItems.length === 0) return null
            return (
            <SidebarGroup key={section.label} className="px-2.5 py-1.5">
              <SidebarGroupLabel className="text-[#7F8BA6] text-[10px] font-bold uppercase tracking-[0.18em] px-3 mb-1">
                {!collapsed && section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map(item => {
                    const isActive = location.pathname === item.url ||
                      (item.url !== '/' && location.pathname.startsWith(item.url))
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          isActive={isActive}
                          className="nav-item h-10 px-2.5 gap-2.5 text-[var(--sidebar-foreground)] font-medium hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] data-active:text-[var(--sidebar-accent-foreground)] data-active:font-bold"
                          render={<NavLink to={item.url} />}
                        >
                          <item.icon className="h-[17px] w-[17px] nav-icon" />
                          {!collapsed && <span>{item.title}</span>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-3 pt-2 space-y-2">
          {!collapsed && profile && (
            <div className="flex items-center gap-2.5 rounded-2xl px-3 py-2.5" style={{ background: 'linear-gradient(180deg, rgba(245,241,230,0.08), rgba(245,241,230,0.04))', border: '1px solid rgba(245,241,230,0.10)', boxShadow: 'inset 0 1px 0 rgba(245,241,230,0.08)' }}>
              <UserAvatar
                name={profile.nickname || profile.display_name}
                photoUrl={profile.photo_url}
                color="var(--sidebar-primary)"
                className="h-8 w-8 text-xs"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[var(--sidebar-primary-foreground)] truncate">
                  {profile.nickname || profile.display_name}
                </p>
                <p className="text-[11px] text-[#6E7A94] truncate">
                  {profile.role_title ?? profile.role}
                </p>
              </div>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start rounded-xl text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sair</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  )
}
