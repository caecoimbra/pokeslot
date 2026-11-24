-- Somente no branch isolado proof-identity-safe.
-- Encerra as rotas da prova antiga sem remover suas tabelas ou registros.
BEGIN;
REVOKE ALL ON FUNCTION public.consume_test_spin_once(text, uuid) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION public.refresh_own_replenishment() FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON FUNCTION public.refresh_test_replenishment_bound(text) FROM PUBLIC, authenticated, anonymous;
REVOKE ALL ON TABLE public.proof_player_state FROM PUBLIC, authenticated, anonymous;
REVOKE SELECT (user_id, balance, refills_accounted_until), INSERT (user_id)
  ON TABLE public.proof_player_state FROM PUBLIC, authenticated, anonymous;
COMMIT;
