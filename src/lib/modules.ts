import { useAuth } from '@/contexts/AuthContext'
import { isModuleAllowed } from '@/components/AppSidebar'

// Mesma regra do banco (funções module_allowed / is_unrestricted): allowed_modules vazio ou nulo = acesso total.
// A tela esconde o que a pessoa não pode ver; quem garante de verdade é o banco.
export function useModuleAccess() {
  const { profile } = useAuth()
  const mods = profile?.allowed_modules
  return {
    can: (key: string) => isModuleAllowed('/' + key, mods),
    canAny: (keys: string[]) => keys.some(k => isModuleAllowed('/' + k, mods)),
    full: !mods || mods.length === 0,
  }
}
