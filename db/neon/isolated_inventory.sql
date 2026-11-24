-- Somente para o branch isolado. Identidade deve vir do JWT validado no servidor.
-- Execute depois de isolated_game.sql usando scripts/apply-isolated-inventory.mjs.
-- O script aplica este arquivo e carrega o catálogo em uma só transação.
CREATE TABLE IF NOT EXISTS pokeslot_proof.stone_types (
  type text PRIMARY KEY
);
CREATE TABLE IF NOT EXISTS pokeslot_proof.evolution_recipes (
  source_id integer NOT NULL CHECK (source_id BETWEEN 1 AND 151),
  target_id integer NOT NULL CHECK (target_id BETWEEN 1 AND 151),
  stone text NOT NULL REFERENCES pokeslot_proof.stone_types(type),
  PRIMARY KEY (source_id, target_id), CHECK (source_id <> target_id)
);
CREATE TABLE IF NOT EXISTS pokeslot_proof.vouchers (
  user_id text NOT NULL REFERENCES pokeslot_proof.players(user_id),
  type text NOT NULL CHECK (type IN ('pokemon', 'stone', 'type', 'shiny_charm')),
  amount bigint NOT NULL CHECK (amount > 0), PRIMARY KEY (user_id, type)
);
CREATE TABLE IF NOT EXISTS pokeslot_proof.stones (
  user_id text NOT NULL REFERENCES pokeslot_proof.players(user_id),
  type text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0), PRIMARY KEY (user_id, type)
);
CREATE TABLE IF NOT EXISTS pokeslot_proof.inventory_operations (
  user_id text NOT NULL REFERENCES pokeslot_proof.players(user_id),
  operation_id uuid NOT NULL, action text NOT NULL, parameters jsonb NOT NULL,
  result jsonb NOT NULL, PRIMARY KEY (user_id, operation_id)
);
REVOKE ALL ON pokeslot_proof.vouchers, pokeslot_proof.stones, pokeslot_proof.inventory_operations,
  pokeslot_proof.stone_types, pokeslot_proof.evolution_recipes FROM PUBLIC, authenticated, anonymous;

CREATE OR REPLACE FUNCTION pokeslot_proof.inventory_state(p_user_id text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
BEGIN
  PERFORM pokeslot_proof.refresh_locked(p_user_id);
  RETURN jsonb_build_object(
    'vouchers', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', type, 'amount', amount) ORDER BY type) FROM pokeslot_proof.vouchers WHERE user_id = p_user_id), '[]'::jsonb),
    'stones', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', type, 'amount', amount) ORDER BY type) FROM pokeslot_proof.stones WHERE user_id = p_user_id), '[]'::jsonb)
  );
END;
$f$;

CREATE OR REPLACE FUNCTION pokeslot_proof.inventory_action(p_user_id text, p_operation_id uuid, p_action text, p_args jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $f$
DECLARE
  v_previous pokeslot_proof.inventory_operations%ROWTYPE; v_result jsonb; v_params jsonb;
  v_species integer; v_source integer; v_target integer; v_shiny boolean; v_stone text;
  v_rarity text; v_cost integer; v_amount bigint; v_status text;
BEGIN
  IF p_operation_id IS NULL OR p_action IS NULL OR p_args IS NULL OR jsonb_typeof(p_args) <> 'object' THEN
    RAISE EXCEPTION 'invalid inventory operation' USING ERRCODE = '22023';
  END IF;
  IF p_action = 'pokemon' THEN
    IF jsonb_typeof(p_args->'speciesId') IS DISTINCT FROM 'number' OR (p_args->>'speciesId') !~ '^[0-9]{1,3}$' THEN
      RAISE EXCEPTION 'invalid species' USING ERRCODE = '22023';
    END IF;
    v_species := (p_args->>'speciesId')::integer;
    IF v_species NOT BETWEEN 1 AND 151 THEN RAISE EXCEPTION 'invalid species' USING ERRCODE = '22023'; END IF;
    v_params := jsonb_build_object('speciesId', v_species);
    -- Mesmo catálogo provisório de scripts/data/kanto-estudo.mjs.
    IF v_species = ANY(ARRAY[1,4,7,10,13,16,19,21,23,25,27,29,32,35,37,39,41,43,46,48,50,52,54,56,58,60,63,66,69,72,74,77,79,81,84,86,88,90,92,96,98,100,102,104,109,111,116,118,120,129]) THEN v_rarity := 'common'; v_cost := 1;
    ELSIF v_species = ANY(ARRAY[2,5,8,11,12,14,15,17,18,20,22,24,26,28,30,33,36,40,42,44,47,49,51,53,55,57,61,64,67,70,73,75,78,80,82,83,85,87,89,91,93,95,97,99,101,103,105,106,107,108,110,112,114,117,119,122,124,132,133,138,140]) THEN v_rarity := 'uncommon'; v_cost := 2;
    ELSIF v_species = ANY(ARRAY[3,6,9,31,34,38,45,59,62,65,68,71,76,94,113,115,121,123,125,126,127,128,130,131,134,135,136,137,139,141,142,143,147,148]) THEN v_rarity := 'rare'; v_cost := 3;
    ELSIF v_species = ANY(ARRAY[144,145,146,149,150,151]) THEN v_rarity := 'legendary'; v_cost := 4;
    ELSE RAISE EXCEPTION 'species missing from catalog' USING ERRCODE = '22023'; END IF;
  ELSIF p_action = 'stone' OR p_action = 'evolve' THEN
    v_stone := p_args->>'stone';
    IF jsonb_typeof(p_args->'stone') IS DISTINCT FROM 'string' OR NOT EXISTS (
      SELECT 1 FROM pokeslot_proof.stone_types WHERE type = v_stone
    ) THEN
      RAISE EXCEPTION 'invalid stone' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'stone' THEN v_params := jsonb_build_object('stone', v_stone);
    ELSE
      IF jsonb_typeof(p_args->'source') IS DISTINCT FROM 'object' OR jsonb_typeof(p_args->'source'->'speciesId') IS DISTINCT FROM 'number' OR
        (p_args->'source'->>'speciesId') !~ '^[0-9]{1,3}$' OR jsonb_typeof(p_args->'source'->'isShiny') IS DISTINCT FROM 'boolean' OR
        jsonb_typeof(p_args->'targetId') IS DISTINCT FROM 'number' OR (p_args->>'targetId') !~ '^[0-9]{1,3}$' THEN
        RAISE EXCEPTION 'invalid evolution' USING ERRCODE = '22023';
      END IF;
      v_source := (p_args->'source'->>'speciesId')::integer; v_target := (p_args->>'targetId')::integer;
      v_shiny := (p_args->'source'->>'isShiny')::boolean;
      IF v_source NOT BETWEEN 1 AND 151 OR v_target NOT BETWEEN 1 AND 151 THEN RAISE EXCEPTION 'invalid evolution' USING ERRCODE = '22023'; END IF;
      v_params := jsonb_build_object('source', jsonb_build_object('speciesId',v_source,'isShiny',v_shiny), 'targetId',v_target,'stone',v_stone);
    END IF;
  ELSE RAISE EXCEPTION 'invalid inventory action' USING ERRCODE = '22023'; END IF;

  PERFORM pokeslot_proof.refresh_locked(p_user_id);
  IF EXISTS (SELECT 1 FROM pokeslot_proof.operations WHERE user_id = p_user_id AND operation_id = p_operation_id) THEN
    RAISE EXCEPTION 'operation id in use' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_previous FROM pokeslot_proof.inventory_operations WHERE user_id = p_user_id AND operation_id = p_operation_id;
  IF FOUND THEN
    IF v_previous.action <> p_action OR v_previous.parameters <> v_params THEN RAISE EXCEPTION 'operation id in use' USING ERRCODE = '22023'; END IF;
    RETURN v_previous.result || jsonb_build_object('replayed',true);
  END IF;

  IF p_action = 'pokemon' THEN
    SELECT COALESCE((SELECT amount FROM pokeslot_proof.vouchers WHERE user_id = p_user_id AND type = 'pokemon'),0) INTO v_amount;
    IF EXISTS(SELECT 1 FROM pokeslot_proof.variants WHERE user_id = p_user_id AND species_id = v_species AND NOT shiny) THEN v_status := 'already_owned';
    ELSIF v_amount < v_cost THEN v_status := 'insufficient_vouchers';
    ELSE
      IF v_amount = v_cost THEN DELETE FROM pokeslot_proof.vouchers WHERE user_id = p_user_id AND type = 'pokemon';
      ELSE UPDATE pokeslot_proof.vouchers SET amount = amount - v_cost WHERE user_id = p_user_id AND type = 'pokemon'; END IF;
      INSERT INTO pokeslot_proof.variants VALUES (p_user_id,v_species,false); v_status := 'ok';
    END IF;
    v_result := jsonb_build_object('status',v_status,'speciesId',v_species,'rarity',v_rarity,'cost',v_cost);
  ELSIF p_action = 'stone' THEN
    SELECT COALESCE((SELECT amount FROM pokeslot_proof.vouchers WHERE user_id = p_user_id AND type = 'stone'),0) INTO v_amount;
    IF v_amount = 0 THEN v_status := 'insufficient_vouchers'; ELSE
      IF v_amount = 1 THEN DELETE FROM pokeslot_proof.vouchers WHERE user_id = p_user_id AND type = 'stone';
      ELSE UPDATE pokeslot_proof.vouchers SET amount = amount - 1 WHERE user_id = p_user_id AND type = 'stone'; END IF;
      INSERT INTO pokeslot_proof.stones VALUES (p_user_id,v_stone,1) ON CONFLICT (user_id,type) DO UPDATE SET amount = pokeslot_proof.stones.amount + 1;
      v_status := 'ok';
    END IF;
    v_result := jsonb_build_object('status',v_status,'stone',v_stone);
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM pokeslot_proof.evolution_recipes
      WHERE source_id = v_source AND target_id = v_target AND stone = v_stone
    ) THEN v_status := 'incompatible';
    ELSIF NOT EXISTS(SELECT 1 FROM pokeslot_proof.variants WHERE user_id = p_user_id AND species_id = v_source AND shiny = v_shiny) THEN v_status := 'source_unavailable';
    ELSIF EXISTS(SELECT 1 FROM pokeslot_proof.variants WHERE user_id = p_user_id AND species_id = v_target AND shiny = v_shiny) THEN v_status := 'already_registered';
    ELSE
      SELECT COALESCE((SELECT amount FROM pokeslot_proof.stones WHERE user_id = p_user_id AND type = v_stone),0) INTO v_amount;
      IF v_amount = 0 THEN v_status := 'missing_stone'; ELSE
        IF v_amount = 1 THEN DELETE FROM pokeslot_proof.stones WHERE user_id = p_user_id AND type = v_stone;
        ELSE UPDATE pokeslot_proof.stones SET amount = amount - 1 WHERE user_id = p_user_id AND type = v_stone; END IF;
        INSERT INTO pokeslot_proof.variants VALUES (p_user_id,v_target,v_shiny); v_status := 'ok';
      END IF;
    END IF;
    v_result := v_params || jsonb_build_object('status',v_status);
  END IF;
  INSERT INTO pokeslot_proof.inventory_operations VALUES (p_user_id,p_operation_id,p_action,v_params,v_result);
  RETURN v_result || jsonb_build_object('replayed',false);
END;
$f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pokeslot_proof FROM PUBLIC, authenticated, anonymous;

