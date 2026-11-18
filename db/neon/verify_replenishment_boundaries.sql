-- Teste administrativo controlado; não disponibilizar pela Data API.
-- As linhas temporárias são revertidas ao final da transação.
BEGIN;
DO $test$
DECLARE
    r record;
    base timestamptz := '2026-01-01 00:00:00+00';
BEGIN
    INSERT INTO public.proof_player_state (user_id, balance, refills_accounted_until) VALUES
        ('proof-temporal-before-unique', 10, base),
        ('proof-temporal-exact-unique', 10, base),
        ('proof-temporal-53h-unique', 10, base);

    SELECT * INTO r FROM proof_private.apply_replenishment('proof-temporal-before-unique', base + interval '23 hours 59 minutes 59 seconds');
    IF r.balance <> 10 OR r.periods_added <> 0 OR r.accounted_until <> base OR r.next_replenishment_at <> base + interval '24 hours' THEN
        RAISE EXCEPTION 'before boundary failed';
    END IF;

    SELECT * INTO r FROM proof_private.apply_replenishment('proof-temporal-exact-unique', base + interval '24 hours');
    IF r.balance <> 20 OR r.periods_added <> 1 OR r.accounted_until <> base + interval '24 hours' OR r.next_replenishment_at <> base + interval '48 hours' THEN
        RAISE EXCEPTION 'exact boundary failed';
    END IF;

    SELECT * INTO r FROM proof_private.apply_replenishment('proof-temporal-53h-unique', base + interval '53 hours');
    IF r.balance <> 30 OR r.periods_added <> 2 OR r.accounted_until <> base + interval '48 hours' OR r.next_replenishment_at <> base + interval '72 hours' THEN
        RAISE EXCEPTION '53h failed';
    END IF;

    SELECT * INTO r FROM proof_private.apply_replenishment('proof-temporal-53h-unique', base + interval '53 hours');
    IF r.balance <> 30 OR r.periods_added <> 0 THEN
        RAISE EXCEPTION 'repeated call failed';
    END IF;
END;
$test$;
ROLLBACK;
