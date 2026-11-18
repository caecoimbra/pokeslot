-- Reposição da prova: 10 giros por período completo de 24 horas.
-- Execute como proprietário, com o Data API já habilitado.
-- O relógio de teste e o ID arbitrário existem apenas na função privada.
BEGIN;

CREATE SCHEMA IF NOT EXISTS proof_private;
REVOKE ALL ON SCHEMA proof_private FROM PUBLIC;

CREATE OR REPLACE FUNCTION proof_private.apply_replenishment(
    p_user_id text,
    p_test_now timestamptz
)
RETURNS TABLE (
    balance integer,
    periods_added integer,
    accounted_until timestamptz,
    next_replenishment_at timestamptz
)
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
    v_player public.proof_player_state%ROWTYPE;
    v_now timestamptz;
    v_periods integer;
BEGIN
    SELECT p.* INTO v_player
      FROM public.proof_player_state AS p
     WHERE p.user_id = p_user_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'player state not found';
    END IF;

    -- Em produção, o instante é lido após obter a trava da linha.
    v_now := COALESCE(p_test_now, clock_timestamp());
    IF v_now < v_player.refills_accounted_until THEN
        RAISE EXCEPTION 'database time is earlier than the stored refill marker';
    END IF;

    v_periods := floor(extract(epoch FROM (v_now - v_player.refills_accounted_until)) / 86400)::integer;
    IF v_periods > 0 THEN
        UPDATE public.proof_player_state AS p
           SET balance = p.balance + 10 * v_periods,
               refills_accounted_until = p.refills_accounted_until + interval '24 hours' * v_periods
         WHERE p.user_id = p_user_id
         RETURNING p.* INTO v_player;
    END IF;

    RETURN QUERY SELECT v_player.balance, v_periods, v_player.refills_accounted_until,
        v_player.refills_accounted_until + interval '24 hours';
END;
$function$;

REVOKE ALL ON FUNCTION proof_private.apply_replenishment(text, timestamptz) FROM PUBLIC;

-- Único ponto de entrada para o jogador: sem parâmetros e com identidade da sessão.
CREATE OR REPLACE FUNCTION public.refresh_own_replenishment()
RETURNS TABLE (
    balance integer,
    periods_added integer,
    accounted_until timestamptz,
    next_replenishment_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_user_id text := auth.user_id();
BEGIN
    IF v_user_id IS NULL THEN
        -- Código exclusivo: a recusa ocorre antes de qualquer alteração.
        RAISE EXCEPTION USING ERRCODE = 'PZ001',
            MESSAGE = 'identity context missing; request rejected before update';
    END IF;

    -- Primeiro acesso: o ID é obtido da sessão, e a inserção é idempotente.
    INSERT INTO public.proof_player_state (user_id)
    VALUES (v_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    RETURN QUERY SELECT * FROM proof_private.apply_replenishment(v_user_id, NULL);
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_own_replenishment() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_own_replenishment() TO authenticated;

COMMIT;
