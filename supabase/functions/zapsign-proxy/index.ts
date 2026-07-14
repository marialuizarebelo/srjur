// Edge Function: zapsign-proxy
// A API do ZapSign não permite chamada direta do navegador (sem CORS), então
// o front-end nunca conseguia confirmar contrato assinado — ficava travado
// em "Verificando ZapSign..." pra sempre. Essa function roda no servidor
// (sem bloqueio de CORS) e usa o token do ZapSign a partir de um secret,
// nunca exposto no bundle do navegador.
//
// Deploy: supabase functions deploy zapsign-proxy
// Secret: supabase secrets set ZAPSIGN_TOKEN=xxxxx

const ZAPSIGN_TOKEN = Deno.env.get('ZAPSIGN_TOKEN') ?? ''
const ZAPSIGN_BASE_URL = 'https://api.zapsign.com.br/api/v1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (!ZAPSIGN_TOKEN) {
    return new Response(JSON.stringify({ error: 'ZAPSIGN_TOKEN não configurado' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const url = new URL(req.url)
    const name = url.searchParams.get('name')

    // A lista da API do ZapSign é paginada (25 por página) — sem seguir o "next"
    // até o fim, contratos mais antigos que a página 1 nunca são encontrados.
    let docs: any[] = []
    let nextUrl: string | null = `${ZAPSIGN_BASE_URL}/docs/?api_token=${ZAPSIGN_TOKEN}`
    while (nextUrl) {
      const res = await fetch(nextUrl)
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `ZapSign respondeu ${res.status}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const data = await res.json()
      docs = docs.concat(data.results ?? [])
      nextUrl = data.next ?? null
    }

    if (!name) {
      return new Response(JSON.stringify({ docs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // O endpoint de listagem não retorna "signers" — o campo confiável pra
    // identificar de quem é o contrato é a pasta (folder_path), que é o nome
    // que a gente mesma dá ao criar a pasta no ZapSign. "name" (nome do
    // arquivo) entra como fallback. Normaliza acento/maiúscula pra não
    // depender de "José" bater exatamente com "Jose".
    const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    const lower = normalize(name)
    const filtered = docs.filter((d: any) =>
      normalize(d.folder_path ?? '').includes(lower) ||
      normalize(d.name ?? '').includes(lower)
    )
    return new Response(JSON.stringify({ docs: filtered }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
