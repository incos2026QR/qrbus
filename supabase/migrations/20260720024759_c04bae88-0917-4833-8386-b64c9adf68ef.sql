
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin','supervisor','passenger','driver');
CREATE TYPE public.user_status AS ENUM ('pending','active','rejected','suspended');
CREATE TYPE public.fare_category AS ENUM ('general','primaria','secundaria','adulto_mayor','discapacidad');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'passenger',
  status user_status NOT NULL DEFAULT 'pending',
  first_name TEXT,
  paternal_surname TEXT,
  maternal_surname TEXT,
  ci_number TEXT,
  birthdate DATE,
  phone TEXT UNIQUE,
  email TEXT,
  category fare_category,
  driver_code TEXT UNIQUE,
  ci_front_url TEXT,
  ci_back_url TEXT,
  selfie_url TEXT,
  license_url TEXT,
  extra_doc_url TEXT,
  qr_general_url TEXT,
  qr_primaria_url TEXT,
  qr_secundaria_url TEXT,
  qr_adulto_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "public profile read for driver lookup" ON public.profiles FOR SELECT TO anon USING (false);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (auth.uid() = id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE POLICY "roles read own or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  passenger_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category fare_category NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  verification_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tx read own" ON public.transactions FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR passenger_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));
CREATE POLICY "tx passenger insert" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (passenger_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
