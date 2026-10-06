// Edge Function: create-client-user
// Cria diretamente um usuário de portal para um cliente já cadastrado,
// com e-mail + senha provisória definidos no momento da criação.
// Usa a service_role key (disponível automaticamente no ambiente da function)
// para chamar a Admin API do Supabase Auth — nunca exposta ao navegador.
//
// Deploy: cole este código em Supabase Dashboard → Edge Functions → New Function
// (nome da função: create-client-user)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-slug',
}

// Login de suporte do SRJUR (profiles.is_support) vale em todos os escritorios:
// o escritorio vem do link em que ele esta (cabecalho x-tenant-slug, que o front
// so manda quando o login e de suporte). Para qualquer outra pessoa o cabecalho
// e ignorado. Escritorio inexistente = tenant_id null = sem acesso.
async function applySupportTenant(req: Request, profile: any) {
  if (!profile?.is_support) return profile
  const slug = req.headers.get('x-tenant-slug')?.trim().toLowerCase()
  if (!slug) return profile
  const { data: t } = await createClient(SUPABASE_URL, SERVICE_ROLE_KEY).from('tenants').select('id').eq('slug', slug).maybeSingle()
  return { ...profile, tenant_id: t?.id ?? null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: corsHeaders })
    }

    // Cliente "caller" — valida quem está chamando, usando o token do usuário logado
    const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller } } = await callerClient.auth.getUser()
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: corsHeaders })
    }

    // Confere se quem chamou é admin
    const { data: callerRow } = await callerClient
      .from('profiles').select('*').eq('user_id', caller.id).maybeSingle()
    const callerProfile = await applySupportTenant(req, callerRow)
    if (callerProfile?.role !== 'admin' || !callerProfile.tenant_id) {
      return new Response(JSON.stringify({ error: 'Apenas administradoras podem criar acesso de cliente' }), { status: 403, headers: corsHeaders })
    }

    const { email, password, display_name, client_id } = await req.json()
    if (!email || !password || !client_id) {
      return new Response(JSON.stringify({ error: 'E-mail, senha e client_id são obrigatórios' }), { status: 400, headers: corsHeaders })
    }

    // Cliente admin — usa a service role para operações privilegiadas
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const tenantId = callerProfile.tenant_id

    // O cliente tem que ser do MESMO escritório de quem está criando o acesso.
    const { data: clientRow } = await adminClient
      .from('clients').select('id').eq('id', client_id).eq('tenant_id', tenantId).maybeSingle()
    if (!clientRow) {
      return new Response(JSON.stringify({ error: 'Cliente não encontrado neste escritório' }), { status: 404, headers: corsHeaders })
    }

    // Cria o usuário já com e-mail confirmado e senha definida — sem precisar de e-mail de convite
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name },
      app_metadata: { role: 'client', tenant_id: tenantId },
    })

    let userId = created?.user?.id

    if (createError) {
      const isAlreadyExists = createError.message?.toLowerCase().includes('already')
      if (!isAlreadyExists) {
        return new Response(JSON.stringify({ error: createError.message }), { status: 400, headers: corsHeaders })
      }
      // Usuário já existe — atualiza a senha dele em vez de criar de novo
      const { data: list } = await adminClient.auth.admin.listUsers({ perPage: 1000 })
      const existing = list.users.find(u => u.email?.toLowerCase() === String(email).toLowerCase())
      if (existing) {
        // SEGURANÇA: só redefine a senha se esse login já é cliente DESTE escritório.
        // Sem isso, uma admin de outro escritório poderia tomar a conta de qualquer e-mail.
        const { data: existingProfile } = await adminClient
          .from('profiles').select('role, tenant_id').eq('user_id', existing.id).maybeSingle()
        if (existingProfile?.tenant_id !== tenantId || existingProfile?.role !== 'client') {
          return new Response(JSON.stringify({ error: 'Este e-mail já é usado em outro acesso e não pode ser reaproveitado aqui' }), { status: 409, headers: corsHeaders })
        }
        await adminClient.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
        userId = existing.id
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Não foi possível criar/atualizar o usuário' }), { status: 500, headers: corsHeaders })
    }

    // O trigger on_auth_user_created cria o profile como 'admin' por padrão — corrige para 'client'
    await adminClient.from('profiles').upsert({
      user_id: userId,
      display_name: display_name ?? email,
      role: 'client',
      tenant_id: tenantId,
    }, { onConflict: 'user_id' })

    return new Response(JSON.stringify({ success: true, user_id: userId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders })
  }
})
