-- Prova técnica do Neon: reposição ilustrativa de 10 giros por período completo de 24 h.
-- Não é a regra final do PokéSlot. A função usa o relógio do banco; não recebe horário do cliente.
-- Não conceder EXECUTE a uma API pública: a autorização do jogador ainda não está implementada.

CREATE OR REPLACE FUNCTION public.apply_replenishment(p_player_id text)
RETURNS TABLE (
    balance integer,
    periods_added integer,
    accounted_until timestamptz,
    next_replenishment_at timestamptz
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
    v_player public.players%ROWTYPE;
    v_now timestamptz;
    v_periods integer;
BEGIN
    -- A trava por linha serializa as chamadas simultâneas para este jogador.
    SELECT p.*
      INTO v_player
      FROM public.players AS p
     WHERE p.player_id = p_player_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'player not found';
    END IF;

    -- Ler o relógio depois de obter a trava para calcular com o horário atual do servidor.
    v_now := clock_timestamp();

    IF v_now < v_player.refills_accounted_until THEN
        RAISE EXCEPTION 'database time is earlier than the stored refill marker';
    END IF;

    v_periods := floor(
        extract(epoch FROM (v_now - v_player.refills_accounted_until)) / 86400
    )::integer;

    IF v_periods > 0 THEN
        UPDATE public.players AS p
           SET balance = p.balance + (10 * v_periods),
               refills_accounted_until = p.refills_accounted_until
                   + (interval '24 hours' * v_periods)
         WHERE p.player_id = p_player_id
         RETURNING p.* INTO v_player;
    END IF;

    RETURN QUERY
    SELECT v_player.balance,
           v_periods,
           v_player.refills_accounted_until,
           v_player.refills_accounted_until + interval '24 hours';
END;
$function$;

-- Apenas o proprietário da função pode chamá-la nesta etapa da prova.
REVOKE ALL ON FUNCTION public.apply_replenishment(text) FROM PUBLIC;
