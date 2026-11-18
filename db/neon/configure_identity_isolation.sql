-- Política mínima para a prova com Managed Better Auth + Neon Data API.
-- A tabela antiga public.players fica com RLS ligado e sem políticas.
-- O app pode ler/criar a própria linha; não recebe UPDATE nem DELETE direto.

CREATE POLICY proof_player_select_own
    ON public.proof_player_state
    FOR SELECT
    TO authenticated
    USING ((SELECT auth.user_id()) = user_id);

CREATE POLICY proof_player_insert_own
    ON public.proof_player_state
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT auth.user_id()) = user_id);

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT (user_id, balance, refills_accounted_until)
    ON public.proof_player_state TO authenticated;
GRANT INSERT (user_id)
    ON public.proof_player_state TO authenticated;

-- A única alteração de saldo liberada à sessão é gastar um giro por chamada.
-- O identificador vem da identidade autenticada, nunca de um parâmetro do app.
CREATE OR REPLACE FUNCTION public.consume_test_spin()
RETURNS TABLE (balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_user_id text;
    v_balance integer;
BEGIN
    v_user_id := auth.user_id();

    IF v_user_id IS NULL THEN
        -- Essa recusa acontece antes da alteração de saldo.
        RAISE EXCEPTION USING ERRCODE = 'PZ001',
            MESSAGE = 'identity context missing; request rejected before update';
    END IF;

    UPDATE public.proof_player_state AS p
       SET balance = p.balance - 1
     WHERE p.user_id = v_user_id
       AND p.balance > 0
     RETURNING p.balance INTO v_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'player state not found or balance is zero';
    END IF;

    RETURN QUERY SELECT v_balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_test_spin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_test_spin() TO authenticated;
