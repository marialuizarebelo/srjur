-- Taxa da maquininha/cartão, usada para calcular o valor líquido recebido
-- quando o pagamento é parcelado no cartão de crédito (a operadora repassa
-- o valor integral menos a taxa, de uma vez, mesmo o cliente parcelando).
ALTER TABLE public.finance ADD COLUMN IF NOT EXISTS card_fee_percent numeric;
