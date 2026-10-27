BEGIN;

-- Balance writes from browser sessions remain protected. Trusted wallet RPCs
-- opt in for the duration of their transaction with a private Postgres GUC.
CREATE OR REPLACE FUNCTION public.protect_sensitive_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('qrbus.trusted_balance_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR public.is_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.balance := 0;
    NEW.status := 'pending';
    NEW.resubmission_count := 0;
  ELSE
    NEW.balance := OLD.balance;
    IF NEW.status IS DISTINCT FROM OLD.status
      AND NOT (OLD.status = 'rejected' AND NEW.status = 'pending') THEN
      NEW.status := OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- A fare is a wallet-to-wallet transfer. Both wallets and the audit row are
-- committed together, and both account rows are locked against concurrent use.
CREATE OR REPLACE FUNCTION public.pay_fare_group(
  _driver_code text,
  _companions public.fare_category[] DEFAULT '{}',
  _lat numeric DEFAULT NULL,
  _lng numeric DEFAULT NULL
)
RETURNS TABLE(
  verification_code text,
  total numeric,
  base_amount numeric,
  extra_amount numeric,
  category public.fare_category,
  tickets integer,
  new_balance numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _p public.passengers%ROWTYPE;
  _d public.drivers%ROWTYPE;
  _base numeric;
  _extra numeric := 0;
  _total numeric;
  _code text;
  _passenger_balance numeric;
  _ticket_count integer;
  _category public.fare_category;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  _ticket_count := 1 + coalesce(array_length(_companions, 1), 0);
  IF _ticket_count > 10 THEN
    RAISE EXCEPTION 'Máximo 10 pasajes';
  END IF;

  SELECT * INTO _p
  FROM public.passengers
  WHERE id = auth.uid()
  FOR UPDATE;

  IF _p.id IS NULL OR _p.status <> 'active' THEN
    RAISE EXCEPTION 'Pasajero no activo';
  END IF;

  SELECT * INTO _d
  FROM public.drivers
  WHERE upper(driver_code) = upper(trim(_driver_code))
    AND status = 'active'
  FOR UPDATE;

  IF _d.id IS NULL THEN
    RAISE EXCEPTION 'Chofer no encontrado o no activo';
  END IF;

  _base := public.fare_for_category(_p.fare_category);
  IF _companions IS NOT NULL THEN
    FOREACH _category IN ARRAY _companions LOOP
      _extra := _extra + public.fare_for_category(_category);
    END LOOP;
  END IF;

  _total := _base + _extra;
  IF _p.balance < _total THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  _code := lpad(floor(random() * 100000)::integer::text, 5, '0');
  PERFORM set_config('qrbus.trusted_balance_write', 'on', true);

  UPDATE public.passengers
  SET balance = balance - _total
  WHERE id = _p.id
  RETURNING balance INTO _passenger_balance;

  UPDATE public.drivers
  SET balance = balance + _total
  WHERE id = _d.id;

  INSERT INTO public.transactions (
    driver_id, passenger_id, category, amount, verification_code,
    tickets, latitude, longitude
  ) VALUES (
    _d.id, _p.id, _p.fare_category, _total, _code,
    _ticket_count, _lat, _lng
  );

  RETURN QUERY
  SELECT _code, _total, _base, _extra, _p.fare_category,
         _ticket_count, _passenger_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_fare_group(
  text, public.fare_category[], numeric, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_fare_group(
  text, public.fare_category[], numeric, numeric
) TO authenticated, service_role;

CREATE TABLE public.wallet_withdrawal_requests (
  id uuid PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0 AND amount <= 1000),
  bank_account text NOT NULL,
  status text NOT NULL DEFAULT 'wallet_reserved'
    CHECK (status IN (
      'wallet_reserved',
      'bank_credit_confirmed',
      'completed',
      'failed',
      'reconciliation_required'
    )),
  bank_balance_after numeric,
  wallet_balance_after numeric,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wallet_withdrawal_requests_driver_created_idx
  ON public.wallet_withdrawal_requests (driver_id, created_at DESC);

CREATE UNIQUE INDEX wallet_withdrawal_requests_one_unresolved_idx
  ON public.wallet_withdrawal_requests (driver_id)
  WHERE status IN (
    'wallet_reserved', 'bank_credit_confirmed', 'reconciliation_required'
  );

ALTER TABLE public.wallet_withdrawal_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wallet_withdrawal_requests
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.wallet_withdrawal_requests TO service_role;

ALTER TABLE public.withdrawals
  ADD COLUMN request_id uuid REFERENCES public.wallet_withdrawal_requests(id);
CREATE UNIQUE INDEX withdrawals_request_id_uidx
  ON public.withdrawals (request_id)
  WHERE request_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.reserve_bank_withdrawal(
  _request_id uuid,
  _driver_id uuid,
  _amount numeric
)
RETURNS TABLE(wallet_balance numeric, bank_account text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _driver public.drivers%ROWTYPE;
  _new_balance numeric;
BEGIN
  IF _request_id IS NULL OR _driver_id IS NULL THEN
    RAISE EXCEPTION 'Solicitud de retiro inválida';
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  SELECT * INTO _driver
  FROM public.drivers
  WHERE id = _driver_id
  FOR UPDATE;

  IF _driver.id IS NULL OR _driver.status <> 'active' THEN
    RAISE EXCEPTION 'Solo un chofer activo puede retirar';
  END IF;
  IF coalesce(trim(_driver.bank_account), '') = '' THEN
    RAISE EXCEPTION 'El chofer no tiene una cuenta bancaria registrada';
  END IF;
  IF _driver.balance < _amount THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.wallet_withdrawal_requests
    WHERE driver_id = _driver_id
      AND status IN (
        'wallet_reserved', 'bank_credit_confirmed', 'reconciliation_required'
      )
  ) THEN
    RAISE EXCEPTION 'Ya existe un retiro pendiente de resolución';
  END IF;

  INSERT INTO public.wallet_withdrawal_requests (
    id, driver_id, amount, bank_account, status
  ) VALUES (
    _request_id, _driver_id, _amount, trim(_driver.bank_account), 'wallet_reserved'
  );

  PERFORM set_config('qrbus.trusted_balance_write', 'on', true);
  UPDATE public.drivers
  SET balance = balance - _amount
  WHERE id = _driver_id
  RETURNING balance INTO _new_balance;

  UPDATE public.wallet_withdrawal_requests
  SET wallet_balance_after = _new_balance,
      updated_at = now()
  WHERE id = _request_id;

  RETURN QUERY SELECT _new_balance, trim(_driver.bank_account);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_bank_withdrawal_credited(
  _request_id uuid,
  _bank_balance_after numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.wallet_withdrawal_requests
  SET status = 'bank_credit_confirmed',
      bank_balance_after = _bank_balance_after,
      error_message = NULL,
      updated_at = now()
  WHERE id = _request_id
    AND status IN ('wallet_reserved', 'reconciliation_required');

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.wallet_withdrawal_requests
      WHERE id = _request_id AND status IN ('bank_credit_confirmed', 'completed')
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Solicitud de retiro no disponible para confirmar';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_bank_withdrawal(_request_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _request public.wallet_withdrawal_requests%ROWTYPE;
BEGIN
  SELECT * INTO _request
  FROM public.wallet_withdrawal_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud de retiro no encontrada';
  END IF;
  IF _request.status = 'completed' THEN
    RETURN _request.wallet_balance_after;
  END IF;
  IF _request.status <> 'bank_credit_confirmed' THEN
    RAISE EXCEPTION 'La acreditación bancaria aún no fue confirmada';
  END IF;

  INSERT INTO public.withdrawals (
    driver_id, amount, destination, status, request_id
  ) VALUES (
    _request.driver_id, _request.amount, _request.bank_account,
    'completed', _request.id
  ) ON CONFLICT (request_id) WHERE request_id IS NOT NULL DO NOTHING;

  UPDATE public.wallet_withdrawal_requests
  SET status = 'completed',
      error_message = NULL,
      updated_at = now()
  WHERE id = _request_id;

  RETURN _request.wallet_balance_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_bank_withdrawal(
  _request_id uuid,
  _error_message text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _request public.wallet_withdrawal_requests%ROWTYPE;
  _new_balance numeric;
BEGIN
  SELECT * INTO _request
  FROM public.wallet_withdrawal_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud de retiro no encontrada';
  END IF;
  IF _request.status = 'failed' THEN
    SELECT balance INTO _new_balance
    FROM public.drivers WHERE id = _request.driver_id;
    RETURN _new_balance;
  END IF;
  IF _request.status NOT IN ('wallet_reserved', 'reconciliation_required') THEN
    RAISE EXCEPTION 'El retiro no puede ser reembolsado en su estado actual';
  END IF;

  PERFORM set_config('qrbus.trusted_balance_write', 'on', true);
  UPDATE public.drivers
  SET balance = balance + _request.amount
  WHERE id = _request.driver_id
  RETURNING balance INTO _new_balance;

  UPDATE public.wallet_withdrawal_requests
  SET status = 'failed',
      wallet_balance_after = _new_balance,
      error_message = left(coalesce(_error_message, 'Retiro rechazado'), 500),
      updated_at = now()
  WHERE id = _request_id;

  RETURN _new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_bank_withdrawal_reconciliation(
  _request_id uuid,
  _error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.wallet_withdrawal_requests
  SET status = 'reconciliation_required',
      error_message = left(coalesce(_error_message, 'Resultado bancario incierto'), 500),
      updated_at = now()
  WHERE id = _request_id
    AND status = 'wallet_reserved';

  IF NOT FOUND THEN
    IF EXISTS (
      SELECT 1 FROM public.wallet_withdrawal_requests
      WHERE id = _request_id
        AND status IN ('reconciliation_required', 'bank_credit_confirmed', 'completed')
    ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Solicitud de retiro no disponible para conciliación';
  END IF;
END;
$$;

DO $$
DECLARE
  _signature text;
BEGIN
  FOREACH _signature IN ARRAY ARRAY[
    'public.reserve_bank_withdrawal(uuid,uuid,numeric)',
    'public.mark_bank_withdrawal_credited(uuid,numeric)',
    'public.complete_bank_withdrawal(uuid)',
    'public.refund_bank_withdrawal(uuid,text)',
    'public.mark_bank_withdrawal_reconciliation(uuid,text)'
  ] LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      _signature
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role',
      _signature
    );
  END LOOP;
END;
$$;

-- Retire all browser-callable legacy money mutation paths.
REVOKE ALL ON FUNCTION public.withdraw_earnings(numeric, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_earnings(numeric, text) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.topup_wallet(numeric)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.topup_wallet(numeric) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.topup_wallet(numeric) TO service_role';
  END IF;
  IF to_regprocedure('public.topup_wallet(numeric,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.topup_wallet(numeric, text) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.topup_wallet(numeric, text) TO service_role';
  END IF;
END;
$$;

-- Exposed tables use RLS and least-privilege grants.
ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.transactions, public.withdrawals
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.transactions, public.withdrawals TO authenticated;
GRANT ALL ON TABLE public.transactions, public.withdrawals TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
