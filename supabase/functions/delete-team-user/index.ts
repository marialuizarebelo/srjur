// Edge Function: delete-team-user
// Exclui um usuário da equipe (Configurações > Usuários): remove o login e o perfil. O que a pessoa cadastrou
// (clientes, processos, tarefas, prazos) continua no sistema, só perde o "criado por".
//
// Quem pode: administradora com ACESSO TOTAL do mesmo escritório (ou o suporte do SRJUR). Nunca: a si mesma,
// o perfil de suporte, outro escritório, nem a última administradora com acesso total.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-slug',
}
const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// acesso total = allowed_modules vazio/nulo (ou suporte do SRJUR)
const isFullAccess = (p: any) => !!p && (p.is_support || !p.allowed_modules || p.allowed_modules.length === 0)

// Login de suporte do SRJUR vale em todos os escritórios: o escritório vem do link (x-tenant-slug).
async function applySupportTenant(req: Request, profile: any) {
  if (!profile?.is_support) return profile
  const slug = req.headers.get('x-tenant-slug')?.trim().toLowerCase()
  if (!slug) return profile
  const { data: t } = await adminClient.from('tenants').select('id').eq('slug', slug).maybeSingle()
  return { ...profile, tenant_id: t?.id ?? null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autenticado' }, 401)
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) return json({ error: 'Token inválido' }, 401)

    const { data: callerRow } = await adminClient.from('profiles').select('*').eq('user_id', caller.id).maybeSingle()
    const callerProfile = await applySupportTenant(req, callerRow)
    if (callerProfile?.role !== 'admin') return json({ error: 'Apenas administradoras podem excluir usuárias' }, 403)
    if (!isFullAccess(callerProfile)) return json({ error: 'Seu acesso é limitado: só quem tem acesso total exclui usuárias.' }, 403)
    const tenantAware = 'tenant_id' in callerProfile
    if (tenantAware && !callerProfile.tenant_id) return json({ error: 'Escritório não identificado' }, 403)

    const { profile_id } = await req.json()
    if (!profile_id) return json({ error: 'Informe a usuária a excluir' }, 400)

    const { data: target } = await adminClient.from('profiles').select('*').eq('id', profile_id).maybeSingle()
    // outro escritório = "não existe" (nunca revela nada de fora)
    if (!target || (tenantAware && target.tenant_id !== callerProfile.tenant_id)) return json({ error: 'Usuária não encontrada' }, 404)
    if (target.is_support) return json({ error: 'O perfil de suporte do SRJUR não pode ser excluído' }, 403)
    if (target.user_id === caller.id) return json({ error: 'Você não pode excluir o seu próprio usuário' }, 400)

    // sempre precisa sobrar ao menos uma administradora com acesso total
    if (target.role === 'admin' && isFullAccess(target)) {
      let q = adminClient.from('profiles').select('id, allowed_modules, is_support').eq('role', 'admin').neq('id', target.id)
      if (tenantAware) q = q.eq('tenant_id', callerProfile.tenant_id)
      const { data: outras } = await q
      if (!(outras ?? []).some((p: any) => !p.is_support && isFullAccess(p))) {
        return json({ error: 'Não é possível excluir a única administradora com acesso total' }, 400)
      }
    }

    const { data: userId, error: rpcError } = await adminClient.rpc('remove_team_user', { p_profile_id: target.id })
    if (rpcError) return json({ error: 'Não foi possível excluir: ' + rpcError.message }, 500)

    const { error: delError } = await adminClient.auth.admin.deleteUser((userId as string) ?? target.user_id)
    if (delError && !/not found/i.test(delError.message)) return json({ error: 'Perfil removido, mas o login não: ' + delError.message }, 500)

    return json({ success: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
