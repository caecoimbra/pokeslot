-- Executar em uma transação como proprietário do esquema, somente no branch isolado.
-- O login e sua credencial devem ser provisionados separadamente.
DO $role$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pokeslot_runtime') THEN
    CREATE ROLE pokeslot_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSIF EXISTS (SELECT FROM pg_roles WHERE rolname = 'pokeslot_runtime' AND
    (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'Unexpected privileges on pokeslot_runtime';
  END IF;
END;
$role$;
GRANT USAGE ON SCHEMA pokeslot_proof TO pokeslot_runtime;

-- Atualiza também instalações anteriores em que essas entradas eram SECURITY INVOKER.
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
