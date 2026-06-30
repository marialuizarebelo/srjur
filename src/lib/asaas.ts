import { supabase } from '@/integrations/supabase/client'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas`

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  return `Bearer ${data.session?.access_token ?? ''}`
}

async function call(path: string, body?: unknown) {
  const res = await fetch(`${FUNCTION_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: await authHeader() },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Erro na integração com o Asaas')
  return json
}

export interface CreateChargeParams {
  client_id: string
  description: string
  value: number
  due_date: string // YYYY-MM-DD
  category?: string
  billing_type?: 'BOLETO' | 'PIX' | 'CREDIT_CARD' | 'UNDEFINED'
  installment_count?: number
  recurring?: boolean
  cycle?: 'WEEKLY' | 'MONTHLY' | 'YEARLY'
  process_id?: string
  responsible?: string
  interest_percent?: number   // juros ao mês (%)
  fine_percent?: number       // multa por atraso (%)
  discount_percent?: number   // desconto por pagamento antecipado (%)
  discount_days_before?: number // até quantos dias antes do vencimento vale o desconto
}

export async function createAsaasCharge(params: CreateChargeParams) {
  return call('/create-charge', params)
}

export async function syncAsaasCharges() {
  return call('/sync')
}

export async function cancelAsaasCharge(financeId: string) {
  return call('/cancel-charge', { finance_id: financeId })
}
