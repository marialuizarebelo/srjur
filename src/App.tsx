import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes, Navigate, useParams, useLocation } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { PrivacyProvider } from '@/contexts/PrivacyContext'
import { ClientProvider, ClientPreviewProvider } from '@/contexts/ClientContext'
import { AppLayout } from '@/components/AppLayout'
import { PortalLayout } from '@/components/PortalLayout'
import PortalDashboard from '@/pages/portal/PortalDashboard'
import PortalProcessos from '@/pages/portal/PortalProcessos'
import PortalFinanceiro from '@/pages/portal/PortalFinanceiro'
import PortalDocumentos from '@/pages/portal/PortalDocumentos'
import PortalAgenda from '@/pages/portal/PortalAgenda'
import PortalComunicados from '@/pages/portal/PortalComunicados'
import PortalPerfil from '@/pages/portal/PortalPerfil'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/Login'
import Clientes from '@/pages/Clientes'
import Processos from '@/pages/Processos'
import Tarefas from '@/pages/Tarefas'
import Prazos from '@/pages/Prazos'
import Financeiro from '@/pages/Financeiro'
import Calendario from '@/pages/Calendario'
import Comunicacoes from '@/pages/Comunicacoes'
import Calculadora from '@/pages/Calculadora'
import SistemasEletronicos from '@/pages/SistemasEletronicos'
import Configuracoes from '@/pages/Configuracoes'
import Marketing from '@/pages/Marketing'
import Autenticador from '@/pages/Autenticador'
import PortalAdmin from '@/pages/PortalAdmin'
import Placeholder from '@/pages/Placeholder'
import './index.css'

const queryClient = new QueryClient()

// Pré-visualização do portal do cliente, acessada pela admin a partir de /portal-admin.
// Usa o mesmo layout/páginas do portal real, mas com o cliente forçado por id
// (em vez de derivado do login), já que quem está navegando é a admin.
function PortalPreviewRoutes() {
  const { clientId } = useParams<{ clientId: string }>()
  if (!clientId) return <Navigate to="/portal-admin" replace />
  const basePath = `/preview/${clientId}`
  return (
    <ClientPreviewProvider clientId={clientId}>
      <PortalLayout basePath={basePath} previewMode>
        <Routes>
          <Route path="/preview/:clientId" element={<PortalDashboard />} />
          <Route path="/preview/:clientId/processos" element={<PortalProcessos />} />
          <Route path="/preview/:clientId/financeiro" element={<PortalFinanceiro />} />
          <Route path="/preview/:clientId/documentos" element={<PortalDocumentos />} />
          <Route path="/preview/:clientId/agenda" element={<PortalAgenda />} />
          <Route path="/preview/:clientId/comunicados" element={<PortalComunicados />} />
          <Route path="/preview/:clientId/perfil" element={<PortalPerfil />} />
        </Routes>
      </PortalLayout>
    </ClientPreviewProvider>
  )
}

function AdminRoutes() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/processos" element={<Processos />} />
        <Route path="/tarefas" element={<Tarefas />} />
        <Route path="/prazos" element={<Prazos />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/calculadora" element={<Calculadora />} />
        <Route path="/marketing" element={<Marketing />} />
        <Route path="/comunicacoes" element={<Comunicacoes />} />
        <Route path="/sistemas" element={<SistemasEletronicos />} />
        <Route path="/autenticador" element={<Autenticador />} />
        <Route path="/portal-admin" element={<PortalAdmin />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  )
}

function PortalRoutes() {
  return (
    <ClientProvider>
      <PortalLayout>
        <Routes>
          <Route path="/portal" element={<PortalDashboard />} />
          <Route path="/portal/processos" element={<PortalProcessos />} />
          <Route path="/portal/financeiro" element={<PortalFinanceiro />} />
          <Route path="/portal/documentos" element={<PortalDocumentos />} />
          <Route path="/portal/agenda" element={<PortalAgenda />} />
          <Route path="/portal/comunicados" element={<PortalComunicados />} />
          <Route path="/portal/perfil" element={<PortalPerfil />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </PortalLayout>
    </ClientProvider>
  )
}

function ProtectedRoutes() {
  const { session, loading, role } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />

  if (role === 'admin' && location.pathname.startsWith('/preview/')) return <PortalPreviewRoutes />

  if (role === 'client') return <PortalRoutes />

  return <AdminRoutes />
}

function AppRoutes() {
  const { session } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/*" element={<ProtectedRoutes />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <PrivacyProvider>
          <TooltipProvider>
            <Toaster />
            <AuthProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </AuthProvider>
          </TooltipProvider>
        </PrivacyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
