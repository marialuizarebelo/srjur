-- Troca o role do usuário recém-criado de 'admin' (padrão) para 'client'
-- Troque o e-mail abaixo pelo e-mail que você usou ao criar o usuário de teste
UPDATE public.profiles
SET role = 'client'
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'EMAIL_DO_CLIENTE_TESTE@exemplo.com');
