// Edge Function: create-team-user
// Permite que uma admin principal crie outras usuárias admin (equipe) direto
// pelo sistema, sem precisar acessar o painel do Supabase — com senha
// provisória e módulos liberados definidos na hora da criação.
// Limite de 3 usuárias admin POR ESCRITÓRIO (dono + até 2 adicionais).
//
// Deploy: cole em Supabase Dashboard → Edge Functions → New Function
// (nome da função: create-team-user). Desative "Verify JWT".

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

// Login de suporte do SRJUR (profiles.is_support) vale em todos os escritorios:
// o escritorio vem do link em que ele esta (cabecalho x-tenant-slug, que o front
// so manda quando o login e de suporte). Para qualquer outra pessoa o cabecalho
// e ignorado. Escritorio inexistente = tenant_id null = sem acesso.
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

    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) return json({ error: 'Token inválido' }, 401)

    const { data: callerRow } = await adminClient
      .from('profiles').select('*').eq('user_id', caller.id).maybeSingle()
    const callerProfile = await applySupportTenant(req, callerRow)
    if (callerProfile?.role !== 'admin' || !callerProfile.tenant_id) {
      return json({ error: 'Apenas administradoras podem criar usuárias' }, 403)
    }
    // A nova usuária SEMPRE nasce no escritório de quem está criando.
    const tenantId = callerProfile.tenant_id

    const { email, password, display_name, role_title, allowed_modules } = await req.json()
    if (!email || !password) {
      return json({ error: 'E-mail e senha são obrigatórios' }, 400)
    }
    if (password.length < 6) {
      return json({ error: 'A senha precisa ter ao menos 6 caracteres' }, 400)
    }

    // Limite vale POR ESCRITÓRIO (antes contava o banco inteiro). O login de
    // suporte do SRJUR (is_support) não ocupa vaga. Conta em JS, lendo '*', pra
    // continuar funcionando mesmo em instância onde a coluna is_support ainda
    // não existe (04_suporte_protegido.sql não rodado).
    const { data: admins } = await adminClient
      .from('profiles').select('*').eq('role', 'admin').eq('tenant_id', tenantId)
    const count = (admins ?? []).filter((p: { is_support?: boolean | null }) => !p.is_support).length
    if (count >= 3) {
      return json({ error: 'Limite de 3 usuárias administradoras atingido' }, 400)
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
      // app_metadata só o servidor grava: é daqui que o trigger handle_new_user
      // tira papel e escritório (nunca do que o próprio usuário informa).
      app_metadata: { role: 'admin', tenant_id: tenantId },
    })
    if (createError) return json({ error: createError.message }, 400)

    const userId = created?.user?.id
    if (!userId) return json({ error: 'Não foi possível criar a usuária' }, 500)

    // O trigger on_auth_user_created já cria o profile (admin, deste escritório)
    // a partir do app_metadata — só completamos com os dados extras.
    await adminClient.from('profiles').update({
      tenant_id: tenantId,
      role: 'admin',
      display_name: display_name ?? email,
      role_title: role_title ?? null,
      allowed_modules: allowed_modules ?? null,
      created_by: caller.id,
    }).eq('user_id', userId)

    return json({ success: true, user_id: userId })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
