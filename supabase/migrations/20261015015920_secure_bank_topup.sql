BEGIN;

-- The browser must not be able to mint wallet balance without a confirmed
-- debit from the banking API. Keep a durable reconciliation record because
-- the bank and Postgres cannot share a single distributed transaction.
CREATE TABLE public.wallet_topup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0 AND amount <= 1000),
  bank_account text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'bank_debited', 'completed', 'failed')),
  bank_balance_after numeric,
  wallet_balance_after numeric,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wallet_topup_requests_user_created_idx
  ON public.wallet_topup_requests (user_id, created_at DESC);

ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_topup_requests FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.wallet_topup_requests TO service_role;

CREATE OR REPLACE FUNCTION public.finalize_bank_topup(_request_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _request public.wallet_topup_requests%ROWTYPE;
  _balance numeric;
BEGIN
  SELECT * INTO _request
  FROM public.wallet_topup_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud de recarga no encontrada';
  END IF;

  IF _request.status = 'completed' THEN
    RETURN _request.wallet_balance_after;
  END IF;

  IF _request.status <> 'bank_debited' THEN
    RAISE EXCEPTION 'El débito bancario aún no fue confirmado';
  END IF;

  UPDATE public.passengers
  SET balance = balance + _request.amount
  WHERE id = _request.user_id
    AND status = 'active'
  RETURNING balance INTO _balance;

  IF _balance IS NULL THEN
    RAISE EXCEPTION 'Solo un pasajero activo puede recargar saldo';
  END IF;

  INSERT INTO public.wallet_topups (user_id, amount, method)
  VALUES (_request.user_id, _request.amount, 'bank_api');

  UPDATE public.wallet_topup_requests
  SET status = 'completed',
      wallet_balance_after = _balance,
      updated_at = now()
  WHERE id = _request_id;

  RETURN _balance;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_bank_topup(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_bank_topup(uuid) TO service_role;

-- Retire the insecure client-callable credit path. The function is retained
-- temporarily for compatibility, but only the service role can execute it.
REVOKE ALL ON FUNCTION public.topup_wallet(numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.topup_wallet(numeric, text) TO service_role;

COMMIT;
