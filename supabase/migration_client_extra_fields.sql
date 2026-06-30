-- Adiciona campos extras ao cadastro de clientes
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS referred_by    text,
  ADD COLUMN IF NOT EXISTS signed_at      date,
  ADD COLUMN IF NOT EXISTS first_contact_at date;
