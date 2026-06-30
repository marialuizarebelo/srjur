import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/integrations/supabase/client'
import {
  LayoutDashboard, Users, Scale, ClipboardList, Calendar,
  DollarSign, Megaphone, MessageSquare, Calculator, KeyRound,
  Inbox, Settings, LogOut, Bell, MonitorSmartphone,
} from 'lucide-react'
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

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
    name: 'Scartezzini & Rebelo', logo_url: null,
  })

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('office_settings').select('name, logo_url').limit(1).maybeSingle()
      if (data) setOffice({ name: data.name ?? 'Scartezzini & Rebelo', logo_url: data.logo_url })
    }
    load()
    window.addEventListener('office-settings-updated', load)
    return () => window.removeEventListener('office-settings-updated', load)
  }, [])

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarContent
        className="flex flex-col h-full"
        style={{ backgroundColor: 'var(--sidebar-background)', color: 'var(--sidebar-foreground)' }}
      >
        {/* Brand */}
        <div className="px-4 py-4">
          {!collapsed ? (
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-[var(--sidebar-primary)] flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0">
                {office.logo_url
                  ? <img src={office.logo_url} alt="" className="w-full h-full object-cover" />
                  : 'SR'}
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--sidebar-primary-foreground)]">SRJUR</p>
                <p className="text-xs text-[var(--sidebar-foreground)] truncate max-w-[140px]">{office.name}</p>
              </div>
            </div>
          ) : (
            <div className="h-9 w-9 rounded-xl bg-[var(--sidebar-primary)] flex items-center justify-center text-white font-bold text-sm mx-auto overflow-hidden">
              {office.logo_url
                ? <img src={office.logo_url} alt="" className="w-full h-full object-cover" />
                : 'SR'}
            </div>
          )}
        </div>

        <Separator className="bg-[var(--sidebar-border)]" />

        {/* Nav */}
        <div className="flex-1 overflow-y-auto py-2">
          {sections.map(section => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel className="text-[var(--sidebar-foreground)] opacity-60 text-xs uppercase tracking-wider">
                {!collapsed && section.label}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map(item => {
                    const isActive = location.pathname === item.url ||
                      (item.url !== '/' && location.pathname.startsWith(item.url))
                    return (
                      <SidebarMenuItem key={item.url}>
                        <SidebarMenuButton
                          isActive={isActive}
                          className="text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-[var(--sidebar-accent-foreground)] data-[active=true]:bg-[var(--sidebar-accent)] data-[active=true]:text-[var(--sidebar-primary)]"
                          render={<NavLink to={item.url} />}
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </div>

        <Separator className="bg-[var(--sidebar-border)]" />

        {/* Footer */}
        <div className="p-3 space-y-2">
          {!collapsed && profile && (
            <div className="flex items-center gap-2 px-2 py-1">
              <div className="h-7 w-7 rounded-full bg-[var(--sidebar-primary)] flex items-center justify-center text-white text-xs font-medium">
                {profile.display_name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[var(--sidebar-accent-foreground)] truncate">
                  {profile.display_name}
                </p>
                <p className="text-[10px] text-[var(--sidebar-foreground)] truncate">
                  {profile.role_title ?? profile.role}
                </p>
              </div>
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="w-full justify-start text-[var(--sidebar-foreground)] hover:bg-[var(--sidebar-accent)] hover:text-red-400"
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Sair</span>}
          </Button>
        </div>
      </SidebarContent>
    </Sidebar>
  )
}
