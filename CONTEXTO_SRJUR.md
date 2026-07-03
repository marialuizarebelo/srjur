# SRJUR — Documento de Contexto Completo

Este documento existe pra você (Malu) usar como ponto de partida numa **conversa separada**, dedicada a pensar/planejar/discutir o sistema — fluxos, automações, prioridades, decisões de produto — sem gastar tempo/contexto da conversa técnica onde o código é de fato alterado.

**Onde abrir essa conversa separada:** recomendo o **claude.ai (web ou app)**, não aqui no terminal/Claude Code. O Claude Code (aqui) é a ferramenta de execução — ela lê e edita os arquivos do projeto direto no seu computador, roda build, git push, etc. O claude.ai é melhor pra conversa livre de planejamento, sem o peso de estar "dentro" do projeto. Cole este documento inteiro como primeira mensagem de lá, explique o que quer pensar, e quando chegar a uma conclusão/plano, é só trazer o resumo de volta pra essa conversa aqui (Claude Code) pra eu implementar.

---

## 1. O que é o SRJUR

Sistema de gestão para um escritório de advocacia de duas sócias:
- **Maria Luiza "Malu" Rebelo** — co-fundadora, é quem mais usa o sistema no dia a dia, inclusive pelo celular (PWA instalado).
- **Juliana Scartezzini** — sócia/administradora.

Nome fantasia do escritório no sistema: "Scartezzini & Rebelo Advocacia". Domínio de produção: `app.srjur.com`.

É um substituto de um sistema anterior feito no **Lovable** (outra plataforma de geração de app via IA) — o SRJUR atual foi reconstruído do zero fora do Lovable, então às vezes "a versão antiga" nas conversas se refere a esse sistema Lovable anterior, cujo comportamento/UX em várias telas é a referência de "como deveria ser" (às vezes reconstruído de forma simplificada demais na migração, perdendo funcionalidade).

### Módulos principais
- **Dashboard** — visão geral do escritório (receitas do mês, prazos, criação rápida de lead/cliente/processo/tarefa)
- **Clientes** — cadastro de clientes ativos + CRM de leads (kanban de captação até fechamento)
- **Processos** — casos jurídicos: consultivo, contencioso, extrajudicial (cada um com etapas/fases próprias), vinculados a um cliente, com partes contrárias, datas processuais, sincronização de intimações via DJEN
- **Tarefas** — tarefas internas do escritório, com kanban por etapa (Backlog/A Fazer/Fazendo/Aguardando/Concluído) e lista
- **Prazos** — prazos processuais, com etapas customizáveis
- **Financeiro** — receitas/despesas, parcelamentos, mensalidades recorrentes, projeção futura, gráficos
- **Marketing** — conteúdo para redes sociais, kanban de produção
- **Calendário/Agenda** — visão unificada de tarefas + prazos + compromissos + marketing por dia/semana
- **Portal do Cliente (admin)** — onde a equipe gerencia o que cada cliente vê no portal dele, publica atualizações de processo, comunica, gerencia acesso de login
- **Portal do Cliente (cliente)** — o que o cliente efetivamente acessa logado: processos, financeiro, documentos, agenda, comunicados
- **Sistemas Eletrônicos** — cadastro de acessos a sistemas de tribunais (eProc, PJe etc.)
- **Configurações** — dados do escritório, usuários internos, segurança, preferências

### Ambiente de demonstração
Existe um ambiente separado (`demosrjur.vercel.app`) com dados fictícios, usado pela Malu em reuniões de venda — banco Supabase próprio, independente do de produção.

---

## 2. Stack técnica

- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui (usando padrão `render=` prop tipo asChild)
- **Backend**: Supabase (Postgres + Auth + Row Level Security + Storage + Edge Functions)
- **Roteamento**: React Router v6, com layouts separados para admin (`AppLayout`) e portal do cliente (`PortalLayout`)
- **Drag-and-drop**: `@dnd-kit` (kanbans)
- **Gráficos**: `recharts`
- **Notificações**: `sonner` (toasts)
- **PWA**: `vite-plugin-pwa`
- **Deploy**: Vercel, auto-deploy a cada push na branch `main` do GitHub (`marialuizarebelo/srjur`)
- **Repositório local**: `C:\Users\mlpre\Projects\srjur`

### Padrões de projeto importantes (pra quem for planejar mudanças)

**Datas**: NUNCA usar `new Date().toISOString()` pra guardar/comparar datas por mês/dia — isso converte pra UTC e pode mudar o dia dependendo do horário/fuso. O padrão do projeto é sempre montar/comparar strings `YYYY-MM-DD` diretamente. Isso já causou bugs sérios (Dashboard vs Financeiro mostrando números diferentes) e foi corrigido.

**Responsável (quem é responsável por um item)**: não é mais texto fixo ("Malu"/"Juliana"/"Ambas") — é uma lista de IDs de usuário (`responsible_ids: uuid[]`), com um componente reutilizável (`ResponsibleSelect`/`ResponsibleAvatars`) que permite marcar quantas pessoas quiser. Um campo texto legado (`responsible`) ainda é preenchido em paralelo só pra telas antigas/exportações que ainda leem ele.

**Migrações de banco NÃO rodam sozinhas**: toda vez que uma tabela precisa de uma coluna nova, é criado um arquivo `.sql` em `supabase/` e a Malu precisa colar e rodar manualmente no SQL Editor do Supabase (o Claude Code não tem acesso direto ao banco de produção). Isso já causou vários bugs de "coluna não existe" quando uma migração foi escrita mas nunca rodada — sempre bom confirmar que rodou.

**RLS (Row Level Security)**: todo admin vê tudo, todo cliente só vê o que é dele e marcado como `portal_visible = true`. Existe uma função `is_admin()` que evita um bug clássico de "recursão infinita" que acontecia quando a policy de `profiles` consultava a própria tabela `profiles`.

**Edge Functions**: funcionalidades que precisam de privilégio elevado (criar usuário de login pro portal do cliente, gerar tarefas automáticas diárias) ficam em `supabase/functions/`, mas **o deploy delas também é manual** — precisa colar o código no Supabase Dashboard → Edge Functions.

---

## 3. Como a Malu trabalha com o Claude Code (regras já estabelecidas)

- Sempre colar código/SQL direto no chat, nunca só apontar caminho de arquivo — ela quer copiar e colar direto.
- Fazer o máximo possível sozinho via terminal, sem pedir permissão passo a passo.
- Corrigir a causa raiz, não só o sintoma — quando um bug aparece "de novo" depois de "corrigido", é sinal de que a correção anterior foi um remendo, não uma correção estrutural.
- Verificar sempre com `npx tsc --noEmit` e `npm run build` antes de dar por concluído, e fazer commit + push depois de validar.

---

## 4. O que "eficiência" significa pra esse sistema (pra orientar as decisões de produto)

Baseado no que já foi discutido:
- **Consistência de dados**: o mesmo número (ex: receita do mês) tem que bater em todas as telas que o mostram — nunca fontes de verdade divergentes pro mesmo dado.
- **Sem duplicidade por erro de operação**: cliques duplos, salvamentos lentos, tudo isso não pode gerar lançamentos/tarefas/processos duplicados — proteção de clique único é obrigatória em qualquer botão de salvar.
- **Terminologia jurídica/financeira correta**: parcelamento ≠ mensalidade recorrente ≠ cobrança no cartão — cada um tem uma lógica de geração de lançamento diferente, e confundir isso gera erro de caixa real.
- **RBAC de verdade**: as duas sócias devem operar em pé de igualdade dentro do sistema (ambas admin), sem uma enxergar menos que a outra por bug de permissão.
- **Automação com registro auditável**: toda automação (ex: tarefa de renovação de mensalidade, sincronização de intimações do DJEN) deve gerar algo visível/rastreável, nunca "silenciosa" — se falhar, tem que avisar.

---

## 5. Ideias/pendências já identificadas mas não implementadas

- **Cadastro de partes contrárias reutilizável**: hoje cada processo guarda suas próprias partes contrárias em texto/JSON solto; pra áreas como bancário (mesmo réu em várias ações) faria sentido ter um cadastro central de partes, com histórico "todas as ações contra essa parte". Decisão: deixado pra depois, mencionado como possível evolução futura.
- **Aba "Aprovações"** no portal do cliente: existia no sistema antigo (Lovable), não foi reconstruída ainda — não há hoje nenhuma definição de como esse fluxo deveria funcionar (pedido → cliente aprova/recusa? vinculado a documento?). Precisa ser desenhado do zero.
- **Eye/privacidade global**: toggle de "olho" pra borrar dados sensíveis (nomes, valores financeiros) existe parcialmente (Financeiro, Dashboard, Clientes) mas não foi espalhado pra todas as telas.
- **Cron da função `daily-tasks`**: a function que gera tarefas automáticas (lembretes de cobrança, revisão financeira mensal, aniversário de cliente) foi escrita mas precisa ser deployada + configurado um cron job no Supabase — ação manual da Malu, não algo que o Claude Code resolve sozinho.

---

## 6. Como escrever pedidos pra que virem código sem ruído

Pelo processo que já rodou nessa conversa técnica, os pedidos que funcionam melhor são os que trazem:
1. **O que está acontecendo** (comportamento observado, de preferência com print)
2. **O que deveria acontecer** (o resultado esperado, sem precisar saber como implementar)
3. **Por que isso importa** (o impacto no trabalho real — isso ajuda a decidir prioridade e a não simplificar demais)

Não é necessário (nem recomendado) já vir com a solução técnica pronta — isso é trabalho do Claude Code. O valor de uma conversa de planejamento separada é justamente decidir **o quê** e **por quê**, deixando o **como** pra cá.

---

*Documento gerado em 2026-07-03, a partir do histórico real de correções e decisões tomadas no desenvolvimento do SRJUR.*
