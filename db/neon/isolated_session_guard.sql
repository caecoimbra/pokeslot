-- Somente para o branch isolado. O servidor deve validar o JWT antes de chamar
-- estas funções e fornecer o sub verificado e a credencial secreta da sessão.
-- A autorização e a operação compartilham a mesma transação PostgreSQL.

ALTER TABLE pokeslot_proof.operations ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT statement_timestamp();
ALTER TABLE pokeslot_proof.inventory_operations ADD COLUMN IF NOT EXISTS recorded_at timestamptz NOT NULL DEFAULT statement_timestamp();
CREATE INDEX IF NOT EXISTS proof_spin_retention ON pokeslot_proof.operations (recorded_at);
CREATE INDEX IF NOT EXISTS proof_inventory_retention ON pokeslot_proof.inventory_operations (recorded_at);

CREATE TABLE IF NOT EXISTS pokeslot_proof.request_budget (
  scope text PRIMARY KEY,
  bucket bigint NOT NULL,
  used integer NOT NULL
);
CREATE TABLE IF NOT EXISTS pokeslot_proof.retention_cutoff (
  singleton boolean PRIMARY KEY CHECK (singleton),
  through_ms bigint NOT NULL
);
INSERT INTO pokeslot_proof.retention_cutoff VALUES (true, 0) ON CONFLICT DO NOTHING;
REVOKE ALL ON pokeslot_proof.request_budget, pokeslot_proof.retention_cutoff FROM PUBLIC, authenticated, anonymous;

CREATE OR REPLACE FUNCTION pokeslot_proof.take_request_budget(p_scope text, p_seconds integer, p_limit integer)
RETURNS integer LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE v_bucket bigint := floor(extract(epoch FROM clock_timestamp()) / p_seconds);
  v_used integer;
BEGIN
  INSERT INTO pokeslot_proof.request_budget AS b VALUES (p_scope, v_bucket, 1)
  ON CONFLICT (scope) DO UPDATE SET bucket = EXCLUDED.bucket,
    used = CASE WHEN b.bucket < EXCLUDED.bucket THEN 1 ELSE b.used + 1 END
  WHERE b.bucket < EXCLUDED.bucket OR (b.bucket = EXCLUDED.bucket AND b.used < p_limit)
  RETURNING used INTO v_used;
  RETURN v_used;
END;
$f$;

CREATE OR REPLACE FUNCTION pokeslot_proof.prune_results()
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE v_cutoff timestamptz := clock_timestamp() - interval '8 days';
BEGIN
  -- A trava impede a limpeza de concorrer com o aceite de um ID.
  UPDATE pokeslot_proof.retention_cutoff
    SET through_ms = greatest(through_ms, floor(extract(epoch FROM v_cutoff + interval '5 minutes') * 1000)::bigint);
  DELETE FROM pokeslot_proof.operations
    WHERE ctid IN (SELECT ctid FROM pokeslot_proof.operations WHERE recorded_at <= v_cutoff ORDER BY recorded_at LIMIT 2000);
  DELETE FROM pokeslot_proof.inventory_operations
    WHERE ctid IN (SELECT ctid FROM pokeslot_proof.inventory_operations WHERE recorded_at <= v_cutoff ORDER BY recorded_at LIMIT 2000);
END;
$f$;

CREATE OR REPLACE FUNCTION pokeslot_proof.operation_age_status(p_user_id text, p_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE v_id text := p_id::text; v_ms bigint; v_floor bigint;
  v_now bigint := floor(extract(epoch FROM clock_timestamp()) * 1000);
BEGIN
  IF p_id IS NULL THEN RETURN 'operation_expired'; END IF;
  SELECT through_ms INTO v_floor FROM pokeslot_proof.retention_cutoff FOR SHARE;
  IF v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab]' THEN
    -- IDs legados são somente para recuperação, inclusive após a limpeza.
    IF EXISTS (SELECT 1 FROM pokeslot_proof.operations WHERE user_id = p_user_id AND operation_id = p_id)
       OR EXISTS (SELECT 1 FROM pokeslot_proof.inventory_operations WHERE user_id = p_user_id AND operation_id = p_id)
    THEN RETURN 'ok'; END IF;
    RETURN 'operation_expired';
  END IF;
  v_ms := ('x' || left(replace(v_id, '-', ''), 12))::bit(48)::bigint;
  IF v_ms <= greatest(v_floor, v_now - 604800000) THEN RETURN 'operation_expired'; END IF;
  IF v_ms > v_now + 300000 THEN RETURN 'operation_clock'; END IF;
  RETURN 'ok';
END;
$f$;

CREATE OR REPLACE FUNCTION pokeslot_proof.admit_mutation(p_user_id text, p_id uuid)
RETURNS text LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE v_used integer;
BEGIN
  -- A cota compartilhada vale inclusive para replays, que continuam fora da cota de ações novas.
  IF pokeslot_proof.take_request_budget('mutation_minute', 60, 120) IS NULL THEN RETURN 'rate_limited'; END IF;
  v_used := pokeslot_proof.take_request_budget('mutation_day', 86400, 1500);
  IF v_used IS NULL THEN RETURN 'daily_limit'; END IF;
  IF v_used = 1 THEN PERFORM pokeslot_proof.prune_results(); END IF;
  RETURN pokeslot_proof.operation_age_status(p_user_id, p_id);
END;
$f$;

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
  IF pokeslot_proof.take_request_budget('state_minute', 60, 120) IS NULL THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;
  IF pokeslot_proof.take_request_budget('state_day', 86400, 5000) IS NULL THEN
    RETURN jsonb_build_object('status', 'daily_limit');
  END IF;
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
DECLARE v_status text;
BEGIN
  PERFORM pokeslot_proof.lock_active_session(p_user_id, p_session_token);
  v_status := pokeslot_proof.admit_mutation(p_user_id, p_operation_id);
  IF v_status <> 'ok' THEN RETURN jsonb_build_object('status', v_status); END IF;
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
DECLARE v_status text;
BEGIN
  PERFORM pokeslot_proof.lock_active_session(p_user_id, p_session_token);
  v_status := pokeslot_proof.admit_mutation(p_user_id, p_operation_id);
  IF v_status <> 'ok' THEN RETURN jsonb_build_object('status', v_status); END IF;
  RETURN pokeslot_proof.inventory_action(p_user_id, p_operation_id, p_action, p_args);
END;
$function$;

REVOKE ALL ON FUNCTION pokeslot_proof.lock_active_session(text, text) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION pokeslot_proof.session_state(text, text) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION pokeslot_proof.session_spin(text, text, uuid, jsonb) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION pokeslot_proof.session_inventory_action(text, text, uuid, text, jsonb) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION pokeslot_proof.take_request_budget(text, integer, integer),
  pokeslot_proof.prune_results(), pokeslot_proof.operation_age_status(text, uuid),
  pokeslot_proof.admit_mutation(text, uuid) FROM PUBLIC, authenticated, anonymous;
