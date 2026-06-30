import { useState, useEffect, type ReactNode } from 'react'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { Button } from '@/components/ui/button'
import { Search, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/integrations/supabase/client'
import { GlobalSearch } from '@/components/GlobalSearch'
import { NotificationsPanel } from '@/components/NotificationsPanel'

function useDynamicFavicon() {
  useEffect(() => {
    supabase
      .from('office_settings')
      .select('name, logo_url')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        if (data.name) document.title = data.name
        if (data.logo_url) {
          const link = document.querySelector<HTMLLinkElement>("link[rel='icon']")
          if (link) link.href = data.logo_url
          // apple touch icon também
          const apple = document.querySelector<HTMLLinkElement>("link[rel='apple-touch-icon']")
          if (apple) apple.href = data.logo_url
        }
      })
  }, [])
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme()
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false)
  useDynamicFavicon()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setGlobalSearchOpen(v => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto min-w-0">

          {/* Topbar */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center gap-2 px-3 py-2 md:px-6">
            <SidebarTrigger className="shrink-0" />

            {/* Busca global — botão no mobile, barra clicável no desktop */}
            {/* Desktop: barra de busca central clicável */}
            <button
              onClick={() => setGlobalSearchOpen(true)}
              className="hidden md:flex flex-1 max-w-sm mx-auto items-center gap-2 h-9 px-3 rounded-xl bg-muted/60 hover:bg-muted transition-colors text-sm text-muted-foreground border border-transparent hover:border-border/50"
            >
              <Search className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 text-left">Buscar no sistema...</span>
              <kbd className="text-[10px] bg-background/80 border rounded px-1.5 py-0.5 font-mono hidden lg:inline">Ctrl K</kbd>
            </button>

            {/* Spacer mobile */}
            <div className="flex-1 md:hidden" />

            <div className="flex items-center gap-1 shrink-0">
              {/* Ícone de busca no mobile */}
              <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setGlobalSearchOpen(true)}>
                <Search className="h-4 w-4" />
              </Button>
              <NotificationsPanel />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </Button>
            </div>

            <GlobalSearch open={globalSearchOpen} onOpenChange={setGlobalSearchOpen} />
          </div>
          </div>

          {/* Conteúdo da página */}
          <div className="p-3 md:px-6 md:py-5 max-w-[1600px] mx-auto w-full">
            {children}
          </div>

        </main>
      </div>
    </SidebarProvider>
  )
}
