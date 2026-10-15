-- Incremental repair for projects that already use role tables and expose
-- public.profiles as a compatibility view.
--
-- This migration is intentionally non-destructive: it does not recreate role
-- tables, drop the profiles view, or remove auth/business data.

BEGIN;

-- The deployed passengers table predates the banking fields already exposed by
-- the profiles view and used by the registration UI.
ALTER TABLE public.passengers
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account text;

-- Keep the compatibility view aligned with the role table. CREATE OR REPLACE
-- preserves the view object and its INSTEAD OF UPDATE trigger.
CREATE OR REPLACE VIEW public.profiles
WITH (security_invoker = true)
AS
SELECT
  p.id,
  'passenger'::public.app_role AS role,
  p.status,
  p.first_name,
  p.paternal_surname,
  p.maternal_surname,
  p.ci_number,
  p.birthdate,
  p.phone,
  p.email,
  p.fare_category AS category,
  NULL::text AS driver_code,
  NULL::text AS transport_line,
  p.bank_name,
  p.bank_account,
  p.balance,
  p.ci_front_url,
  p.ci_back_url,
  p.selfie_url,
  NULL::text AS license_url,
  NULL::text AS union_doc_url,
  p.extra_doc_url,
  NULL::text AS qr_general_url,
  NULL::text AS qr_primaria_url,
  NULL::text AS qr_secundaria_url,
  NULL::text AS qr_adulto_url,
  p.rejection_reason,
  p.resubmission_count,
  p.created_at
FROM public.passengers AS p
UNION ALL
SELECT
  d.id,
  'driver'::public.app_role AS role,
  d.status,
  d.first_name,
  d.paternal_surname,
  d.maternal_surname,
  d.ci_number,
  d.birthdate,
  d.phone,
  d.email,
  NULL::public.fare_category AS category,
  d.driver_code,
  d.transport_line,
  d.bank_name,
  d.bank_account,
  d.balance,
  d.ci_front_url,
  d.ci_back_url,
  d.selfie_url,
  d.license_url,
  d.union_doc_url,
  NULL::text AS extra_doc_url,
  NULL::text AS qr_general_url,
  NULL::text AS qr_primaria_url,
  NULL::text AS qr_secundaria_url,
  NULL::text AS qr_adulto_url,
  d.rejection_reason,
  d.resubmission_count,
  d.created_at
FROM public.drivers AS d
UNION ALL
SELECT
  s.id,
  s.role::text::public.app_role AS role,
  'active'::public.user_status AS status,
  s.first_name,
  s.paternal_surname,
  NULL::text AS maternal_surname,
  NULL::text AS ci_number,
  NULL::date AS birthdate,
  s.phone,
  s.email,
  NULL::public.fare_category AS category,
  NULL::text AS driver_code,
  NULL::text AS transport_line,
  NULL::text AS bank_name,
  NULL::text AS bank_account,
  0::numeric AS balance,
  NULL::text AS ci_front_url,
  NULL::text AS ci_back_url,
  NULL::text AS selfie_url,
  NULL::text AS license_url,
  NULL::text AS union_doc_url,
  NULL::text AS extra_doc_url,
  NULL::text AS qr_general_url,
  NULL::text AS qr_primaria_url,
  NULL::text AS qr_secundaria_url,
  NULL::text AS qr_adulto_url,
  NULL::text AS rejection_reason,
  0 AS resubmission_count,
  s.created_at
FROM public.admins_supervisors AS s;

CREATE OR REPLACE FUNCTION public.profiles_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.role = 'passenger' THEN
    UPDATE public.passengers SET
      status = NEW.status,
      first_name = NEW.first_name,
      paternal_surname = NEW.paternal_surname,
      maternal_surname = NEW.maternal_surname,
      ci_number = NEW.ci_number,
      birthdate = NEW.birthdate,
      phone = NEW.phone,
      fare_category = coalesce(NEW.category, 'general'),
      bank_name = NEW.bank_name,
      bank_account = NEW.bank_account,
      balance = NEW.balance,
      ci_front_url = NEW.ci_front_url,
      ci_back_url = NEW.ci_back_url,
      selfie_url = NEW.selfie_url,
      extra_doc_url = NEW.extra_doc_url,
      rejection_reason = NEW.rejection_reason,
      resubmission_count = NEW.resubmission_count
    WHERE id = OLD.id;
  ELSIF OLD.role = 'driver' THEN
    UPDATE public.drivers SET
      status = NEW.status,
      first_name = NEW.first_name,
      paternal_surname = NEW.paternal_surname,
      maternal_surname = NEW.maternal_surname,
      ci_number = NEW.ci_number,
      birthdate = NEW.birthdate,
      phone = NEW.phone,
      transport_line = NEW.transport_line,
      bank_name = NEW.bank_name,
      bank_account = NEW.bank_account,
      balance = NEW.balance,
      ci_front_url = NEW.ci_front_url,
      ci_back_url = NEW.ci_back_url,
      selfie_url = NEW.selfie_url,
      license_url = NEW.license_url,
      union_doc_url = NEW.union_doc_url,
      rejection_reason = NEW.rejection_reason,
      resubmission_count = NEW.resubmission_count
    WHERE id = OLD.id;
  ELSE
    UPDATE public.admins_supervisors SET
      first_name = NEW.first_name,
      paternal_surname = NEW.paternal_surname,
      phone = NEW.phone,
      status = CASE
        WHEN NEW.status = 'suspended' THEN 'suspended'
        ELSE 'active'
      END
    WHERE id = OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

-- Invalid legacy metadata must not abort the whole repair transaction.
CREATE OR REPLACE FUNCTION public.safe_profile_date(_value text)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  RETURN nullif(_value, '')::date;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.safe_profile_date(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.new_driver_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _code text;
BEGIN
  LOOP
    _code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.drivers WHERE driver_code = _code
    );
  END LOOP;
  RETURN _code;
END;
$$;
REVOKE ALL ON FUNCTION public.new_driver_code() FROM PUBLIC, anon, authenticated;

-- Auth signup and profile creation now happen in the same database transaction.
-- Metadata may choose passenger/driver only; it can never self-assign a staff role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _role public.app_role := CASE
    WHEN NEW.raw_user_meta_data ->> 'role' = 'driver'
      THEN 'driver'::public.app_role
    ELSE 'passenger'::public.app_role
  END;
BEGIN
  IF _role = 'driver' THEN
    INSERT INTO public.drivers (
      id, first_name, paternal_surname, maternal_surname, ci_number, birthdate,
      phone, email, bank_name, bank_account, transport_line, driver_code
    ) VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'paternal_surname',
      NEW.raw_user_meta_data ->> 'maternal_surname',
      NEW.raw_user_meta_data ->> 'ci_number',
      public.safe_profile_date(NEW.raw_user_meta_data ->> 'birthdate'),
      NEW.raw_user_meta_data ->> 'phone',
      NEW.email,
      NEW.raw_user_meta_data ->> 'bank_name',
      NEW.raw_user_meta_data ->> 'bank_account',
      NEW.raw_user_meta_data ->> 'transport_line',
      public.new_driver_code()
    )
    ON CONFLICT (id) DO NOTHING;
  ELSE
    INSERT INTO public.passengers (
      id, first_name, paternal_surname, maternal_surname, ci_number, birthdate,
      phone, email, bank_name, bank_account, fare_category
    ) VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'first_name',
      NEW.raw_user_meta_data ->> 'paternal_surname',
      NEW.raw_user_meta_data ->> 'maternal_surname',
      NEW.raw_user_meta_data ->> 'ci_number',
      public.safe_profile_date(NEW.raw_user_meta_data ->> 'birthdate'),
      NEW.raw_user_meta_data ->> 'phone',
      NEW.email,
      NEW.raw_user_meta_data ->> 'bank_name',
      NEW.raw_user_meta_data ->> 'bank_account',
      CASE
        WHEN NEW.raw_user_meta_data ->> 'fare_category' IN
          ('general', 'primaria', 'secundaria', 'adulto_mayor', 'discapacidad')
          THEN (NEW.raw_user_meta_data ->> 'fare_category')::public.fare_category
        ELSE 'general'::public.fare_category
      END
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, _role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Repair passenger auth users orphaned by the previous client-side flow.
INSERT INTO public.passengers (
  id, first_name, paternal_surname, maternal_surname, ci_number, birthdate,
  phone, email, bank_name, bank_account, fare_category
)
SELECT
  u.id,
  u.raw_user_meta_data ->> 'first_name',
  u.raw_user_meta_data ->> 'paternal_surname',
  u.raw_user_meta_data ->> 'maternal_surname',
  u.raw_user_meta_data ->> 'ci_number',
  public.safe_profile_date(u.raw_user_meta_data ->> 'birthdate'),
  u.raw_user_meta_data ->> 'phone',
  u.email,
  u.raw_user_meta_data ->> 'bank_name',
  u.raw_user_meta_data ->> 'bank_account',
  CASE
    WHEN u.raw_user_meta_data ->> 'fare_category' IN
      ('general', 'primaria', 'secundaria', 'adulto_mayor', 'discapacidad')
      THEN (u.raw_user_meta_data ->> 'fare_category')::public.fare_category
    ELSE 'general'::public.fare_category
  END
FROM auth.users AS u
WHERE coalesce(u.raw_user_meta_data ->> 'role', 'passenger') = 'passenger'
  AND NOT EXISTS (SELECT 1 FROM public.passengers AS p WHERE p.id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.drivers AS d WHERE d.id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.admins_supervisors AS s WHERE s.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Repair driver auth users orphaned by the previous client-side flow.
INSERT INTO public.drivers (
  id, first_name, paternal_surname, maternal_surname, ci_number, birthdate,
  phone, email, bank_name, bank_account, transport_line, driver_code
)
SELECT
  u.id,
  u.raw_user_meta_data ->> 'first_name',
  u.raw_user_meta_data ->> 'paternal_surname',
  u.raw_user_meta_data ->> 'maternal_surname',
  u.raw_user_meta_data ->> 'ci_number',
  public.safe_profile_date(u.raw_user_meta_data ->> 'birthdate'),
  u.raw_user_meta_data ->> 'phone',
  u.email,
  u.raw_user_meta_data ->> 'bank_name',
  u.raw_user_meta_data ->> 'bank_account',
  u.raw_user_meta_data ->> 'transport_line',
  public.new_driver_code()
FROM auth.users AS u
WHERE u.raw_user_meta_data ->> 'role' = 'driver'
  AND NOT EXISTS (SELECT 1 FROM public.passengers AS p WHERE p.id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.drivers AS d WHERE d.id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.admins_supervisors AS s WHERE s.id = u.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'passenger'::public.app_role FROM public.passengers
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'driver'::public.app_role FROM public.drivers
ON CONFLICT DO NOTHING;

-- Profile and role rows are now created only by the trusted auth trigger. The
-- browser needs read/update access, but no longer needs direct insert/delete or
-- table-administration privileges.
DROP POLICY IF EXISTS "passengers insert own" ON public.passengers;
DROP POLICY IF EXISTS "drivers insert own" ON public.drivers;
DROP POLICY IF EXISTS "roles self insert" ON public.user_roles;

REVOKE ALL ON TABLE public.passengers FROM anon, authenticated;
REVOKE ALL ON TABLE public.drivers FROM anon, authenticated;
REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;

GRANT SELECT, UPDATE ON TABLE public.passengers TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.drivers TO authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;

-- SECURITY DEFINER helpers used by RLS or authenticated RPC calls must not be
-- directly executable by anonymous callers. Phone lookup remains anonymous
-- because it is intentionally used before password authentication.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.protect_sensitive_cols() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_driver_by_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.topup_wallet(numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.withdraw_earnings(numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_fare(text, integer, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_fare_group(
  text, public.fare_category[], numeric, numeric
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_driver_by_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.topup_wallet(numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.withdraw_earnings(numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_fare(text, integer, numeric, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_fare_group(
  text, public.fare_category[], numeric, numeric
) TO authenticated, service_role;

-- PostgREST normally reloads automatically after DDL; notify explicitly so the
-- newly added columns are immediately available to the signup request.
NOTIFY pgrst, 'reload schema';

COMMIT;
