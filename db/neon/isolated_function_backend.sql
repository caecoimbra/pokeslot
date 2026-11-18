-- Somente para proof-identity-safe. O usuário vem de um JWT verificado no servidor.
-- A função privada nunca deve ser concedida aos papéis da Data API.
BEGIN;
CREATE OR REPLACE FUNCTION proof_private.refresh_verified_state(p_user_id text)
RETURNS TABLE (balance integer, periods_added integer, accounted_until timestamptz, next_replenishment_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
    IF p_user_id IS NULL OR p_user_id = '' THEN RAISE EXCEPTION 'verified identity required'; END IF;
    INSERT INTO public.proof_player_state(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
    RETURN QUERY SELECT * FROM proof_private.apply_replenishment(p_user_id, NULL);
END;
$function$;
REVOKE ALL ON FUNCTION proof_private.refresh_verified_state(text) FROM PUBLIC, authenticated, anonymous;

CREATE OR REPLACE FUNCTION proof_private.consume_verified_spin(p_user_id text, p_operation_id uuid)
RETURNS TABLE (balance integer, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_balance integer;
BEGIN
    IF p_user_id IS NULL OR p_user_id = '' OR p_operation_id IS NULL THEN
        RAISE EXCEPTION 'verified identity and operation id required';
    END IF;
    SELECT p.balance INTO v_balance FROM public.proof_player_state AS p
     WHERE p.user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'player state not found'; END IF;
    SELECT op.balance_after INTO v_balance FROM proof_private.test_spin_operations AS op
     WHERE op.user_id = p_user_id AND op.operation_id = p_operation_id;
    IF FOUND THEN RETURN QUERY SELECT v_balance, true; RETURN; END IF;
    UPDATE public.proof_player_state AS p SET balance = p.balance - 1
     WHERE p.user_id = p_user_id AND p.balance > 0 RETURNING p.balance INTO v_balance;
    IF NOT FOUND THEN RAISE EXCEPTION 'balance is zero'; END IF;
    INSERT INTO proof_private.test_spin_operations(user_id, operation_id, balance_after)
    VALUES (p_user_id, p_operation_id, v_balance);
    RETURN QUERY SELECT v_balance, false;
END;
$function$;
REVOKE ALL ON FUNCTION proof_private.consume_verified_spin(text, uuid)
    FROM PUBLIC, authenticated, anonymous;

-- A Data API passa pelo mesmo núcleo depois de confirmar a própria identidade.
CREATE OR REPLACE FUNCTION public.consume_test_spin_once(p_expected_user_id text, p_operation_id uuid)
RETURNS TABLE (balance integer, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_user_id text := auth.user_id();
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ001',
            MESSAGE = 'identity context missing; request rejected before update';
    END IF;
    IF p_expected_user_id IS DISTINCT FROM v_user_id THEN
        RAISE EXCEPTION USING ERRCODE = 'PZ002',
            MESSAGE = 'session changed; request rejected before update';
    END IF;
    RETURN QUERY SELECT * FROM proof_private.consume_verified_spin(v_user_id, p_operation_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.consume_test_spin_once(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_test_spin_once(text, uuid) TO authenticated;
COMMIT;
