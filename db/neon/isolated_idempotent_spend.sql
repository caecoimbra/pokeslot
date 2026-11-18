-- PROVA: aplicar apenas no branch proof-identity-safe, nunca em production.
-- Uma operação pertence à identidade validada pelo banco e conserva o resultado.
BEGIN;

CREATE TABLE IF NOT EXISTS proof_private.test_spin_operations (
    user_id text NOT NULL,
    operation_id uuid NOT NULL,
    balance_after integer NOT NULL CHECK (balance_after >= 0),
    PRIMARY KEY (user_id, operation_id)
);

REVOKE ALL ON TABLE proof_private.test_spin_operations FROM PUBLIC, authenticated, anonymous;

CREATE OR REPLACE FUNCTION public.consume_test_spin_once(
    p_expected_user_id text,
    p_operation_id uuid
)
RETURNS TABLE (balance integer, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_user_id text := auth.user_id();
    v_balance integer;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ001',
            MESSAGE = 'identity context missing; request rejected before update';
    END IF;
    -- O parâmetro só é uma trava: a identidade autenticada escolhe a linha.
    IF p_expected_user_id IS DISTINCT FROM v_user_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ002',
            MESSAGE = 'session changed; request rejected before update';
    END IF;
    IF p_operation_id IS NULL THEN
        RAISE EXCEPTION 'operation id required';
    END IF;

    -- Serializa todas as operações do jogador, inclusive duas com o mesmo ID.
    SELECT p.balance INTO v_balance
      FROM public.proof_player_state AS p
     WHERE p.user_id = v_user_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'player state not found';
    END IF;

    SELECT op.balance_after INTO v_balance
      FROM proof_private.test_spin_operations AS op
     WHERE op.user_id = v_user_id AND op.operation_id = p_operation_id;
    IF FOUND THEN
        RETURN QUERY SELECT v_balance, true;
        RETURN;
    END IF;

    UPDATE public.proof_player_state AS p
       SET balance = p.balance - 1
     WHERE p.user_id = v_user_id AND p.balance > 0
     RETURNING p.balance INTO v_balance;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'balance is zero';
    END IF;

    INSERT INTO proof_private.test_spin_operations (user_id, operation_id, balance_after)
    VALUES (v_user_id, p_operation_id, v_balance);
    RETURN QUERY SELECT v_balance, false;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_test_spin_once(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_test_spin_once(text, uuid) TO authenticated;
-- Impede usar o caminho anterior para contornar a idempotência neste branch.
REVOKE EXECUTE ON FUNCTION public.consume_test_spin() FROM authenticated;
COMMIT;
