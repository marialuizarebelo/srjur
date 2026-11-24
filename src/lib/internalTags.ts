// Marcas internas que o banco grava no começo das observações do financeiro (ex.: "[espelho:<id>] ").
// Servem para o sistema achar a parcela espelho da parceria; a usuária não deve ver nem editar isso.
const TAG = /\[espelho:[0-9a-fA-F-]{36}\]\s*/g

/** Observações sem as marcas internas (para mostrar na tela e exportar). */
export function hideInternalTags(notes: string | null | undefined): string {
  return (notes ?? '').replace(TAG, '').trim()
}

/** Só as marcas internas (para devolvê-las ao salvar, sem a usuária ver). */
export function internalTagsOf(notes: string | null | undefined): string {
  return (notes ?? '').match(TAG)?.join('') ?? ''
}
