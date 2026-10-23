# Homologação obrigatória — Pós-venda Life Up

**Status:** RASCUNHO. Não executar SQL em produção nem mesclar PR #2.

## Verificações no Supabase antes da implantação

1. Confirmar estrutura real de `posvenda_pedidos`, `posvenda_ambientes`, `posvenda_etapas`, `perfis` e tipos das chaves (`bigint` versus `uuid`). A migração assume `bigint` para pedido.
2. Listar triggers existentes de `posvenda_pedidos` e funções de contrato, aprovação técnica e liberação de fabricação; garantir que a nova proteção não interfira em `autentique-webhook` e `posvenda_confirmar_contrato`.
3. Confirmar que as funções SECURITY DEFINER pertencem ao papel correto e que a transição por RPC é permitida enquanto updates diretos autenticados são negados.
4. Testar leitura RLS para administrador e bloqueio para usuário não autorizado.
5. Não liberar a etapa `Caderno técnico` até implementar anexo de **revisão técnica definitiva por ambiente**, vínculo com documento Autentique e confirmação de envio. O anexo de referência existente não equivale a aprovação.
6. Não permitir que checkbox substitua prova documental de medição, conclusão de fabricação, controle de qualidade ou aprovação formal. Exigir validação dos documentos/ambientes no banco.
7. Na etapa `Aprovação técnica`, o registro `aprovacao_tecnica_em` isolado é insuficiente: validar revisão atual, documento assinado correspondente e permissões, conforme guardas já existentes.
8. Implementar SLA por **ambiente**, com início individual, prazo de 3 a 5 dias úteis, fins de semana e feriados municipais de Belo Horizonte. O cálculo JavaScript atual é apenas ilustrativo, usa prazo base e não considera feriados.
9. Separar prazo de resposta do cliente do prazo interno. Medir tempo de espera, sem marcar como atraso da equipe.
10. Definir regra de exceção administrativa auditável para retrabalho, devolução de etapa e correção de erro, sem contornar autorização de fabricação.
11. Executar testes em projeto Supabase de homologação com dados fictícios, não com pedido real 1026-0102.

## Cenários mínimos de teste

- Contrato assinado avança por webhook de `Aguardando assinatura` para `Contrato recebido`.
- Upload de projeto comercial em `Contrato recebido` não marca aprovação técnica.
- Tentativa de arrastar ou editar etapa diretamente é rejeitada pelo banco.
- Checklist incompleto impede concluir; checklist completo avança apenas à próxima etapa.
- Caderno Técnico sem revisão/autenticação não avança para Aprovação técnica.
- Aprovação técnica sem assinatura correta não avança.
- Fabricação sem autorização continua bloqueada pelos gatilhos atuais.
- Contagem de SLA não penaliza espera do cliente; por ambiente, 3–5 dias.
- Usuário sem autorização não executa RPCs nem lê dados de outros pedidos.
- Pedido existente não é alterado nem perde anexos ou histórico.

## Problemas conhecidos da versão atual do PR

- O banco ainda não está conectado a um ambiente de testes; **nenhum SQL foi executado**.
- O controle por ambiente ainda não foi implementado.
- A etapa Caderno Técnico foi propositalmente bloqueada até concluir a integração.
- Checklist e botão são protótipos de UI; ainda faltam validações documentais robustas.
- O botão atual deve ser ocultado em etapas exclusivamente automáticas ou dependentes de cliente.
- Falta validar sintaxe e comportamento da migração contra o schema real, inclusive nomes/capitalização das etapas e eventual trigger de bloqueio existente.

**Critério de liberação:** só retirar o status Draft depois de homologar todos os cenários e aprovar a migração do banco.
