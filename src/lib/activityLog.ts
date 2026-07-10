import { supabase } from '@/integrations/supabase/client'

export type EntityType = 'deadline' | 'task' | 'client' | 'process' | 'marketing'

// Registra uma movimentação automática (mudança de status, etapa etc.) —
// dispara e esquece, nunca deve travar a ação principal do usuário.
export async function logActivity(entityType: EntityType, entityId: string, text: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    // Guarda o id da linha em "profiles" (não o id de auth.users) — é por
    // esse id que os avatares (ResponsibleAvatars/profilesMap) procuram a
    // usuária, então salvar o id errado aqui deixa a foto sem aparecer.
    const { data: profile } = user
      ? await supabase.from('profiles').select('id, nickname, display_name').eq('user_id', user.id).maybeSingle()
      : { data: null }
    await supabase.from('activity_log').insert({
      entity_type: entityType,
      entity_id: entityId,
      kind: 'activity',
      text,
      user_id: profile?.id ?? null,
      author: profile?.nickname || profile?.display_name || null,
    })
  } catch (e) {
    console.error('logActivity failed:', e)
  }
}
