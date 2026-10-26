-- LIFE UP | Diagnóstico consolidado para implantação de contratos
-- UMA ÚNICA CONSULTA, UMA ÚNICA LINHA JSON.
-- SOMENTE LEITURA: não usa nextval, não cria nem altera registros.
-- Antes de compartilhar, revise se alguma definição contém dados sensíveis.
WITH colunas AS (
 SELECT table_name, column_name, data_type, is_nullable, column_default
 FROM information_schema.columns
 WHERE table_schema='public'
   AND (table_name IN ('posvenda_pedidos','leads','posvenda_documentos')
        OR table_name ILIKE '%orcamento%'
        OR table_name ILIKE '%proposta%')
), funcoes AS (
 SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
        p.prosecdef AS security_definer,
        has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_executa,
        has_function_privilege('service_role',p.oid,'EXECUTE') AS service_role_executa
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
   AND (p.proname ILIKE '%pedido%' OR p.proname ILIKE '%orcamento%')
), gatilhos AS (
 SELECT c.relname AS tabela, t.tgname AS trigger_nome,
        pg_get_triggerdef(t.oid) AS definicao
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND NOT t.tgisinternal
   AND c.relname IN ('posvenda_pedidos','leads')
), politicas AS (
 SELECT tablename, policyname, cmd, roles, qual, with_check
 FROM pg_policies
 WHERE schemaname='public'
   AND (tablename IN ('posvenda_pedidos','leads')
        OR tablename ILIKE '%orcamento%' OR tablename ILIKE '%proposta%')
), sequencia AS (
 SELECT schemaname, sequencename, start_value, min_value, max_value,
        increment, cycle, cache_size, last_value
 FROM pg_sequences
 WHERE schemaname='public' AND sequencename='lifeup_numero_pedido_seq'
)
SELECT jsonb_pretty(jsonb_build_object(
 'colunas', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY table_name,column_name) FROM colunas x),'[]'::jsonb),
 'funcoes', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY proname) FROM funcoes x),'[]'::jsonb),
 'gatilhos', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY tabela,trigger_nome) FROM gatilhos x),'[]'::jsonb),
 'politicas', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY tablename,policyname) FROM politicas x),'[]'::jsonb),
 'sequencia', COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM sequencia x),'[]'::jsonb)
)) AS relatorio_consolidado;
