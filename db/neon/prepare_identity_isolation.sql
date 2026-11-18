-- Preparação segura antes de habilitar o Data API no branch production.
-- A tabela antiga continua no banco, mas sem políticas RLS fica inacessível
-- por papéis sem privilégio de proprietário quando a API for ativada.

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.players FROM PUBLIC;

-- Tabela isolada para as contas fictícias da prova.
-- Sem políticas e sem grants neste primeiro passo, o comportamento é negar acesso.
CREATE TABLE IF NOT EXISTS public.proof_player_state (
    user_id text PRIMARY KEY,
    balance integer NOT NULL DEFAULT 10 CHECK (balance >= 0),
    refills_accounted_until timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.proof_player_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.proof_player_state FROM PUBLIC;
