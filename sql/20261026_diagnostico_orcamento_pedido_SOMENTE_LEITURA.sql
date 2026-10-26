-- Life Up / Implantação 03 — diagnóstico SOMENTE LEITURA
-- Não altera dados, não chama gerador de número e não consome sequência.
-- Execute no SQL Editor do Supabase e compartilhe os resultados sem dados pessoais.

-- 1. Colunas de pedidos, leads e eventuais tabelas de orçamento.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND (table_name IN ('posvenda_pedidos','leads','posvenda_documentos')
       OR table_name ILIKE '%orcamento%'
       OR table_name ILIKE '%proposta%')
ORDER BY table_name, ordinal_position;

-- 2. Funções e gatilhos que geram ou atribuem o número do pedido.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_executa,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_executa
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (p.proname ILIKE '%pedido%' OR p.proname ILIKE '%orcamento%')
ORDER BY p.proname;

SELECT c.relname AS tabela, t.tgname AS trigger_nome,
       pg_get_triggerdef(t.oid) AS definicao
FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND NOT t.tgisinternal
  AND c.relname IN ('posvenda_pedidos','leads')
ORDER BY c.relname,t.tgname;

-- 3. Políticas de acesso: conferir antes de criar qualquer gravação de orçamento.
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname='public'
  AND (tablename IN ('posvenda_pedidos','leads')
       OR tablename ILIKE '%orcamento%' OR tablename ILIKE '%proposta%')
ORDER BY tablename, policyname;

-- 4. Estado da sequência, sem nextval (não reserva número).
SELECT schemaname, sequencename, start_value, min_value, max_value,
       increment, cycle, cache_size, last_value
FROM pg_sequences
WHERE schemaname='public' AND sequencename='lifeup_numero_pedido_seq';
