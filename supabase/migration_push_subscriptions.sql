-- Tabela para armazenar subscriptions de push por dispositivo/usuário
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own subscriptions"
  ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id);

-- Função que chama a Edge Function send-push ao marcar finance como pago
CREATE OR REPLACE FUNCTION notify_payment_received()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.paid = true AND (OLD.paid = false OR OLD.paid IS NULL) AND NEW.type = 'receita' THEN
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := jsonb_build_object(
        'event', 'payment_received',
        'title', '💰 Pagamento recebido',
        'body', COALESCE(NEW.description, 'Um pagamento foi marcado como recebido'),
        'url', '/financeiro'
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_payment_received ON public.finance;
CREATE TRIGGER on_payment_received
  AFTER UPDATE ON public.finance
  FOR EACH ROW EXECUTE FUNCTION notify_payment_received();
