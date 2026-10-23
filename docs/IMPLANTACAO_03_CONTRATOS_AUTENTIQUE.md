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
