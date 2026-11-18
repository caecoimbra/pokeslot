-- Teste administrativo exclusivo do branch de prova. Tudo é revertido.
-- As claims são simuladas pelo proprietário: isto não testa o caminho HTTP.
BEGIN;
SELECT auth.user_id(); -- Carrega a extensão antes de simular claims nesta conexão.
DO $test$
DECLARE
    r record;
    v_count integer;
    op uuid := '00000000-0000-4000-8000-000000000001';
BEGIN
    IF has_function_privilege('authenticated', 'proof_private.consume_verified_spin(text,uuid)', 'EXECUTE')
       OR has_function_privilege('anonymous', 'proof_private.consume_verified_spin(text,uuid)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'proof_private.refresh_verified_state(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'private function executable by API role';
    END IF;
    SELECT * INTO r FROM proof_private.refresh_verified_state('proof-idempotency-new');
    IF r.balance <> 10 OR r.periods_added <> 0 THEN RAISE EXCEPTION 'first access failed'; END IF;
    INSERT INTO public.proof_player_state (user_id, balance)
    VALUES ('proof-idempotency-a', 10), ('proof-idempotency-b', 10);

    PERFORM set_config('request.jwt.claims', '{"sub":"proof-idempotency-a"}', true);
    SELECT * INTO r FROM public.consume_test_spin_once('proof-idempotency-a', op);
    IF r.balance <> 9 OR r.replayed THEN RAISE EXCEPTION 'first operation failed'; END IF;
    SELECT * INTO r FROM public.consume_test_spin_once('proof-idempotency-a', op);
    IF r.balance <> 9 OR NOT r.replayed THEN RAISE EXCEPTION 'replay failed'; END IF;
    SELECT * INTO r FROM public.refresh_test_replenishment_bound('proof-idempotency-a');
    IF r.balance <> 9 OR r.periods_added <> 0 THEN RAISE EXCEPTION 'bound refresh failed'; END IF;
    SELECT count(*) INTO v_count FROM proof_private.test_spin_operations
        WHERE user_id = 'proof-idempotency-a';
    IF v_count <> 1 THEN RAISE EXCEPTION 'duplicate operation recorded'; END IF;

    PERFORM set_config('request.jwt.claims', '{"sub":"proof-idempotency-b"}', true);
    BEGIN
        PERFORM public.consume_test_spin_once('proof-idempotency-a', op);
        RAISE EXCEPTION 'account mismatch unexpectedly accepted';
    EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
    END;
    BEGIN
        PERFORM public.refresh_test_replenishment_bound('proof-idempotency-a');
        RAISE EXCEPTION 'account mismatch in refresh unexpectedly accepted';
    EXCEPTION WHEN SQLSTATE 'PZ002' THEN NULL;
    END;
    SELECT * INTO r FROM public.consume_test_spin_once('proof-idempotency-b', op);
    IF r.balance <> 9 OR r.replayed THEN RAISE EXCEPTION 'user isolation failed'; END IF;

    PERFORM set_config('request.jwt.claims', '', true);
    BEGIN
        PERFORM public.consume_test_spin_once('proof-idempotency-a', op);
        RAISE EXCEPTION 'missing identity unexpectedly accepted';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
    END;
    BEGIN
        PERFORM public.refresh_test_replenishment_bound('proof-idempotency-a');
        RAISE EXCEPTION 'missing refresh identity unexpectedly accepted';
    EXCEPTION WHEN SQLSTATE 'PZ001' THEN NULL;
    END;
    IF (SELECT balance FROM public.proof_player_state WHERE user_id = 'proof-idempotency-a') <> 9
       OR (SELECT balance FROM public.proof_player_state WHERE user_id = 'proof-idempotency-b') <> 9 THEN
        RAISE EXCEPTION 'rejected call changed balance';
    END IF;
END;
$test$;
ROLLBACK;
