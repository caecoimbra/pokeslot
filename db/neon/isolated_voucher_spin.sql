-- Somente no branch isolado; aplicar após isolated_inventory.sql.
BEGIN;
CREATE OR REPLACE FUNCTION pokeslot_proof.spin(p_user_id text, p_operation_id uuid, p_round jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE v_previous jsonb; v_balance bigint; v_entry jsonb; v_capture jsonb; v_outcomes jsonb := '[]'::jsonb; v_status text; v_result jsonb;
  v_line_spins integer := 0; v_duplicate_spins integer := 0; v_compensation integer;
  v_voucher_spins integer := 0; v_vouchers jsonb := '[]'::jsonb; v_voucher_type text;
BEGIN
  IF p_operation_id IS NULL THEN RAISE EXCEPTION 'operation required'; END IF;
  -- A trava também serializa chamadas com identificadores diferentes.
  PERFORM pokeslot_proof.refresh_locked(p_user_id);
  IF EXISTS (SELECT 1 FROM pokeslot_proof.inventory_operations WHERE user_id = p_user_id AND operation_id = p_operation_id) THEN
    RAISE EXCEPTION 'operation id already used';
  END IF;
  SELECT result INTO v_previous FROM pokeslot_proof.operations WHERE user_id = p_user_id AND operation_id = p_operation_id;
  IF FOUND THEN RETURN v_previous || jsonb_build_object('replayed', true); END IF;
  IF NOT pokeslot_proof.consume_operation_quota(p_user_id) THEN
    RETURN jsonb_build_object('status', 'rate_limited');
  END IF;
  SELECT balance INTO v_balance FROM pokeslot_proof.players WHERE user_id = p_user_id;
  IF v_balance = 0 THEN
    v_result := jsonb_build_object('status', 'no_balance', 'balance', 0);
  ELSE
    IF jsonb_typeof(p_round->'grid') <> 'array' OR jsonb_typeof(p_round->'winningLines') <> 'array' OR jsonb_typeof(p_round->'captures') <> 'array' THEN
      RAISE EXCEPTION 'invalid round';
    END IF;
    -- Valores exclusivamente experimentais da tabela C. Cada linha vale separadamente.
    SELECT 2 * count(*)::integer INTO v_line_spins
      FROM jsonb_array_elements(p_round->'winningLines') AS w(value)
      WHERE w.value->>'symbol' = 'spin';
    FOR v_entry IN SELECT value FROM jsonb_array_elements(p_round->'captures') LOOP
      v_capture := v_entry->'capture';
      IF v_capture->>'rarity' IS NULL OR v_capture->>'rarity' NOT IN ('common', 'uncommon', 'rare', 'legendary') THEN
        RAISE EXCEPTION 'invalid rarity';
      END IF;
      INSERT INTO pokeslot_proof.variants(user_id, species_id, shiny)
        VALUES (p_user_id, (v_capture->>'speciesId')::integer, (v_capture->>'isShiny')::boolean)
        ON CONFLICT DO NOTHING;
      IF FOUND THEN v_status := 'new'; ELSE v_status := 'duplicate'; END IF;
      v_compensation := 0;
      IF v_status = 'duplicate' THEN
        v_compensation := CASE v_capture->>'rarity' WHEN 'common' THEN 1 WHEN 'uncommon' THEN 1 WHEN 'rare' THEN 2 WHEN 'legendary' THEN 3 END;
        IF (v_capture->>'isShiny')::boolean THEN v_compensation := v_compensation * 2; END IF;
        v_duplicate_spins := v_duplicate_spins + v_compensation;
      END IF;
      v_outcomes := v_outcomes || jsonb_build_array(jsonb_build_object('line', v_entry->>'line', 'capture', v_capture, 'status', v_status, 'compensationSpins', v_compensation));
    END LOOP;
    -- A ausência do campo preserva compatibilidade com funções e testes antigos.
    IF p_round ? 'vouchers' THEN
      IF jsonb_typeof(p_round->'vouchers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid vouchers'; END IF;
      IF jsonb_array_length(p_round->'vouchers') <> (
        SELECT count(*) FROM jsonb_array_elements(p_round->'winningLines') AS w(value) WHERE w.value->>'symbol' = 'voucher'
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_round->'vouchers') AS v(value)
        WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_round->'winningLines') AS w(value)
          WHERE w.value->>'symbol' = 'voucher' AND w.value->>'line' = v.value->>'line')
      ) OR (SELECT count(DISTINCT value->>'line') FROM jsonb_array_elements(p_round->'vouchers')) <> jsonb_array_length(p_round->'vouchers')
      THEN RAISE EXCEPTION 'invalid voucher lines'; END IF;
      FOR v_entry IN SELECT value FROM jsonb_array_elements(p_round->'vouchers') LOOP
        v_voucher_type := v_entry->>'type';
        IF v_voucher_type IS NULL OR v_voucher_type NOT IN ('pokemon', 'stone', 'spins', 'type', 'shiny_charm') THEN
          RAISE EXCEPTION 'invalid voucher type';
        END IF;
        IF v_voucher_type = 'spins' THEN
          v_voucher_spins := v_voucher_spins + 2;
          v_vouchers := v_vouchers || jsonb_build_array(v_entry || jsonb_build_object('spinsAwarded', 2));
        ELSE
          INSERT INTO pokeslot_proof.vouchers(user_id, type, amount) VALUES (p_user_id, v_voucher_type, 1)
            ON CONFLICT (user_id, type) DO UPDATE SET amount = pokeslot_proof.vouchers.amount + 1;
          v_vouchers := v_vouchers || jsonb_build_array(v_entry);
        END IF;
      END LOOP;
    END IF;
    UPDATE pokeslot_proof.players SET balance = balance - 1 + v_line_spins + v_duplicate_spins + v_voucher_spins WHERE user_id = p_user_id;
    v_result := jsonb_build_object('status', 'ok', 'balance', v_balance - 1 + v_line_spins + v_duplicate_spins + v_voucher_spins,
      'grid', p_round->'grid', 'winningLines', p_round->'winningLines', 'captures', v_outcomes,
      'lineSpins', v_line_spins, 'duplicateSpins', v_duplicate_spins, 'vouchers', v_vouchers, 'voucherSpins', v_voucher_spins);
  END IF;
  INSERT INTO pokeslot_proof.operations VALUES (p_user_id, p_operation_id, v_result);
  RETURN v_result || jsonb_build_object('replayed', false);
END;
$f$;
REVOKE ALL ON FUNCTION pokeslot_proof.spin(text, uuid, jsonb) FROM PUBLIC, authenticated, anonymous;
COMMIT;
