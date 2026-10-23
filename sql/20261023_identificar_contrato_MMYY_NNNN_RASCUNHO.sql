-- Life Up | Identificação de contratos no padrão MMYY-NNNN
-- RASCUNHO DE HOMOLOGAÇÃO: NÃO EXECUTAR EM PRODUÇÃO.
-- Mantém a assinatura da função existente e compatibilidade com nomes legados.
-- Não confirma assinaturas nem altera pedidos.
--
-- PRÉ-REQUISITOS: revisar quem chama esta função no webhook e validar
-- nomes reais dos documentos e ano_pedido, incluindo casos legados.
BEGIN;

CREATE OR REPLACE FUNCTION public.posvenda_identificar_contrato(
    p_nome_documento text,
    p_ano integer
)
RETURNS TABLE (
    pedido_id bigint,
    numero_pedido text,
    nome_cliente text
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
    SELECT
        p.id,
        p.numero_pedido,
        p.nome_cliente
    FROM public.posvenda_pedidos AS p
    WHERE p.ano_pedido = p_ano
      AND p.numero_pedido IS NOT NULL
      AND p.nome_cliente IS NOT NULL
      AND btrim(p_nome_documento) ~*
        '^Contrato[[:space:]]+Lifeup[[:space:]]+.+[[:space:]]+([0-9]{4}-[0-9]{4,}|[0-9]{4}[A-Za-z]?)$'
      AND upper(
          substring(
              btrim(p_nome_documento)
              FROM '([0-9]{4}-[0-9]{4,}|[0-9]{4}[A-Za-z]?)$'
          )
      ) = p.numero_pedido
      AND lower(btrim(
          substring(
              btrim(p_nome_documento)
              FROM '^Contrato[[:space:]]+Lifeup[[:space:]]+(.+)[[:space:]]+([0-9]{4}-[0-9]{4,}|[0-9]{4}[A-Za-z]?)$'
          )
      )) = lower(btrim(p.nome_cliente))
      AND (
          p.numero_pedido ~ '^[0-9]{4}-[0-9]{4,}$'
          OR (
              p.numero_pedido ~ '^[0-9]{4}[A-Za-z]?$'
              AND substring(p.numero_pedido FROM '^[0-9]{2}')::integer BETWEEN 1 AND 31
              AND substring(p.numero_pedido FROM '^[0-9]{2}([0-9]{2})')::integer BETWEEN 1 AND 12
          )
      );
$function$;

COMMIT;
