-- Life Up | Fluxo controlado de tarefas e SLA | RASCUNHO PARA HOMOLOGACAO
-- NAO EXECUTAR EM PRODUCAO sem validar triggers, RLS e webhook existentes.
-- Pedidos existentes recebem inicio em now() no backfill; validar politica de SLA legado.
-- ATENCAO: nao executar: ainda falta revisar isolamento de RPC, Autentique e requisitos verificaveis.
begin;

create table if not exists public.posvenda_controle_etapas (
  pedido_id bigint primary key references public.posvenda_pedidos(id) on delete cascade,
  etapa_nome text not null,
  iniciado_em timestamptz not null default now(),
  responsavel text,
  prazo_dias_uteis integer,
  prazo_tipo text not null default 'interno'
    check (prazo_tipo in ('interno','cliente','agendamento','por_ambiente')),
  concluido_em timestamptz,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.posvenda_checklist (
  id bigint generated always as identity primary key,
  pedido_id bigint not null references public.posvenda_pedidos(id) on delete cascade,
  etapa_nome text not null,
  requisito text not null,
  concluido boolean not null default false,
  concluido_em timestamptz,
  concluido_por uuid,
  unique (pedido_id,etapa_nome,requisito)
);

-- Reutilizar public.posvenda_historico_etapas já existente.
-- Colunas: id,pedido_id,etapa_anterior,etapa_nova,alterado_em,alterado_por.

create or replace function public.lifeup_prazo_etapa(p_etapa text)
returns table (dias_uteis integer, tipo text)
language sql immutable as $$
 select case p_etapa
   when 'Contrato recebido' then 1
   when 'Conferência de medidas' then 3
   when 'Caderno técnico' then 5
   when 'Programação de produção' then 2
   when 'Em fabricação' then 35
   when 'Conferência de qualidade' then 1
   when 'Programação de entrega' then 2
   when 'Montagem e finalização' then 5
   else null end,
 case
   when p_etapa = 'Aprovação técnica' then 'cliente'
   when p_etapa = 'Entrega dos móveis' then 'agendamento'
   when p_etapa in ('Caderno técnico','Montagem e finalização') then 'por_ambiente'
   else 'interno' end;
$$;

-- O registro da etapa é atualizado automaticamente inclusive pelo webhook.
create or replace function public.lifeup_registrar_entrada_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dias int; v_tipo text;
begin
 if tg_op='INSERT' or new.etapa_atual is distinct from old.etapa_atual then
   select dias_uteis,tipo into v_dias,v_tipo from public.lifeup_prazo_etapa(new.etapa_atual);
   insert into public.posvenda_controle_etapas
     (pedido_id,etapa_nome,iniciado_em,responsavel,prazo_dias_uteis,prazo_tipo,concluido_em)
   values (new.id,new.etapa_atual,now(),new.responsavel_posvenda,v_dias,v_tipo,null)
   on conflict(pedido_id) do update set
     etapa_nome=excluded.etapa_nome,iniciado_em=excluded.iniciado_em,
     responsavel=excluded.responsavel,prazo_dias_uteis=excluded.prazo_dias_uteis,
     prazo_tipo=excluded.prazo_tipo,concluido_em=null,atualizado_em=now();
   -- O gatilho existente posvenda_registrar_mudanca_etapa grava o histórico.

 end if;
 return new;
end $$;

drop trigger if exists trg_lifeup_registrar_entrada_etapa on public.posvenda_pedidos;
create trigger trg_lifeup_registrar_entrada_etapa
after insert or update of etapa_atual on public.posvenda_pedidos
for each row execute function public.lifeup_registrar_entrada_etapa();

-- Não altera retrospectivamente o horário de entrada dos pedidos existentes.
insert into public.posvenda_controle_etapas
 (pedido_id,etapa_nome,iniciado_em,responsavel,prazo_dias_uteis,prazo_tipo)
select p.id,p.etapa_atual,now(),p.responsavel_posvenda,s.dias_uteis,s.tipo
from public.posvenda_pedidos p
cross join lateral public.lifeup_prazo_etapa(p.etapa_atual) s
on conflict(pedido_id) do nothing;

-- A política de checklist é alimentada ao entrar em cada etapa.
create or replace function public.lifeup_requisitos_etapa(p_etapa text)
returns table(requisito text) language sql immutable as $$
 select unnest(case p_etapa
  when 'Contrato recebido' then array['Documentos de referência cadastrados','Responsável pela medição definido']
  when 'Conferência de medidas' then array['Medição realizada','Medidas e observações registradas','Responsável pelo Caderno Técnico definido']
  when 'Caderno técnico' then array['Caderno Técnico definitivo anexado por ambiente','Revisões identificadas e conferidas']
  when 'Aprovação técnica' then array['Aprovação formal de todas as revisões confirmada pelo Autentique']
  when 'Programação de produção' then array['Materiais e ferragens conferidos','Autorização formal de fabricação registrada']
  when 'Em fabricação' then array['Fabricação de todos os ambientes concluída']
  when 'Conferência de qualidade' then array['Checklist de qualidade concluído']
  when 'Programação de entrega' then array['Data e logística confirmadas']
  when 'Entrega dos móveis' then array['Entrega registrada']
  when 'Montagem e finalização' then array['Montagem concluída em todos os ambientes','Conferência final realizada']
  else array[]::text[] end);
$$;

create or replace function public.lifeup_criar_checklist_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
 if tg_op='INSERT' or new.etapa_atual is distinct from old.etapa_atual then
  insert into public.posvenda_checklist(pedido_id,etapa_nome,requisito)
  select new.id,new.etapa_atual,r.requisito from public.lifeup_requisitos_etapa(new.etapa_atual) r
  on conflict do nothing;
 end if;
 return new;
end $$;

drop trigger if exists trg_lifeup_criar_checklist_etapa on public.posvenda_pedidos;
create trigger trg_lifeup_criar_checklist_etapa
after insert or update of etapa_atual on public.posvenda_pedidos
for each row execute function public.lifeup_criar_checklist_etapa();

insert into public.posvenda_checklist(pedido_id,etapa_nome,requisito)
select p.id,p.etapa_atual,r.requisito
from public.posvenda_pedidos p
cross join lateral public.lifeup_requisitos_etapa(p.etapa_atual) r
on conflict do nothing;

-- Por segurança, novas tabelas não expõem gravação direta ao navegador.
alter table public.posvenda_controle_etapas enable row level security;
alter table public.posvenda_checklist enable row level security;
revoke all on public.posvenda_controle_etapas,public.posvenda_checklist from anon,authenticated;
grant select on public.posvenda_controle_etapas,public.posvenda_checklist to authenticated;
drop policy if exists lifeup_admin_ler_controle on public.posvenda_controle_etapas;
create policy lifeup_admin_ler_controle on public.posvenda_controle_etapas for select to authenticated using
 (exists(select 1 from public.perfis where id=auth.uid() and tipo='administrador' and ativo=true));
drop policy if exists lifeup_admin_ler_checklist on public.posvenda_checklist;
create policy lifeup_admin_ler_checklist on public.posvenda_checklist for select to authenticated using
 (exists(select 1 from public.perfis where id=auth.uid() and tipo='administrador' and ativo=true));
-- Controle de escrita: a interface não pode alterar a etapa diretamente.
-- Pressupõe que a migração e a RPC SECURITY DEFINER pertençam a postgres;
-- conferir owner em homologação antes de ativar.
-- O service_role permanece autorizado para os webhooks existentes.
create or replace function public.lifeup_bloquear_salto_etapa()
returns trigger language plpgsql security invoker as $
begin
 if new.etapa_atual is distinct from old.etapa_atual
    and auth.role() = 'authenticated'
    and current_user <> 'postgres' then
  raise exception 'Conclua a tarefa da etapa antes de movimentar o pedido.';
 end if;
 return new;
end $;

drop trigger if exists trg_lifeup_bloquear_salto_etapa on public.posvenda_pedidos;
create trigger trg_lifeup_bloquear_salto_etapa
before update of etapa_atual on public.posvenda_pedidos
for each row execute function public.lifeup_bloquear_salto_etapa();

create or replace function public.lifeup_marcar_requisito(
 p_pedido_id bigint,p_requisito_id bigint,p_concluido boolean
) returns void language plpgsql security definer set search_path=public as $
declare v_etapa text;
begin
 if not exists(select 1 from public.perfis where id=auth.uid() and tipo='administrador' and ativo=true)
 then raise exception 'Acesso não autorizado'; end if;
 select etapa_atual into v_etapa from public.posvenda_pedidos where id=p_pedido_id;
 if v_etapa is null then raise exception 'Pedido não encontrado'; end if;
 -- Aprovações formais são registradas pelo fluxo de assinatura, nunca por checkbox.
 if exists(select 1 from public.posvenda_checklist
   where id=p_requisito_id and requisito ilike '%Autentique%')
 then raise exception 'Aprovação técnica deve ser confirmada pelo Autentique'; end if;
 update public.posvenda_checklist set concluido=p_concluido,
  concluido_em=case when p_concluido then now() else null end,
  concluido_por=case when p_concluido then auth.uid() else null end
 where id=p_requisito_id and pedido_id=p_pedido_id and etapa_nome=v_etapa;
 if not found then raise exception 'Requisito não pertence à etapa atual'; end if;
end $;

create or replace function public.lifeup_concluir_etapa(p_pedido_id bigint)
returns text language plpgsql security definer set search_path=public as $
declare v_etapa text; v_proxima text; v_qtd integer; v_aprovados integer;
begin
 if not exists(select 1 from public.perfis where id=auth.uid() and tipo='administrador' and ativo=true)
 then raise exception 'Acesso não autorizado'; end if;
 select etapa_atual into v_etapa from public.posvenda_pedidos where id=p_pedido_id for update;
 if v_etapa is null then raise exception 'Pedido não encontrado'; end if;
 if not exists(select 1 from public.posvenda_checklist where pedido_id=p_pedido_id and etapa_nome=v_etapa) then
  raise exception 'Checklist da etapa não configurado; avanço bloqueado';
 end if;
 if v_etapa='Aprovação técnica' then
  select count(*),count(*) filter(where aprovacao_tecnica_em is not null)
   into v_qtd,v_aprovados from public.posvenda_ambientes where pedido_id=p_pedido_id;
  if v_qtd=0 or v_qtd<>v_aprovados then
   raise exception 'Aprovação formal pendente em um ou mais ambientes';
  end if;
 elsif exists(select 1 from public.posvenda_checklist
    where pedido_id=p_pedido_id and etapa_nome=v_etapa and not concluido)
 then raise exception 'Existem tarefas obrigatórias pendentes'; end if;
 if v_etapa='Caderno técnico' then
  raise exception 'O envio para aprovação depende do registro da revisão e do documento Autentique; não é possível concluir manualmente';
 end if;
 select e2.nome into v_proxima
 from public.posvenda_etapas e1 join public.posvenda_etapas e2
   on e2.ordem=(select min(e3.ordem) from public.posvenda_etapas e3
                 where e3.ativo=true and e3.ordem>e1.ordem)
 where e1.nome=v_etapa and e1.ativo=true;
 if v_proxima is null then raise exception 'Não há próxima etapa cadastrada'; end if;
 update public.posvenda_controle_etapas set concluido_em=now()
 where pedido_id=p_pedido_id and etapa_nome=v_etapa;
 update public.posvenda_pedidos set etapa_atual=v_proxima where id=p_pedido_id;

 return v_proxima;
end $;

revoke all on function public.lifeup_marcar_requisito(bigint,bigint,boolean) from public,anon;
revoke all on function public.lifeup_concluir_etapa(bigint) from public,anon;
grant execute on function public.lifeup_marcar_requisito(bigint,bigint,boolean) to authenticated;
grant execute on function public.lifeup_concluir_etapa(bigint) to authenticated;

commit;
