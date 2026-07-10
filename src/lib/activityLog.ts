import { supabase } from '@/integrations/supabase/client'

export type EntityType = 'deadline' | 'task' | 'client' | 'process' | 'marketing'

// Registra uma movimentação automática (mudança de status, etapa etc.) —
// dispara e esquece, nunca deve travar a ação principal do usuário.
export async function logActivity(entityType: EntityType, entityId: string, text: string) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = user
      ? await supabase.from('profiles').select('nickname, display_name').eq('user_id', user.id).maybeSingle()
      : { data: null }
    await supabase.from('activity_log').insert({
      entity_type: entityType,
      entity_id: entityId,
      kind: 'activity',
      text,
      user_id: user?.id ?? null,
      author: profile?.nickname || profile?.display_name || null,
    })
  } catch (e) {
    console.error('logActivity failed:', e)
  }
}
