-- Somente para o branch isolado proof-identity-safe; não aplicar em production.
-- O usuário e o resultado são fornecidos pela função de servidor autenticada,
-- nunca por uma API pública nem por parâmetros aceitos do navegador.
BEGIN;
CREATE SCHEMA IF NOT EXISTS pokeslot_proof;
REVOKE ALL ON SCHEMA pokeslot_proof FROM PUBLIC, authenticated, anonymous;

CREATE TABLE IF NOT EXISTS pokeslot_proof.players (
  user_id text PRIMARY KEY,
  balance bigint NOT NULL CHECK (balance >= 0),
  cycle_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS pokeslot_proof.variants (
  user_id text NOT NULL REFERENCES pokeslot_proof.players(user_id),
  species_id integer NOT NULL CHECK (species_id BETWEEN 1 AND 151),
  shiny boolean NOT NULL,
  PRIMARY KEY (user_id, species_id, shiny)
);
CREATE TABLE IF NOT EXISTS pokeslot_proof.operations (
  user_id text NOT NULL REFERENCES pokeslot_proof.players(user_id),
  operation_id uuid NOT NULL,
  result jsonb NOT NULL,
  PRIMARY KEY (user_id, operation_id)
);
REVOKE ALL ON ALL TABLES IN SCHEMA pokeslot_proof FROM PUBLIC, authenticated, anonymous;

CREATE OR REPLACE FUNCTION pokeslot_proof.refresh_locked(p_user_id text)
RETURNS void LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE v_cycle timestamptz; v_now timestamptz; v_periods bigint;
BEGIN
  IF p_user_id IS NULL OR p_user_id = '' THEN RAISE EXCEPTION 'identity required'; END IF;
  INSERT INTO pokeslot_proof.players VALUES (p_user_id, 20, clock_timestamp()) ON CONFLICT DO NOTHING;
  SELECT cycle_at INTO v_cycle FROM pokeslot_proof.players WHERE user_id = p_user_id FOR UPDATE;
  v_now := clock_timestamp();
  IF v_now < v_cycle THEN RAISE EXCEPTION 'invalid server clock'; END IF;
  v_periods := floor(extract(epoch FROM (v_now - v_cycle)) / 86400)::bigint;
  UPDATE pokeslot_proof.players SET balance = balance + 10 * v_periods,
    cycle_at = cycle_at + interval '24 hours' * v_periods
    WHERE user_id = p_user_id;
END;
$f$;

CREATE OR REPLACE FUNCTION pokeslot_proof.get_state(p_user_id text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE v_result jsonb;
BEGIN
  PERFORM pokeslot_proof.refresh_locked(p_user_id);
  SELECT jsonb_build_object('balance', p.balance, 'cycleAt', p.cycle_at,
    'ownedVariants', COALESCE((SELECT jsonb_agg(jsonb_build_object('speciesId', v.species_id, 'isShiny', v.shiny) ORDER BY v.species_id, v.shiny)
      FROM pokeslot_proof.variants v WHERE v.user_id = p_user_id), '[]'::jsonb))
    INTO v_result FROM pokeslot_proof.players p WHERE p.user_id = p_user_id;
  RETURN v_result;
END;
$f$;

CREATE OR REPLACE FUNCTION pokeslot_proof.spin(p_user_id text, p_operation_id uuid, p_round jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE v_previous jsonb; v_balance bigint; v_entry jsonb; v_capture jsonb; v_outcomes jsonb := '[]'::jsonb; v_status text; v_result jsonb;
BEGIN
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'operation required'; END IF;
  -- A trava também serializa chamadas com identificadores diferentes.
  PERFORM pokeslot_proof.refresh_locked(p_user_id);
  SELECT result INTO v_previous FROM pokeslot_proof.operations WHERE user_id = p_user_id AND operation_id = p_operation_id;
  IF FOUND THEN RETURN v_previous || jsonb_build_object('replayed', true); END IF;
  SELECT balance INTO v_balance FROM pokeslot_proof.players WHERE user_id = p_user_id;
  IF v_balance = 0 THEN
    v_result := jsonb_build_object('status', 'no_balance', 'balance', 0);
  ELSE
    IF jsonb_typeof(p_round->'grid') <> 'array' OR jsonb_typeof(p_round->'winningLines') <> 'array' OR jsonb_typeof(p_round->'captures') <> 'array' THEN
      RAISE EXCEPTION 'invalid round';
    END IF;
    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_round->'captures') LOOP
      v_capture := v_entry->'capture';
      INSERT INTO pokeslot_proof.variants(user_id, species_id, shiny)
        VALUES (p_user_id, (v_capture->>'speciesId')::integer, (v_capture->>'isShiny')::boolean)
        ON CONFLICT DO NOTHING;
      IF FOUND THEN v_status := 'new'; ELSE v_status := 'duplicate'; END IF;
      v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object('line', v_entry->>'line', 'capture', v_capture, 'status', v_status));
    END LOOP;
    UPDATE pokeslot_proof.players SET balance = balance - 1 WHERE user_id = p_user_id;
    v_result := jsonb_build_object('status', 'ok', 'balance', v_balance - 1,
      'grid', p_round->'grid', 'winningLines', p_round->'winningLines', 'captures', v_outcomes);
  END IF;
  INSERT INTO pokeslot_proof.operations VALUES (p_user_id, p_operation_id, v_result);
  RETURN v_result || jsonb_build_object('replayed', false);
END;
$f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pokeslot_proof FROM PUBLIC, authenticated, anonymous;
COMMIT;
