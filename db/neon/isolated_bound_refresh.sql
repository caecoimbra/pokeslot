-- Somente para o branch de prova, depois de isolated_function_backend.sql.
-- O parâmetro compara a sessão iniciadora, mas não escolhe a conta no banco.
BEGIN;
CREATE OR REPLACE FUNCTION public.refresh_test_replenishment_bound(p_expected_user_id text)
RETURNS TABLE (balance integer, periods_added integer, accounted_until timestamptz, next_replenishment_at timestamptz)
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
    RETURN QUERY SELECT * FROM proof_private.refresh_verified_state(v_user_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.refresh_test_replenishment_bound(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_test_replenishment_bound(text) TO authenticated;
COMMIT;
