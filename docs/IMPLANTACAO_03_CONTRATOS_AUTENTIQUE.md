# Life Up — Implantação 03: Contratos e Autentique

STATUS: levantamento e projeto técnico. NÃO IMPLANTAR SEM HOMOLOGAÇÃO.

## Diagnóstico do repositório main (23/10/2026)
- app.js exibe numero_pedido e etapa_atual para leads vinculados por crm_lead_id.
- posvenda.js permite cadastrar pedidos e ambientes, mas não contém interface própria de elaboração/envio de contratos.
- Há integração de assinatura via webhook e proteções no Supabase já demonstradas em consultas manuais; o código do webhook não foi auditado nesta fase.
- Não confundir anexos comerciais de referência com revisões de caderno técnico aprovadas.

## Fluxo alvo
1. Selecionar lead comercial e criar rascunho de contrato vinculado ao lead.
2. Reservar número MMYY-NNNN por sequência global permanente (exemplo inicial 1026-0100), sem permitir duplicidade.
3. Gerar documento padronizado com cliente, ambientes, materiais, valores, parcelas, prazos, garantia e anexos.
4. Revisar e confirmar contrato antes de enviar ao Autentique.
5. Registrar documento e vínculo com pedido **antes** do envio para assinatura; registrar ID Autentique e status de envio.
6. Confirmar assinatura exclusivamente por webhook validado, idempotente e com documento correspondente.
7. Avançar automaticamente de Aguardando assinatura para Contrato recebido após assinatura válida.
8. Preservar histórico e versões; permitir recusa/cancelamento sem ativar produção.
9. Caderno técnico: documentos separados por ambiente e revisão, com aprovação formal da revisão vigente; não usar assinatura do contrato como aprovação técnica.
10. Exigir última revisão assinada e autorização de fabricação por ambiente antes de Programação de produção / Em fabricação.

## Critérios obrigatórios de homologação
- Conferir API e permissões Autentique, autenticação do webhook e formato de eventos.
- Conferir função existente posvenda_confirmar_contrato e caminho de criação de pedido.
- Conferir tabelas e políticas para numeração, contratos, documentos, ambientes, revisões e autorizações.
- Testar assinatura, recusa, duplicidade de eventos, envio repetido, falha de API e recuperação.
- Testar pedidos com vários ambientes, novas revisões e documentos pendentes.
- Não expor chaves Autentique no navegador.
- Não modificar gatilhos de produção existentes sem testes de regressão.
- Não publicar na main antes da homologação e aceite.

## Sequência geral de implantação (módulos independentes)
03 Contratos/Autentique → 04 CRM Comercial → 05 WhatsApp e distribuição → 06 Orçamentos → 07 Compras/estoque → 08 Dashboard administrativo. A atualização 02 de Pós-venda segue separada.

## Próxima ação técnica
Localizar implementação do webhook e geração/numeração de pedidos no Supabase; revisar interfaces e endpoints existentes; só então escrever a migração e a interface.

## Inspeção da função existente (SQL fornecido em 23/10/2026)
`public.posvenda_confirmar_contrato(bigint,text,text,integer)` é PL/pgSQL SECURITY INVOKER (não há SECURITY DEFINER), search_path vazio, com nomes de tabelas qualificados. Recebe pedido, documento, nome e ano; bloqueia pedido ausente, divergência de código/ano/cliente/ID, e exige etapa Aguardando assinatura. Após assinatura confirmada, retorna CONTRATO_RECEBIDO e atualiza contrato_assinado_em e etapa_atual; repetição retorna JA_PROCESSADO.

Aceita nomes de contrato com código antigo DDMM opcionalmente com letra ou padrão MMYY-NNNN (quatro ou mais dígitos finais). A função NÃO valida assinatura junto ao Autentique; o chamador deve garantir autenticidade, evento assinado e autorização. Verificar grants EXECUTE em pg_proc e papéis que podem invocá-la. Verificar também se o webhook valida assinatura e evita replay. Nenhuma mudança de produção feita.

### Diagnóstico seguinte (somente leitura)
```sql
SELECT p.proname, p.prosecdef AS security_definer,
       p.proowner::regrole AS proprietario,
       array_to_string(p.proacl, ', ') AS permissoes_explicitas,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_pode_executar,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS autenticado_pode_executar,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS servico_pode_executar
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='posvenda_confirmar_contrato';
```

### Permissões verificadas pelo usuário
A função `posvenda_confirmar_contrato` é SECURITY INVOKER (`prosecdef=false`), owner `postgres`, ACL explícita `postgres=X/postgres, service_role=X/postgres`. `anon` EXECUTE=false, `authenticated` EXECUTE=false, `service_role` EXECUTE=true. Nenhuma alteração de grants necessária neste momento. Ainda falta auditar autenticação e verificação criptográfica do webhook e vinculação de documento antes do envio.

## Diagnóstico confirmado: numeração versus identificação
- `lifeup_gerar_numero_pedido()`: SECURITY DEFINER, usa `nextval('public.lifeup_numero_pedido_seq')` e prefixo MMYY em America/Sao_Paulo, formato `MMYY-NNNN`. Confirmar valor atual da sequência, ACL e unicidade em `posvenda_pedidos.numero_pedido`; não assumir início 0100 sem inspeção.
- `posvenda_identificar_contrato(nome,ano)`: regex antiga de DDMM com letra opcional; valida dia e mês. **Não identifica MMYY-NNNN**. Risco de webhook não localizar contratos novos caso invoque essa função.
- `posvenda_confirmar_contrato`: regex aceita antigo e novo, mas depende do pedido/documento já vinculados e da autenticação do chamador.
- Antes de substituir `posvenda_identificar_contrato`, verificar chamadores, permissões e comportamento legado. Preservar compatibilidade com contratos antigos.

## Sequência e restrições (consulta Supabase fornecida pelo usuário)
- `lifeup_numero_pedido_seq` tem `start_value=100`. Isso não confirma o valor atual nem o próximo número.
- Em `posvenda_pedidos`, consulta de constraints p/u retornou apenas `PRIMARY KEY (id)`, sem UNIQUE constraint para `numero_pedido`. Ainda podem existir índices únicos independentes; verificar `pg_indexes` antes de concluir ausência de proteção.
- Antes de propor índice único, pesquisar números duplicados, índices existentes e tratamento de números nulos/legados. Não executar DDL em produção sem plano de migração.

## Índices existentes confirmados (Supabase)
- `posvenda_pedidos_autentique_document_unique`: UNIQUE(autentique_document_id).
- `posvenda_pedidos_codigo_ano_unique`: UNIQUE(numero_pedido,ano_pedido) WHERE ambos não nulos. Não garante unicidade global de numero_pedido isolado, nem quando ano_pedido é nulo.
- `posvenda_pedidos_pkey`: UNIQUE(id).
- `ux_posvenda_pedidos_crm_lead`: UNIQUE(crm_lead_id) WHERE não nulo.
- Consulta de duplicidades de numero_pedido não retornou linhas.
- Não criar índice redundante. Próxima verificação: distribuição de ano_pedido nulo e geração de pedidos por função/trigger, além de permissões da RPC geradora.

## Auditoria dos dados existentes
Consulta de 23/10/2026: 6 pedidos, todos numerados, 0 com ano_pedido nulo, 2 números novos MMYY-NNNN e 4 números legados. Preservar os dois formatos na identificação; sem necessidade de backfill do ano.

## Decisão aprovada — limpeza segura dos seis pedidos de teste
O usuário confirmou que os seis pedidos são exclusivamente de teste, sem pedidos reais cadastrados, e autorizou **planejar** a limpeza somente após a homologação. Não autorizou exclusão imediata.

### Procedimento obrigatório
1. Inventariar IDs, números, CRM leads, Autentique IDs e todas as tabelas com FK para posvenda_pedidos, incluindo dependências indiretas de ambientes/documentos/revisões.
2. Verificar integrações externas, documentos no Autentique e arquivos no Storage; não apagar automaticamente dados externos.
3. Concluir testes e obter aceite explícito para executar limpeza.
4. Produzir backup/exportação verificável e relatório de dependências antes de qualquer DELETE.
5. Usar transação e checagens de contagem, restringindo por IDs explícitos; jamais TRUNCATE CASCADE ou reset de sequence.
6. Preservar sequência global de numeração e histórico necessário à auditoria; planejar anonimização/arquivamento se exigido.
7. Conferir estado pós-limpeza e comportamento do próximo pedido, sem criar pedido real fictício.

### Diagnóstico inicial de FKs (somente leitura)
```sql
SELECT conrelid::regclass AS tabela_dependente,
       conname AS nome_relacionamento,
       confrelid::regclass AS tabela_referenciada,
       pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE contype='f'
  AND confrelid IN (
    'public.posvenda_pedidos'::regclass,
    'public.posvenda_ambientes'::regclass,
    'public.posvenda_documentos'::regclass,
    'public.posvenda_revisoes_projeto'::regclass
  )
ORDER BY tabela_referenciada::text, tabela_dependente::text;
```

## Mapa de FKs confirmado (15 relacionamentos)
- pedidos <- ambientes, visitas, documentos, historico_etapas, autorizacoes_fabricacao.
- ambientes <- visitas, auditoria_aprovacoes, revisoes_projeto, solicitacoes_alteracao, autorizacoes_fabricacao.
- documentos <- revisoes_projeto (documento_id).
- revisoes_projeto <- revisoes_projeto (revisao_anterior_id), solicitacoes_alteracao (revisao_origem_id e revisao_destino_id), autorizacoes_fabricacao (revisao_id).
- Todas as definições retornadas foram FOREIGN KEY simples sem ON DELETE CASCADE explícito. Não executar DELETE até inspecionar gatilhos de proteção, contagens, referências indiretas e Storage/Autentique.
- Próxima ação: inventário agregado das tabelas ligadas aos seis pedidos. Evitar listar nomes de clientes ou documentos em relatórios desnecessários.
