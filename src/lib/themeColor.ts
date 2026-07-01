// Aplica a cor de destaque escolhida pelo escritório em todo o sistema
// (botões, links, sidebar), sobrescrevendo o rosa padrão via CSS custom properties.
export function applyThemeColor(color: string | null | undefined) {
  const root = document.documentElement
  if (!color) {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--primary-foreground')
    root.style.removeProperty('--ring')
    root.style.removeProperty('--sidebar-primary')
    root.style.removeProperty('--sidebar-ring')
    return
  }
  root.style.setProperty('--primary', color)
  root.style.setProperty('--primary-foreground', '#ffffff')
  root.style.setProperty('--ring', color)
  root.style.setProperty('--sidebar-primary', color)
  root.style.setProperty('--sidebar-ring', color)
}
