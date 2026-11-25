BEGIN;

DO $$
DECLARE
  has_secondary boolean;
  has_university boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.fare_category'::regtype
      AND enumlabel = 'secundaria'
  ) INTO has_secondary;

  SELECT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.fare_category'::regtype
      AND enumlabel = 'universitario'
  ) INTO has_university;

  IF has_secondary AND NOT has_university THEN
    ALTER TYPE public.fare_category
      RENAME VALUE 'secundaria' TO 'universitario';
    has_secondary := false;
  END IF;

  IF NOT has_secondary THEN
    ALTER TYPE public.fare_category ADD VALUE 'secundaria';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.fare_for_category(_c public.fare_category)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(
    (
      SELECT precio
      FROM public.tarifas
      WHERE lower(trim(tipo)) = lower(_c::text)
    ),
    2.0
  )::numeric
$$;

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
        WHEN NEW.raw_user_meta_data ->> 'fare_category' IN (
          'general',
          'primaria',
          'secundaria',
          'universitario',
          'adulto_mayor',
          'discapacidad'
        )
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

COMMIT;
