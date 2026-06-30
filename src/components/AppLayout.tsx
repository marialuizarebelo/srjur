import { useState, useEffect, type ReactNode } from 'react'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Bell, Search, X } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Moon, Sun } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

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
  const [searchOpen, setSearchOpen] = useState(false)
  useDynamicFavicon()

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto min-w-0">

          {/* Topbar */}
          <div className="flex items-center gap-2 border-b px-3 py-2 md:px-6 sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
            <SidebarTrigger className="shrink-0" />

            {/* Busca — expansível no mobile, sempre visível no desktop */}
            {searchOpen ? (
              /* Mobile: busca em tela cheia */
              <div className="flex flex-1 items-center gap-2 md:hidden">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    placeholder="Buscar..."
                    className="pl-9 h-9 bg-muted/50 border-0"
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSearchOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop: barra de busca central */}
                <div className="hidden md:flex flex-1 justify-center max-w-xl mx-auto">
                  <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar..."
                      className="pl-9 h-9 bg-muted/50 border-0"
                    />
                  </div>
                </div>

                {/* Spacer no mobile para empurrar ícones à direita */}
                <div className="flex-1 md:hidden" />

                <div className="flex items-center gap-1 shrink-0">
                  {/* Ícone de busca só no mobile */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 md:hidden"
                    onClick={() => setSearchOpen(true)}
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Bell className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleTheme}>
                    {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
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
