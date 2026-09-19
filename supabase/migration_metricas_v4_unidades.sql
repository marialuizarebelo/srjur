-- Fase 4 do módulo Métricas e Metas: separar de verdade clientes de
-- sistema (SaaS) dos clientes jurídicos, e sinalizar casos gratuitos
-- (cortesia) pra não inflar métricas comerciais/financeiras. Só existe
-- no projeto principal (main).

-- Um cliente pode ser as duas coisas ao mesmo tempo (ex: tem uma questão
-- jurídica E usa o sistema) -- por isso são dois booleans independentes,
-- não uma escolha única.
alter table public.clients add column if not exists is_juridico boolean not null default true;
alter table public.clients add column if not exists is_saas boolean not null default false;

-- Caso gratuito/cortesia (ex: parentes, casos pro bono) -- não deve contar
-- como cliente novo, conversão ou entrar na carteira/indicadores comerciais.
alter table public.clients add column if not exists is_cortesia boolean not null default false;

-- finance.business_unit ('advocacia' | 'saas', null = advocacia) já existia
-- da fase 3 (preparação), mas nunca tinha UI pra editar -- agora fica
-- selecionável na tela de lançamento, pra separar receita/despesa do
-- sistema (SaaS) da receita/despesa jurídica normal.

-- Quando um lançamento é de um cliente marcado is_cortesia, esse campo
-- decide se ele conta ou não nos indicadores financeiros (default: conta,
-- mas a tela de lançamento avisa e deixa desmarcar quando o cliente é
-- cortesia).
alter table public.finance add column if not exists refletir_metricas boolean not null default true;
