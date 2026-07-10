// Cores por área do direito — estilo Notion. Usado tanto no cadastro de
// clientes quanto nos cards/tags de processo, pra manter a mesma cor da
// mesma área em qualquer lugar do sistema.
export const AREA_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Cível':           { bg: 'bg-blue-100 dark:bg-blue-900/40',       text: 'text-blue-700 dark:text-blue-300',       dot: 'bg-blue-500'    },
  'Trabalhista':     { bg: 'bg-orange-100 dark:bg-orange-900/40',   text: 'text-orange-700 dark:text-orange-300',   dot: 'bg-orange-500'  },
  'Família':         { bg: 'bg-pink-100 dark:bg-pink-900/40',       text: 'text-pink-700 dark:text-pink-300',       dot: 'bg-pink-500'    },
  'Sucessões':       { bg: 'bg-purple-100 dark:bg-purple-900/40',   text: 'text-purple-700 dark:text-purple-300',   dot: 'bg-purple-500'  },
  'Empresarial':     { bg: 'bg-teal-100 dark:bg-teal-900/40',       text: 'text-teal-700 dark:text-teal-300',       dot: 'bg-teal-500'    },
  'Consumidor':      { bg: 'bg-yellow-100 dark:bg-yellow-900/40',   text: 'text-yellow-700 dark:text-yellow-300',   dot: 'bg-yellow-500'  },
  'Penal':           { bg: 'bg-red-100 dark:bg-red-900/40',         text: 'text-red-700 dark:text-red-300',         dot: 'bg-red-500'     },
  'Criminal':        { bg: 'bg-red-100 dark:bg-red-900/40',         text: 'text-red-700 dark:text-red-300',         dot: 'bg-red-500'     },
  'Tributário':      { bg: 'bg-indigo-100 dark:bg-indigo-900/40',   text: 'text-indigo-700 dark:text-indigo-300',   dot: 'bg-indigo-500'  },
  'Imobiliário':     { bg: 'bg-amber-100 dark:bg-amber-900/40',     text: 'text-amber-700 dark:text-amber-300',     dot: 'bg-amber-500'   },
  'Previdenciário':  { bg: 'bg-cyan-100 dark:bg-cyan-900/40',       text: 'text-cyan-700 dark:text-cyan-300',       dot: 'bg-cyan-500'    },
  'Administrativo':  { bg: 'bg-slate-100 dark:bg-slate-800',        text: 'text-slate-700 dark:text-slate-300',     dot: 'bg-slate-500'   },
  'Outro':           { bg: 'bg-gray-100 dark:bg-gray-800',          text: 'text-gray-600 dark:text-gray-400',       dot: 'bg-gray-400'    },
}

export function getAreaColor(area: string | null | undefined) {
  return AREA_COLORS[area ?? ''] ?? AREA_COLORS['Outro']
}
