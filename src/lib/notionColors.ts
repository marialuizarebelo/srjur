// Paleta "Notion" (suave) usada em etiquetas e tipos de evento. Os valores reais
// ficam em variáveis CSS (--nc-*) no index.css, que já trocam no tema escuro.
export const NOTION_COLORS = [
  { key: 'red', name: 'Vermelho' },
  { key: 'orange', name: 'Laranja' },
  { key: 'yellow', name: 'Amarelo' },
  { key: 'green', name: 'Verde' },
  { key: 'teal', name: 'Turquesa' },
  { key: 'sky', name: 'Céu' },
  { key: 'blue', name: 'Azul' },
  { key: 'purple', name: 'Roxo' },
  { key: 'pink', name: 'Rosa' },
  { key: 'brown', name: 'Marrom' },
  { key: 'gray', name: 'Cinza' },
] as const

export type NotionColorKey = typeof NOTION_COLORS[number]['key']

export function ncStyle(key: string | undefined) {
  const k = NOTION_COLORS.some(c => c.key === key) ? key : 'gray'
  return {
    bg: `var(--nc-${k}-bg)`,
    text: `var(--nc-${k}-text)`,
    border: `var(--nc-${k}-border)`,
    dot: `var(--nc-${k}-dot)`,
  }
}

// Card "vidro" plano flutuando acima do fundo: painel translúcido com leve tom da cor, borda fina e
// sombra longa e difusa embaixo (a distância do fundo), sem reflexos abaulados.
export function ncGlass(key: string | undefined, strength = 1) {
  const s = ncStyle(key)
  return {
    background: `color-mix(in srgb, ${s.dot} calc(var(--glass-k) * ${strength}%), var(--card-glass))`,
    border: `1px solid color-mix(in srgb, ${s.dot} var(--glass-edge), var(--glass-rim))`,
    boxShadow: [
      'inset 0 1px 0 var(--glass-top)',
      '0 1px 2px var(--glass-contact)',
      `0 14px 28px -14px color-mix(in srgb, ${s.dot} var(--glass-glow), transparent)`,
      '0 34px 60px -26px var(--glass-drop)',
    ].join(', '),
    backdropFilter: 'blur(18px) saturate(1.2)',
  } as const
}
