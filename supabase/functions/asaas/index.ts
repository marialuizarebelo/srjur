// Edge Function: asaas
// Integração com a API do Asaas (cobranças, status de pagamento, parcelamento).
// A chave de API nunca é exposta ao navegador — fica só aqui, como secret.
//
// Deploy: cole em Supabase Dashboard → Edge Functions → New Function
// (nome da função: asaas). Desative "Verify JWT".
//
// Secret necessária (Edge Functions → Manage secrets):
//   ASAAS_API_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY')!
const ASAAS_BASE_URL = 'https://api.asaas.com/v3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

async function asaasFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${ASAAS_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      access_token: ASAAS_API_KEY,
      ...(init?.headers ?? {}),
    },
  })
  const data = await res.json()
  if (!res.ok) {
    const msg = data.errors?.map((e: any) => e.description).join('; ') ?? JSON.stringify(data)
    throw new Error(msg)
  }
  return data
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const callerClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization: authHeader } } })
  const { data: { user } } = await callerClient.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  const { data: profile } = await adminClient.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'admin') throw new Error('Apenas administradoras')
}

// ── Garante que o cliente existe no Asaas, criando se necessário ─────────
async function ensureAsaasCustomer(clientId: string): Promise<string> {
  const { data: client } = await adminClient.from('clients').select('*').eq('id', clientId).maybeSingle()
  if (!client) throw new Error('Cliente não encontrado')
  if (client.asaas_customer_id) return client.asaas_customer_id

  const customer = await asaasFetch('/customers', {
    method: 'POST',
    body: JSON.stringify({
      name: client.name,
      email: client.email || undefined,
      phone: client.phone?.replace(/\D/g, '') || undefined,
      cpfCnpj: client.cpf_cnpj?.replace(/\D/g, '') || undefined,
      externalReference: client.id,
    }),
  })

  await adminClient.from('clients').update({ asaas_customer_id: customer.id }).eq('id', clientId)
  return customer.id
}

// ── Criar cobrança (única, parcelada ou assinatura recorrente) ───────────
async function handleCreateCharge(req: Request) {
  await requireAdmin(req)
  const {
    client_id, description, value, due_date, category, billing_type,
    installment_count, recurring, cycle, process_id, responsible,
    interest_percent, fine_percent, discount_percent, discount_days_before,
  } = await req.json()

  if (!client_id || !description || !value || !due_date) {
    return json({ error: 'client_id, description, value e due_date são obrigatórios' }, 400)
  }

  const customerId = await ensureAsaasCustomer(client_id)
  const finalCategory = category || 'Honorários'

  // Juros, multa e desconto — opcionais, mesma estrutura que o Asaas usa
  // tanto pra cobrança avulsa quanto parcelamento/assinatura
  const interest = interest_percent ? { value: interest_percent } : undefined
  const fine = fine_percent ? { value: fine_percent, type: 'PERCENTAGE' } : undefined
  const discount = discount_percent
    ? { value: discount_percent, dueDateLimitDays: discount_days_before ?? 0, type: 'PERCENTAGE' }
    : undefined

  // ── Assinatura recorrente ──
  if (recurring) {
    const sub = await asaasFetch('/subscriptions', {
      method: 'POST',
      body: JSON.stringify({
        customer: customerId,
        billingType: billing_type || 'UNDEFINED',
        value,
        nextDueDate: due_date,
        cycle: cycle || 'MONTHLY',
        description,
        interest, fine, discount,
      }),
    })

    // Registra a assinatura de qualquer forma, mesmo que a 1ª cobrança ainda
    // não esteja disponível — assim a sincronização sempre vai saber que ela existe
    await adminClient.from('asaas_subscriptions').insert({
      id: sub.id, client_id, category: finalCategory,
      process_id: process_id || null, responsible: responsible || null, description,
    })

    // a assinatura já gera a primeira cobrança, mas pode levar um instante
    // pra aparecer na consulta — tenta algumas vezes antes de desistir
    let charge: any = null
    for (let attempt = 0; attempt < 3 && !charge; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1200))
      const list = await asaasFetch(`/payments?subscription=${sub.id}`)
      charge = (list.data ?? [])[0] ?? null
    }

    if (!charge) {
      return json({
        success: true, subscription: sub, charges: [],
        warning: 'Assinatura criada, mas a primeira cobrança ainda não apareceu. Clique em "Sincronizar Asaas" em alguns segundos pra trazê-la pro Financeiro.',
      })
    }

    const { data: row, error: insertError } = await adminClient.from('finance').insert({
      type: 'receita', category: finalCategory, description,
      value: charge.value, date: new Date().toISOString().slice(0, 10), due_date: charge.dueDate,
      paid: charge.status === 'RECEIVED' || charge.status === 'CONFIRMED',
      client_id, process_id: process_id || null, responsible: responsible || null,
      payment_link: charge.invoiceUrl,
      asaas_charge_id: charge.id, asaas_status: charge.status, asaas_invoice_url: charge.invoiceUrl,
      asaas_subscription_id: sub.id,
    }).select().single()

    if (insertError) {
      return json({
        error: `Assinatura criada no Asaas, mas falhou ao salvar a cobrança no Financeiro: ${insertError.message}`,
      }, 500)
    }

    return json({ success: true, subscription: sub, charges: row ? [row] : [] })
  }

  // ── Única ou parcelada ──
  const payload: any = {
    customer: customerId,
    billingType: billing_type || 'UNDEFINED', // UNDEFINED deixa o cliente escolher (boleto/pix/cartão)
    dueDate: due_date,
    description,
    interest, fine, discount,
  }

  let charges: any[] = []

  if (installment_count && installment_count > 1) {
    payload.installmentCount = installment_count
    payload.installmentValue = Math.round((value / installment_count) * 100) / 100
    const created = await asaasFetch('/installments', { method: 'POST', body: JSON.stringify(payload) })
    // Asaas retorna o grupo de parcelamento; buscamos as cobranças individuais geradas
    const list = await asaasFetch(`/payments?installment=${created.id}`)
    charges = list.data ?? []
  } else {
    payload.value = value
    const created = await asaasFetch('/payments', { method: 'POST', body: JSON.stringify(payload) })
    charges = [created]
  }

  // Salva cada cobrança como um lançamento financeiro
  const inserted = []
  const insertErrors: string[] = []
  for (const charge of charges) {
    const { data: row, error } = await adminClient.from('finance').insert({
      type: 'receita',
      category: finalCategory,
      description: charges.length > 1 ? `${description} (parcela ${charge.installmentNumber ?? ''})` : description,
      value: charge.value,
      date: new Date().toISOString().slice(0, 10),
      due_date: charge.dueDate,
      paid: charge.status === 'RECEIVED' || charge.status === 'CONFIRMED',
      client_id, process_id: process_id || null, responsible: responsible || null,
      payment_link: charge.invoiceUrl,
      asaas_charge_id: charge.id, asaas_status: charge.status, asaas_invoice_url: charge.invoiceUrl,
    }).select().single()
    if (row) inserted.push(row)
    if (error) insertErrors.push(error.message)
  }

  if (insertErrors.length > 0) {
    // A cobrança FOI criada no Asaas, mas não conseguimos salvar no nosso banco —
    // isso é importante o suficiente pra virar erro, não sucesso silencioso
    return json({
      error: `Cobrança criada no Asaas, mas falhou ao salvar no Financeiro: ${insertErrors.join('; ')}`,
    }, 500)
  }

  return json({ success: true, charges: inserted })
}

// ── Sincronizar status de cobranças pendentes + puxar novas de assinaturas ──
async function handleSync(req: Request) {
  await requireAdmin(req)

  const { data: pending } = await adminClient.from('finance')
    .select('id, asaas_charge_id, paid')
    .not('asaas_charge_id', 'is', null)
    .eq('paid', false)

  let updated = 0
  const errors: string[] = []

  for (const entry of pending ?? []) {
    try {
      const charge = await asaasFetch(`/payments/${entry.asaas_charge_id}`)
      const isPaid = charge.status === 'RECEIVED' || charge.status === 'CONFIRMED'
      if (isPaid || charge.status !== entry.asaas_status) {
        await adminClient.from('finance').update({
          paid: isPaid,
          payment_date: isPaid ? (charge.paymentDate ?? new Date().toISOString().slice(0, 10)) : null,
          asaas_status: charge.status,
        }).eq('id', entry.id)
        updated++
      }
    } catch (e) {
      errors.push(`${entry.asaas_charge_id}: ${String(e)}`)
    }
  }

  // ── Puxa cobranças novas geradas automaticamente por assinaturas ativas ──
  // (busca em asaas_subscriptions, não em finance — assim funciona mesmo se
  // a 1ª cobrança de uma assinatura nova ainda não tinha sido capturada)
  let newFromSubscriptions = 0
  const { data: subs } = await adminClient.from('asaas_subscriptions').select('*')

  for (const ref of subs ?? []) {
    try {
      const list = await asaasFetch(`/payments?subscription=${ref.id}`)
      for (const charge of list.data ?? []) {
        const { data: exists } = await adminClient.from('finance').select('id').eq('asaas_charge_id', charge.id).maybeSingle()
        if (exists) continue
        await adminClient.from('finance').insert({
          type: 'receita', category: ref.category ?? 'Mensalidade', description: ref.description ?? 'Mensalidade (assinatura Asaas)',
          value: charge.value, date: new Date().toISOString().slice(0, 10), due_date: charge.dueDate,
          paid: charge.status === 'RECEIVED' || charge.status === 'CONFIRMED',
          client_id: ref.client_id, process_id: ref.process_id, responsible: ref.responsible,
          payment_link: charge.invoiceUrl,
          asaas_charge_id: charge.id, asaas_status: charge.status, asaas_invoice_url: charge.invoiceUrl,
          asaas_subscription_id: ref.id,
        })
        newFromSubscriptions++
      }
    } catch (e) {
      errors.push(`assinatura ${ref.id}: ${String(e)}`)
    }
  }

  return json({ success: true, checked: pending?.length ?? 0, updated, newFromSubscriptions, errors })
}

// ── Cancelar cobrança ──────────────────────────────────────────────────
async function handleCancelCharge(req: Request) {
  await requireAdmin(req)
  const { finance_id } = await req.json()
  const { data: entry } = await adminClient.from('finance').select('asaas_charge_id').eq('id', finance_id).maybeSingle()
  if (!entry?.asaas_charge_id) return json({ error: 'Lançamento sem cobrança Asaas vinculada' }, 400)

  await asaasFetch(`/payments/${entry.asaas_charge_id}`, { method: 'DELETE' })
  await adminClient.from('finance').update({ asaas_status: 'CANCELLED' }).eq('id', finance_id)
  return json({ success: true })
}

// ── Router ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const url = new URL(req.url)
  const path = url.pathname.replace(/^\/asaas/, '')

  try {
    if (path === '/create-charge' && req.method === 'POST') return await handleCreateCharge(req)
    if (path === '/sync' && req.method === 'POST') return await handleSync(req)
    if (path === '/cancel-charge' && req.method === 'POST') return await handleCancelCharge(req)
    return json({ error: 'Rota não encontrada: ' + path }, 404)
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
