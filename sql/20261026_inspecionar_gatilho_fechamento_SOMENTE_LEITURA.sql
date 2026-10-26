-- Diagnóstico SOMENTE LEITURA: definição da automação já existente.
-- Não executa a função, não cria pedido e não consome número.
SELECT n.nspname AS esquema, p.proname AS funcao,
       pg_get_functiondef(p.oid) AS codigo,
       p.prosecdef AS security_definer,
       p.proowner::regrole::text AS proprietario
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='criar_posvenda_ao_fechar_lead';
