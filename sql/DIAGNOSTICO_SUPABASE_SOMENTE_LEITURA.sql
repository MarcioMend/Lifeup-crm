-- LIFE UP | DIAGNÓSTICO SOMENTE LEITURA
-- Executar no SQL Editor do Supabase. Não altera dados ou estrutura.
-- Copie os resultados das consultas e compartilhe para homologação.

-- 1. Colunas e tipos das tabelas envolvidas
select table_name,column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns
where table_schema='public'
  and table_name in ('posvenda_pedidos','posvenda_ambientes','posvenda_etapas',
    'posvenda_visitas','perfis','posvenda_documentos','posvenda_revisoes_projeto',
    'posvenda_controle_etapas','posvenda_checklist')
order by table_name,ordinal_position;

-- 2. Gatilhos existentes, inclusive bloqueios de produção
select event_object_table as tabela,trigger_name,event_manipulation as evento,
 action_timing as momento,action_statement as acao
from information_schema.triggers
where trigger_schema='public' and event_object_table like 'posvenda_%'
order by tabela,trigger_name;

-- 3. Funções e assinaturas: SEM revelar corpo/código ou segredos
select n.nspname as esquema,p.proname as funcao,
 pg_get_function_identity_arguments(p.oid) as argumentos,
 pg_get_userbyid(p.proowner) as proprietario,
 p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and
 (p.proname like 'posvenda_%' or p.proname like 'lifeup_%')
order by p.proname;

-- 4. Políticas RLS e acesso às tabelas
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename like 'posvenda_%'
order by tablename,policyname;

-- 5. Etapas cadastradas e ordem exata
select id,ordem,nome,ativo from public.posvenda_etapas order by ordem;

-- 6. Extensões de controle de calendário disponíveis
select extname,extversion from pg_extension where extname in ('pg_cron','pgcrypto');

-- Não executar scripts de migração até a análise dos resultados.
