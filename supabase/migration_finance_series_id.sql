-- Vincula as parcelas/meses de uma mesma serie (parcelamento ou mensalidade
-- recorrente) por um id comum, pra permitir excluir "so este / este e os
-- proximos / todos" de forma confiavel, em vez de adivinhar por descricao.
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS series_id uuid;
