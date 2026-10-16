// Cores salvas no banco com a paleta antiga (saturada) são exibidas na paleta harmônica do DS v2.
const SOFT: Record<string, string> = {
  '#8b5cf6': '#8577C9',
  '#a855f7': '#A07BC9',
  '#d946ef': '#B873B8',
  '#6366f1': '#7A84C9',
  '#3b82f6': '#6A8FC7',
  '#0ea5e9': '#5AA5C4',
  '#06b6d4': '#5AA9B5',
  '#ef4444': '#D96C87',
  '#f43f5e': '#D96C87',
  '#f87171': '#E794A9',
  '#fca5a5': '#EDB3C0',
  '#e57373': '#D98095',
  '#fb4c2f': '#E2654B',
  '#6b7280': '#6E7A94',
  '#9ca3af': '#8A93AA',
  '#f59e0b': '#D9A441',
  '#eab308': '#D9A441',
  '#f0c040': '#E0B35A',
  '#f97316': '#E2654B',
  '#fb923c': '#EF8A6E',
  '#ff9e66': '#EF8A6E',
  '#10b981': '#6E9C7D',
  '#22c55e': '#6E9C7D',
  '#16a34a': '#5D8A6D',
  '#86efac': '#8FC7A2',
  '#84cc16': '#8FA96A',
  '#14b8a6': '#5FA39A',
  '#ec4899': '#C4567C',
  '#f08bbb': '#D97B9B',
}

export function soft(color: string | null | undefined): string | undefined {
  if (!color) return undefined
  return SOFT[color.toLowerCase()] ?? color
}
