-- ============================================================================
-- QR Pago Justo · Script completo de base de datos (reset + alineación)
-- Ejecutar en el editor SQL de Supabase. Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Limpieza: triggers/funciones obsoletas sobre auth.users
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_trigger ON auth.users;
DROP TRIGGER IF EXISTS create_profile_for_user ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.create_profile_for_user() CASCADE;

-- ----------------------------------------------------------------------------
-- 1. Tipos enumerados
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'supervisor', 'passenger', 'driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fare_category AS ENUM ('general', 'primaria', 'secundaria', 'adulto_mayor', 'discapacidad');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('pending', 'active', 'rejected', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. Tabla profiles (pasajeros, choferes, supervisores y administradores)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role               public.app_role   NOT NULL DEFAULT 'passenger',
  status             public.user_status NOT NULL DEFAULT 'pending',
  first_name         text,
  paternal_surname   text,
  maternal_surname   text,
  ci_number          text,
  birthdate          date,
  phone              text,
  email              text,
  category           public.fare_category,
  driver_code        text,
  transport_line     text,
  bank_name          text,
  bank_account       text,
  balance            numeric NOT NULL DEFAULT 0,
  ci_front_url       text,
  ci_back_url        text,
  selfie_url         text,
  license_url        text,
  union_doc_url      text,
  extra_doc_url      text,
  qr_general_url     text,
  qr_primaria_url    text,
  qr_secundaria_url  text,
  qr_adulto_url      text,
  rejection_reason   text,
  resubmission_count integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

-- ----------------------------------------------------------------------------
-- 3. Roles de usuario (nunca guardar el rol solo en profiles para permisos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role    public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles read own or admin" ON public.user_roles;
CREATE POLICY "roles read own or admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ----------------------------------------------------------------------------
-- 4. Tarifas (fuente única de precios)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tarifas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       text NOT NULL UNIQUE,
  nombre     text NOT NULL,
  precio     numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tarifas TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarifas TO authenticated;
GRANT ALL ON public.tarifas TO service_role;
ALTER TABLE public.tarifas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tarifas lectura publica" ON public.tarifas;
CREATE POLICY "tarifas lectura publica" ON public.tarifas FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "tarifas admin gestiona" ON public.tarifas;
CREATE POLICY "tarifas admin gestiona" ON public.tarifas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.tarifas (tipo, nombre, precio) VALUES
  ('general',      'General',              2.00),
  ('secundaria',   'Universitario',        1.00),
  ('primaria',     'Escolar',              0.80),
  ('adulto_mayor', 'Adulto Mayor',         1.00),
  ('discapacidad', 'Persona con Discapacidad', 1.00)
ON CONFLICT (tipo) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Transacciones, recargas y retiros
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  passenger_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category          public.fare_category NOT NULL,
  amount            numeric NOT NULL,
  tickets           integer NOT NULL DEFAULT 1,
  verification_code text NOT NULL,
  latitude          numeric,
  longitude         numeric,
  created_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tx read own" ON public.transactions;
CREATE POLICY "tx read own" ON public.transactions FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR passenger_id = auth.uid()
         OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

DROP POLICY IF EXISTS "tx passenger insert" ON public.transactions;
CREATE POLICY "tx passenger insert" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (passenger_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.wallet_topups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     numeric NOT NULL,
  method     text NOT NULL DEFAULT 'qr',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_topups TO authenticated;
GRANT ALL ON public.wallet_topups TO service_role;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "topups read own or staff" ON public.wallet_topups;
CREATE POLICY "topups read own or staff" ON public.wallet_topups FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      numeric NOT NULL,
  destination text NOT NULL,
  status      text NOT NULL DEFAULT 'completed',
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.withdrawals TO authenticated;
GRANT ALL ON public.withdrawals TO service_role;
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawals read own or staff" ON public.withdrawals;
CREATE POLICY "withdrawals read own or staff" ON public.withdrawals FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

-- ----------------------------------------------------------------------------
-- 6. Reportes / quejas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category         text NOT NULL,
  description      text NOT NULL,
  driver_code      text,
  transaction_id   uuid,
  reported_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  validation_code  text,
  status           text NOT NULL DEFAULT 'open',
  admin_notes      text,
  resolver_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports insert own" ON public.reports;
CREATE POLICY "reports insert own" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports read own or staff" ON public.reports;
CREATE POLICY "reports read own or staff" ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

DROP POLICY IF EXISTS "reports update staff" ON public.reports;
CREATE POLICY "reports update staff" ON public.reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE OR REPLACE FUNCTION public.reports_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.reports_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tarifas_updated_at ON public.tarifas;
CREATE TRIGGER trg_tarifas_updated_at BEFORE UPDATE ON public.tarifas
  FOR EACH ROW EXECUTE FUNCTION public.reports_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 7. Funciones de negocio
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fare_for_category(_c public.fare_category)
RETURNS numeric LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce((SELECT precio FROM public.tarifas WHERE tipo = _c::text), 2.0)::numeric
$$;

CREATE OR REPLACE FUNCTION public.lookup_email_by_phone(_phone text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM public.profiles WHERE phone = _phone LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.find_driver_by_code(_code text)
RETURNS TABLE(id uuid, driver_code text, first_name text, paternal_surname text, bank_account text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, driver_code, first_name, paternal_surname, bank_account
  FROM public.profiles
  WHERE upper(driver_code) = upper(_code) AND role = 'driver' AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.topup_wallet(_amount numeric, _method text DEFAULT 'qr')
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  UPDATE public.profiles SET balance = balance + _amount WHERE id = auth.uid() RETURNING balance INTO _bal;
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
  SELECT balance INTO _bal FROM public.profiles WHERE id = auth.uid() AND role = 'driver';
  IF _bal IS NULL THEN RAISE EXCEPTION 'Solo choferes pueden retirar'; END IF;
  IF _bal < _amount THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  UPDATE public.profiles SET balance = balance - _amount WHERE id = auth.uid() RETURNING balance INTO _bal;
  INSERT INTO public.withdrawals (driver_id, amount, destination) VALUES (auth.uid(), _amount, trim(_destination));
  RETURN _bal;
END; $$;

CREATE OR REPLACE FUNCTION public.pay_fare(_driver_code text, _tickets integer, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL)
RETURNS TABLE(verification_code text, total numeric, base_amount numeric, extra_amount numeric,
              category public.fare_category, new_balance numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _p public.profiles%ROWTYPE;
  _d public.profiles%ROWTYPE;
  _base numeric; _extra numeric; _total numeric; _code text; _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _tickets IS NULL OR _tickets < 1 OR _tickets > 10 THEN RAISE EXCEPTION 'Cantidad de pasajes inválida'; END IF;
  SELECT * INTO _p FROM public.profiles WHERE id = auth.uid();
  IF _p.id IS NULL OR _p.status <> 'active' THEN RAISE EXCEPTION 'Pasajero no activo'; END IF;
  SELECT * INTO _d FROM public.profiles WHERE upper(driver_code) = upper(_driver_code) AND role = 'driver' AND status = 'active';
  IF _d.id IS NULL THEN RAISE EXCEPTION 'Chofer no encontrado o no activo'; END IF;

  _base  := public.fare_for_category(coalesce(_p.category, 'general'));
  _extra := (_tickets - 1) * public.fare_for_category('general');
  _total := _base + _extra;
  IF _p.balance < _total THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  _code := lpad(floor(random()*100000)::int::text, 5, '0');
  UPDATE public.profiles SET balance = balance - _total WHERE id = _p.id RETURNING balance INTO _bal;
  UPDATE public.profiles SET balance = balance + _total WHERE id = _d.id;
  INSERT INTO public.transactions (driver_id, passenger_id, category, amount, verification_code, tickets, latitude, longitude)
  VALUES (_d.id, _p.id, coalesce(_p.category,'general'), _total, _code, _tickets, _lat, _lng);

  RETURN QUERY SELECT _code, _total, _base, _extra, coalesce(_p.category,'general')::public.fare_category, _bal;
END; $$;

-- ----------------------------------------------------------------------------
-- 8. Storage: buckets privados y políticas para el registro (KYC y QR)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('kyc-documents', 'kyc-documents', false), ('qr-codes', 'qr-codes', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "kyc insert authenticated" ON storage.objects;
CREATE POLICY "kyc insert authenticated" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('kyc-documents','qr-codes'));

DROP POLICY IF EXISTS "kyc read authenticated" ON storage.objects;
CREATE POLICY "kyc read authenticated" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('kyc-documents','qr-codes'));

DROP POLICY IF EXISTS "kyc update authenticated" ON storage.objects;
CREATE POLICY "kyc update authenticated" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('kyc-documents','qr-codes'));

-- ----------------------------------------------------------------------------
-- 9. Cuentas por defecto (se conservan las existentes)
--    Los usuarios de auth se crean desde la app (seedAccounts). Este bloque
--    sólo garantiza el perfil y el rol de cada cuenta demo si ya existe en auth.
-- ----------------------------------------------------------------------------
INSERT INTO public.profiles (id, role, status, first_name, paternal_surname, email, category, driver_code, balance)
SELECT u.id,
       v.role::public.app_role,
       'active'::public.user_status,
       v.first_name, v.surname, v.email,
       v.category::public.fare_category,
       v.driver_code,
       v.balance
FROM (VALUES
  ('incos2026@gmail.com',       'admin',      'Master',     'Admin',     NULL,      NULL,    0),
  ('supervisor1@pagojusto.bo',  'supervisor', 'Supervisor', 'Uno',       NULL,      NULL,    0),
  ('supervisor2@pagojusto.bo',  'supervisor', 'Supervisor', 'Dos',       NULL,      NULL,    0),
  ('supervisor3@pagojusto.bo',  'supervisor', 'Supervisor', 'Tres',      NULL,      NULL,    0),
  ('choferapi@pagojusto.bo',    'driver',     'Chofer',     'API',       NULL,      'DRV93', 0),
  ('pasajeroapi@pagojusto.bo',  'passenger',  'Pasajero',   'API',       'general', NULL,   50)
) AS v(email, role, first_name, surname, category, driver_code, balance)
JOIN auth.users u ON u.email = v.email
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT p.id, p.role FROM public.profiles p
WHERE p.email IN ('incos2026@gmail.com','supervisor1@pagojusto.bo','supervisor2@pagojusto.bo',
                  'supervisor3@pagojusto.bo','choferapi@pagojusto.bo','pasajeroapi@pagojusto.bo')
ON CONFLICT (user_id, role) DO NOTHING;
