// Cor de destaque do sistema: 5 temas do Design System SRJUR v2 (coral é o padrão).
// Valores antigos fora dessa lista (cores livres escolhidas antes do redesign) são
// ignorados e o sistema usa o coral.
export const ACCENT_THEMES = [
  { key: 'coral', label: 'Coral (padrão)', value: '#E2654B', light: '#EF8A6E', hover: '#F5A890' },
  { key: 'teal', label: 'Verde-azulado', value: '#2F8F82', light: '#52B0A4', hover: '#7FCBC0' },
  { key: 'violet', label: 'Violeta', value: '#6B5FC9', light: '#8C82DA', hover: '#AEA6E8' },
  { key: 'amber', label: 'Âmbar', value: '#C9893D', light: '#E0A965', hover: '#EDC08A' },
  { key: 'rose', label: 'Rosa', value: '#C4567C', light: '#D97B9B', hover: '#E8A4BC' },
] as const

const VARS = ['--primary', '--primary-foreground', '--ring', '--sidebar-primary', '--sidebar-ring', '--accent-light', '--accent-hover']

export function applyThemeColor(color: string | null | undefined) {
  const root = document.documentElement
  const theme = ACCENT_THEMES.find(t => t.value.toLowerCase() === (color ?? '').toLowerCase())
  if (!theme || theme.key === 'coral') {
    VARS.forEach(v => root.style.removeProperty(v))
    return
  }
  root.style.setProperty('--primary', theme.value)
  root.style.setProperty('--primary-foreground', '#ffffff')
  root.style.setProperty('--ring', theme.light)
  root.style.setProperty('--sidebar-primary', theme.light)
  root.style.setProperty('--sidebar-ring', theme.light)
  root.style.setProperty('--accent-light', theme.light)
  root.style.setProperty('--accent-hover', theme.hover)
}
