-- ============================================================================
-- QR Pago Justo v2.0.0 · Tablas separadas por rol (passengers / drivers /
-- admins_supervisors). EMPIEZA DE CERO: borra perfiles y movimientos previos.
-- Ejecutar completo en el editor SQL de tu base. Luego abre la app una vez
-- para que se recreen las cuentas demo.
-- ============================================================================

-- 0. Limpieza -----------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.new_driver_code() CASCADE;
DROP FUNCTION IF EXISTS public.create_profile_for_user() CASCADE;
DROP FUNCTION IF EXISTS public.pay_fare(text, integer) CASCADE;
DROP FUNCTION IF EXISTS public.pay_fare(text, integer, numeric, numeric) CASCADE;
DROP FUNCTION IF EXISTS public.pay_fare_group(text, public.fare_category[], numeric, numeric) CASCADE;
DROP VIEW  IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.passengers CASCADE;
DROP TABLE IF EXISTS public.drivers CASCADE;
DROP TABLE IF EXISTS public.admins_supervisors CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.wallet_topups CASCADE;
DROP TABLE IF EXISTS public.withdrawals CASCADE;
DROP TABLE IF EXISTS public.reports CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
-- Usuarios de autenticación previos (se recrean las cuentas demo desde la app)
DELETE FROM auth.users WHERE id IS NOT NULL;

-- 1. Enums ----------------------------------------------------------------------
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','supervisor','passenger','driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.fare_category AS ENUM ('general','primaria','secundaria','adulto_mayor','discapacidad');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.user_status AS ENUM ('pending','active','rejected','suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.staff_role AS ENUM ('admin','supervisor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Roles ----------------------------------------------------------------------
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
CREATE OR REPLACE FUNCTION public.is_staff(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'admin') OR public.has_role(_uid,'supervisor')
$$;

CREATE POLICY "roles read own or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
-- 3. Tablas por rol -------------------------------------------------------------
CREATE TABLE public.passengers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text, paternal_surname text, maternal_surname text,
  ci_number text, birthdate date, phone text, email text,
  bank_name text, bank_account text,
  fare_category public.fare_category NOT NULL DEFAULT 'general',
  balance numeric NOT NULL DEFAULT 0,
  status public.user_status NOT NULL DEFAULT 'pending',
  ci_front_url text, ci_back_url text, selfie_url text, extra_doc_url text,
  qr_general_url text, qr_primaria_url text, qr_secundaria_url text, qr_adulto_url text,
  rejection_reason text, resubmission_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.drivers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text, paternal_surname text, maternal_surname text,
  ci_number text, birthdate date, phone text, email text,
  driver_code text UNIQUE,
  transport_line text, bank_name text, bank_account text,
  ci_front_url text, ci_back_url text, selfie_url text, license_url text, union_doc_url text,
  status public.user_status NOT NULL DEFAULT 'pending',
  balance numeric NOT NULL DEFAULT 0,
  rejection_reason text, resubmission_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admins_supervisors (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text, paternal_surname text, email text, phone text,
  role public.staff_role NOT NULL DEFAULT 'supervisor',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.passengers, public.drivers TO authenticated;
GRANT SELECT, UPDATE ON public.admins_supervisors TO authenticated;
GRANT ALL ON public.passengers, public.drivers, public.admins_supervisors TO service_role;
ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins_supervisors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "passengers read" ON public.passengers FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "passengers update" ON public.passengers FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_staff(auth.uid())) WITH CHECK (auth.uid() = id OR public.is_staff(auth.uid()));

CREATE POLICY "drivers read" ON public.drivers FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_staff(auth.uid()));
CREATE POLICY "drivers update" ON public.drivers FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_staff(auth.uid())) WITH CHECK (auth.uid() = id OR public.is_staff(auth.uid()));

CREATE POLICY "staff read" ON public.admins_supervisors FOR SELECT TO authenticated USING (auth.uid() = id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "staff update admin" ON public.admins_supervisors FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Evitar que un usuario cambie su propio saldo o se auto-apruebe
CREATE OR REPLACE FUNCTION public.protect_sensitive_cols()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_staff(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.balance := 0; NEW.status := 'pending'; NEW.resubmission_count := 0;
  ELSE
    NEW.balance := OLD.balance;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'rejected' AND NEW.status = 'pending') THEN
      NEW.status := OLD.status;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_protect_passengers BEFORE INSERT OR UPDATE ON public.passengers
  FOR EACH ROW EXECUTE FUNCTION public.protect_sensitive_cols();
CREATE TRIGGER trg_protect_drivers BEFORE INSERT OR UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.protect_sensitive_cols();

-- La fila de rol nace en la misma transacción que auth.users. Esto evita que
-- onAuthStateChange observe un usuario sin perfil y cierre la sesión a mitad
-- del registro. Los metadatos nunca pueden crear roles de staff.
CREATE OR REPLACE FUNCTION public.new_driver_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text;
BEGIN
  LOOP
    _code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.drivers WHERE driver_code = _code);
  END LOOP;
  RETURN _code;
END; $$;
REVOKE ALL ON FUNCTION public.new_driver_code() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _role public.app_role := CASE
    WHEN NEW.raw_user_meta_data ->> 'role' = 'driver' THEN 'driver'::public.app_role
    ELSE 'passenger'::public.app_role
  END;
BEGIN
  IF _role = 'driver' THEN
    INSERT INTO public.drivers (
      id, first_name, paternal_surname, maternal_surname, ci_number, birthdate,
      phone, email, bank_name, bank_account, transport_line, driver_code
    ) VALUES (
      NEW.id, NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'paternal_surname',
      NEW.raw_user_meta_data ->> 'maternal_surname', NEW.raw_user_meta_data ->> 'ci_number',
      nullif(NEW.raw_user_meta_data ->> 'birthdate', '')::date,
      NEW.raw_user_meta_data ->> 'phone', NEW.email,
      NEW.raw_user_meta_data ->> 'bank_name', NEW.raw_user_meta_data ->> 'bank_account',
      NEW.raw_user_meta_data ->> 'transport_line', public.new_driver_code()
    );
  ELSE
    INSERT INTO public.passengers (
      id, first_name, paternal_surname, maternal_surname, ci_number, birthdate,
      phone, email, bank_name, bank_account, fare_category
    ) VALUES (
      NEW.id, NEW.raw_user_meta_data ->> 'first_name', NEW.raw_user_meta_data ->> 'paternal_surname',
      NEW.raw_user_meta_data ->> 'maternal_surname', NEW.raw_user_meta_data ->> 'ci_number',
      nullif(NEW.raw_user_meta_data ->> 'birthdate', '')::date,
      NEW.raw_user_meta_data ->> 'phone', NEW.email,
      NEW.raw_user_meta_data ->> 'bank_name', NEW.raw_user_meta_data ->> 'bank_account',
      CASE WHEN NEW.raw_user_meta_data ->> 'fare_category' IN
        ('general','primaria','secundaria','adulto_mayor','discapacidad')
        THEN (NEW.raw_user_meta_data ->> 'fare_category')::public.fare_category
        ELSE 'general'::public.fare_category END
    );
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Vista unificada "profiles" (solo lectura/edición; respeta RLS) -------------
CREATE VIEW public.profiles WITH (security_invoker = true) AS
SELECT id, 'passenger'::public.app_role AS role, status, first_name, paternal_surname, maternal_surname,
       ci_number, birthdate, phone, email, fare_category AS category, NULL::text AS driver_code,
       NULL::text AS transport_line, bank_name, bank_account, balance,
       ci_front_url, ci_back_url, selfie_url, NULL::text AS license_url, NULL::text AS union_doc_url,
       extra_doc_url, qr_general_url, qr_primaria_url, qr_secundaria_url, qr_adulto_url,
       rejection_reason, resubmission_count, created_at
FROM public.passengers
UNION ALL
SELECT id, 'driver', status, first_name, paternal_surname, maternal_surname,
       ci_number, birthdate, phone, email, NULL, driver_code,
       transport_line, bank_name, bank_account, balance,
       ci_front_url, ci_back_url, selfie_url, license_url, union_doc_url,
       NULL, NULL, NULL, NULL, NULL, rejection_reason, resubmission_count, created_at
FROM public.drivers
UNION ALL
SELECT id, role::text::public.app_role,
       CASE WHEN status = 'suspended' THEN 'suspended'::public.user_status ELSE 'active'::public.user_status END,
       first_name, paternal_surname, NULL,
       NULL, NULL, phone, email, NULL, NULL, NULL, NULL, NULL, 0,
       NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, created_at
FROM public.admins_supervisors;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE OR REPLACE FUNCTION public.profiles_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.role = 'passenger' THEN
    UPDATE public.passengers SET status = NEW.status, first_name = NEW.first_name,
      paternal_surname = NEW.paternal_surname, maternal_surname = NEW.maternal_surname,
      ci_number = NEW.ci_number, birthdate = NEW.birthdate, phone = NEW.phone,
      fare_category = coalesce(NEW.category, 'general'), bank_name = NEW.bank_name,
      bank_account = NEW.bank_account, balance = NEW.balance,
      ci_front_url = NEW.ci_front_url, ci_back_url = NEW.ci_back_url, selfie_url = NEW.selfie_url,
      extra_doc_url = NEW.extra_doc_url, qr_general_url = NEW.qr_general_url,
      qr_primaria_url = NEW.qr_primaria_url, qr_secundaria_url = NEW.qr_secundaria_url,
      qr_adulto_url = NEW.qr_adulto_url, rejection_reason = NEW.rejection_reason,
      resubmission_count = NEW.resubmission_count
    WHERE id = OLD.id;
  ELSIF OLD.role = 'driver' THEN
    UPDATE public.drivers SET status = NEW.status, first_name = NEW.first_name,
      paternal_surname = NEW.paternal_surname, maternal_surname = NEW.maternal_surname,
      ci_number = NEW.ci_number, birthdate = NEW.birthdate, phone = NEW.phone,
      transport_line = NEW.transport_line, bank_name = NEW.bank_name, bank_account = NEW.bank_account,
      balance = NEW.balance, ci_front_url = NEW.ci_front_url, ci_back_url = NEW.ci_back_url,
      selfie_url = NEW.selfie_url, license_url = NEW.license_url, union_doc_url = NEW.union_doc_url,
      rejection_reason = NEW.rejection_reason, resubmission_count = NEW.resubmission_count
    WHERE id = OLD.id;
  ELSE
    UPDATE public.admins_supervisors SET first_name = NEW.first_name,
      paternal_surname = NEW.paternal_surname, phone = NEW.phone,
      status = CASE WHEN NEW.status = 'suspended' THEN 'suspended' ELSE 'active' END
    WHERE id = OLD.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_profiles_update INSTEAD OF UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_update();

-- 5. Tarifas (se conserva si existe) ------------------------------------------
CREATE TABLE IF NOT EXISTS public.tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL UNIQUE, nombre text NOT NULL, precio numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tarifas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tarifas TO authenticated;
GRANT ALL ON public.tarifas TO service_role;
ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tarifas lectura publica" ON public.tarifas;
CREATE POLICY "tarifas lectura publica" ON public.tarifas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tarifas admin gestiona" ON public.tarifas;
CREATE POLICY "tarifas admin gestiona" ON public.tarifas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.tarifas (tipo, nombre, precio) VALUES
  ('general','General',2.00),('adulto_mayor','Adulto Mayor',1.00),('discapacidad','Persona con Discapacidad',1.00),
  ('primaria','Primaria',0.80),('secundaria','Secundaria / Universitario',1.00)
ON CONFLICT (tipo) DO NOTHING;

-- 6. Movimientos ----------------------------------------------------------------
CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL, passenger_id uuid NOT NULL,
  category public.fare_category NOT NULL, amount numeric NOT NULL,
  verification_code text NOT NULL, tickets integer NOT NULL DEFAULT 1,
  latitude numeric, longitude numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tx read own" ON public.transactions FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR passenger_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  amount numeric NOT NULL, method text NOT NULL DEFAULT 'qr',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topups TO service_role;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "topups read" ON public.wallet_topups FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), driver_id uuid NOT NULL,
  amount numeric NOT NULL, destination text NOT NULL, status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals read" ON public.withdrawals FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reporter_id uuid NOT NULL,
  category text NOT NULL, description text NOT NULL, driver_code text, validation_code text,
  transaction_id uuid, reported_user_id uuid, status text NOT NULL DEFAULT 'open',
  admin_notes text, resolver_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports insert own" ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "reports read" ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY "reports update staff" ON public.reports FOR UPDATE TO authenticated
  USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.reports_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_touch_updated_at();

-- 7. Funciones de negocio -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fare_for_category(_c public.fare_category)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(
    (SELECT precio FROM public.tarifas
     WHERE tipo = CASE _c
       WHEN 'secundaria'::public.fare_category THEN 'universitario'
       ELSE _c::text
     END),
    2.0
  )::numeric
$$;

CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(_phone text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM (
    SELECT email, phone FROM public.passengers UNION ALL
    SELECT email, phone FROM public.drivers UNION ALL
    SELECT email, phone FROM public.admins_supervisors) x
  WHERE phone = trim(_phone) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_email_by_phone(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.find_driver_by_code(_code text)
RETURNS TABLE(id uuid, driver_code text, first_name text, paternal_surname text, bank_account text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, driver_code, first_name, paternal_surname, bank_account FROM public.drivers
  WHERE upper(driver_code) = upper(trim(_code)) AND status = 'active' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.topup_wallet(_amount numeric, _method text DEFAULT 'qr')
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  UPDATE public.passengers SET balance = balance + _amount WHERE id = auth.uid() RETURNING balance INTO _bal;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Solo pasajeros pueden recargar'; END IF;
  INSERT INTO public.wallet_topups (user_id, amount, method) VALUES (auth.uid(), _amount, coalesce(_method,'qr'));
  RETURN _bal;
END; $$;

CREATE OR REPLACE FUNCTION public.withdraw_earnings(_amount numeric, _destination text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  IF coalesce(trim(_destination),'') = '' THEN RAISE EXCEPTION 'Destino requerido'; END IF;
  SELECT balance INTO _bal FROM public.drivers WHERE id = auth.uid() FOR UPDATE;
  IF _bal IS NULL THEN RAISE EXCEPTION 'Solo choferes pueden retirar'; END IF;
  IF _bal < _amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  UPDATE public.drivers SET balance = balance - _amount WHERE id = auth.uid() RETURNING balance INTO _bal;
  INSERT INTO public.withdrawals (driver_id, amount, destination) VALUES (auth.uid(), _amount, trim(_destination));
  RETURN _bal;
END; $$;

-- Pago grupal: el titular paga su tarifa y cada acompañante la de su categoría
CREATE OR REPLACE FUNCTION public.pay_fare_group(_driver_code text, _companions public.fare_category[] DEFAULT '{}',
  _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL)
RETURNS TABLE(verification_code text, total numeric, base_amount numeric, extra_amount numeric,
              category public.fare_category, tickets integer, new_balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.passengers%ROWTYPE; _d public.drivers%ROWTYPE;
  _base numeric; _extra numeric := 0; _total numeric; _code text; _bal numeric; _n int; _c public.fare_category;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  _n := 1 + coalesce(array_length(_companions,1),0);
  IF _n > 10 THEN RAISE EXCEPTION 'Máximo 10 pasajes'; END IF;
  SELECT * INTO _p FROM public.passengers WHERE id = auth.uid() FOR UPDATE;
  IF _p.id IS NULL OR _p.status <> 'active' THEN RAISE EXCEPTION 'Pasajero no activo'; END IF;
  SELECT * INTO _d FROM public.drivers WHERE upper(driver_code) = upper(trim(_driver_code)) AND status = 'active';
  IF _d.id IS NULL THEN RAISE EXCEPTION 'Chofer no encontrado o no activo'; END IF;
  _base := public.fare_for_category(_p.fare_category);
  IF _companions IS NOT NULL THEN
    FOREACH _c IN ARRAY _companions LOOP _extra := _extra + public.fare_for_category(_c); END LOOP;
  END IF;
  _total := _base + _extra;
  IF _p.balance < _total THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  _code := lpad(floor(random()*100000)::int::text, 5, '0');
  UPDATE public.passengers SET balance = balance - _total WHERE id = _p.id RETURNING balance INTO _bal;
  UPDATE public.drivers SET balance = balance + _total WHERE id = _d.id;
  INSERT INTO public.transactions (driver_id, passenger_id, category, amount, verification_code, tickets, latitude, longitude)
  VALUES (_d.id, _p.id, _p.fare_category, _total, _code, _n, _lat, _lng);
  RETURN QUERY SELECT _code, _total, _base, _extra, _p.fare_category, _n, _bal;
END; $$;

-- Compatibilidad: pago simple
CREATE OR REPLACE FUNCTION public.pay_fare(_driver_code text, _tickets integer, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL)
RETURNS TABLE(verification_code text, total numeric, base_amount numeric, extra_amount numeric,
              category public.fare_category, new_balance numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT g.verification_code, g.total, g.base_amount, g.extra_amount, g.category, g.new_balance
  FROM public.pay_fare_group(_driver_code,
    array_fill('general'::public.fare_category, ARRAY[greatest(coalesce(_tickets,1)-1,0)]), _lat, _lng) g;
$$;

-- 8. Storage --------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents','kyc-documents',false), ('qr-codes','qr-codes',false)
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "kyc insert authenticated" ON storage.objects;
CREATE POLICY "kyc insert authenticated" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('kyc-documents','qr-codes') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "kyc update authenticated" ON storage.objects;
CREATE POLICY "kyc update authenticated" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('kyc-documents','qr-codes') AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "kyc read authenticated" ON storage.objects;
CREATE POLICY "kyc read authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('kyc-documents','qr-codes')
         AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_staff(auth.uid())));

-- 9. Billetera segura del chofer y retiros bancarios ---------------------------
-- Mantener este bloque sincronizado con
-- migrations/20261021224806_secure_driver_wallet_withdrawal.sql.
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

-- Explicit browser denial for service-only request coordinators.
CREATE POLICY "wallet withdrawal requests deny browser"
ON public.wallet_withdrawal_requests
FOR ALL TO anon, authenticated
USING (false)
WITH CHECK (false);
