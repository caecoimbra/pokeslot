-- Somente para o branch isolado. O servidor deve validar o JWT antes de chamar
-- estas funções e fornecer o sub verificado e a credencial secreta da sessão.
-- A autorização e a operação compartilham a mesma transação PostgreSQL.

CREATE OR REPLACE FUNCTION pokeslot_proof.lock_active_session(p_user_id text, p_session_token text)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF p_user_id IS NULL OR p_user_id = '' OR p_session_token IS NULL OR p_session_token = '' THEN
    RAISE EXCEPTION 'session unavailable' USING ERRCODE = 'PZ401';
  END IF;

  -- O bloqueio impede que a revogação conclua antes da operação já autorizada.
  -- Em READ COMMITTED, uma revogação anterior à aquisição da trava é observada.
  PERFORM 1
    FROM neon_auth.session
    WHERE token = p_session_token
      AND "userId"::text = p_user_id
      AND "expiresAt" > clock_timestamp()
    FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session unavailable' USING ERRCODE = 'PZ401';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION pokeslot_proof.session_state(p_user_id text, p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM pokeslot_proof.lock_active_session(p_user_id, p_session_token);
  RETURN pokeslot_proof.get_state(p_user_id) || pokeslot_proof.inventory_state(p_user_id);
END;
$function$;

CREATE OR REPLACE FUNCTION pokeslot_proof.session_spin(
  p_user_id text, p_session_token text, p_operation_id uuid, p_round jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM pokeslot_proof.lock_active_session(p_user_id, p_session_token);
  RETURN pokeslot_proof.spin(p_user_id, p_operation_id, p_round);
END;
$function$;

CREATE OR REPLACE FUNCTION pokeslot_proof.session_inventory_action(
  p_user_id text, p_session_token text, p_operation_id uuid, p_action text, p_args jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  PERFORM pokeslot_proof.lock_active_session(p_user_id, p_session_token);
  RETURN pokeslot_proof.inventory_action(p_user_id, p_operation_id, p_action, p_args);
END;
$function$;

REVOKE ALL ON FUNCTION pokeslot_proof.lock_active_session(text, text) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION pokeslot_proof.session_state(text, text) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION pokeslot_proof.session_spin(text, text, uuid, jsonb) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION pokeslot_proof.session_inventory_action(text, text, uuid, text, jsonb) FROM PUBLIC, authenticated, anonymous;
