-- Executar em uma transação como proprietário do esquema, somente no branch isolado.
-- O login e sua credencial devem ser provisionados separadamente.
CREATE ROLE pokeslot_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA pokeslot_proof TO pokeslot_runtime;

-- Somente as entradas da API elevam privilégios. A verificação da sessão
-- e o bloqueio de revogação permanecem na transação de cada operação.
ALTER FUNCTION pokeslot_proof.session_state(text, text) SECURITY DEFINER;
ALTER FUNCTION pokeslot_proof.session_spin(text, text, uuid, jsonb) SECURITY DEFINER;
ALTER FUNCTION pokeslot_proof.session_inventory_action(text, text, uuid, text, jsonb) SECURITY DEFINER;
ALTER FUNCTION pokeslot_proof.session_state(text, text) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION pokeslot_proof.session_spin(text, text, uuid, jsonb) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION pokeslot_proof.session_inventory_action(text, text, uuid, text, jsonb) SET search_path = pg_catalog, pg_temp;

REVOKE ALL ON FUNCTION
  pokeslot_proof.session_state(text, text),
  pokeslot_proof.session_spin(text, text, uuid, jsonb),
  pokeslot_proof.session_inventory_action(text, text, uuid, text, jsonb)
  FROM PUBLIC, authenticated, anonymous;
GRANT EXECUTE ON FUNCTION
  pokeslot_proof.session_state(text, text),
  pokeslot_proof.session_spin(text, text, uuid, jsonb),
  pokeslot_proof.session_inventory_action(text, text, uuid, text, jsonb)
  TO pokeslot_runtime;
