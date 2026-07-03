-- Corrige lançamentos parcelados/recorrentes já criados com Data e Vencimento
-- divergentes (bug antigo do formulário). Alinha "date" para ser igual a
-- "due_date" em qualquer linha que faça parte de uma série (installments > 1)
-- e que ainda não esteja paga — não mexe em lançamentos únicos nem em linhas
-- já pagas (essas já refletem o que realmente aconteceu).
UPDATE public.finance
SET date = due_date
WHERE installments IS NOT NULL
  AND installments > 1
  AND due_date IS NOT NULL
  AND date IS DISTINCT FROM due_date
  AND paid = false;
