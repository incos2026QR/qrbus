-- ============================================================
-- QR Pago Justo — full schema (tables, FKs, RLS, functions, triggers)
-- Run in the Supabase SQL editor of the target project.
-- ============================================================

-- ---------- 1. ENUM TYPES ----------
create type public.app_role      as enum ('admin', 'supervisor', 'passenger', 'driver');
create type public.fare_category as enum ('general', 'primaria', 'secundaria', 'adulto_mayor', 'discapacidad');
create type public.user_status   as enum ('pending', 'active', 'rejected', 'suspended');

-- ---------- 2. PROFILES ----------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  role              public.app_role     not null default 'passenger',
  status            public.user_status  not null default 'pending',
  first_name        text,
  paternal_surname  text,
  maternal_surname  text,
  ci_number         text,
  birthdate         date,
  phone             text unique,
  email             text,
  category          public.fare_category,
  driver_code       text unique,
  ci_front_url      text,
  ci_back_url       text,
  selfie_url        text,
  license_url       text,
  extra_doc_url     text,
  qr_general_url    text,
  qr_primaria_url   text,
  qr_secundaria_url text,
  qr_adulto_url     text,
  balance           numeric not null default 0,
  bank_account      text,
  created_at        timestamptz not null default now()
);

grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

-- ---------- 3. USER ROLES (roles never live on profiles for authorization) ----------
create table public.user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role    public.app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- Security-definer role check (avoids recursive RLS)
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ---------- 4. TRANSACTIONS ----------
create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  driver_id         uuid not null references auth.users(id) on delete cascade,
  passenger_id      uuid not null references auth.users(id) on delete cascade,
  category          public.fare_category not null,
  amount            numeric not null,
  verification_code text not null,
  tickets           integer not null default 1,
  latitude          numeric,
  longitude         numeric,
  created_at        timestamptz not null default now()
);

grant select, insert on public.transactions to authenticated;
grant all on public.transactions to service_role;

alter table public.transactions enable row level security;

-- ---------- 5. WALLET TOP-UPS ----------
create table public.wallet_topups (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  amount     numeric not null,
  method     text not null default 'qr',
  created_at timestamptz not null default now()
);

grant select on public.wallet_topups to authenticated;
grant all on public.wallet_topups to service_role;

alter table public.wallet_topups enable row level security;

-- ---------- 6. WITHDRAWALS ----------
create table public.withdrawals (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null,
  amount      numeric not null,
  destination text not null,
  status      text not null default 'completed',
  created_at  timestamptz not null default now()
);

grant select on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;

alter table public.withdrawals enable row level security;

-- ---------- 7. REPORTS ----------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  reporter_id      uuid not null references auth.users(id) on delete cascade,
  category         text not null,
  description      text not null,
  driver_code      text,
  transaction_id   uuid,
  validation_code  text,
  reported_user_id uuid references auth.users(id) on delete set null,
  status           text not null default 'open',
  admin_notes      text,
  resolver_id      uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

grant select, insert, update on public.reports to authenticated;
grant all on public.reports to service_role;

alter table public.reports enable row level security;

-- ---------- 8. RLS POLICIES ----------

-- profiles
create policy "own profile read" on public.profiles
  for select to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));

create policy "own profile insert" on public.profiles
  for insert to authenticated
  with check (auth.uid() = id);

create policy "own profile update" on public.profiles
  for update to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'))
  with check (auth.uid() = id or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));

-- user_roles
create policy "roles read own or admin" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- transactions
create policy "tx read own" on public.transactions
  for select to authenticated
  using (driver_id = auth.uid() or passenger_id = auth.uid()
         or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));

create policy "tx passenger insert" on public.transactions
  for insert to authenticated
  with check (passenger_id = auth.uid());

-- wallet_topups
create policy "topups read own or staff" on public.wallet_topups
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));

-- withdrawals
create policy "withdrawals read own or staff" on public.withdrawals
  for select to authenticated
  using (driver_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));

-- reports
create policy "reports read own or staff" on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));

create policy "reports insert own" on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid());

create policy "reports update staff" on public.reports
  for update to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor'));

-- ---------- 9. BUSINESS FUNCTIONS ----------

create or replace function public.fare_for_category(_c public.fare_category)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case _c
    when 'general'       then 3.0
    when 'primaria'      then 1.0
    when 'secundaria'    then 2.0
    when 'adulto_mayor'  then 2.5
    when 'discapacidad'  then 2.5
    else 3.0 end::numeric
$$;

create or replace function public.lookup_email_by_phone(_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select email from public.profiles where phone = _phone limit 1;
$$;

create or replace function public.find_driver_by_code(_code text)
returns table(id uuid, driver_code text, first_name text, paternal_surname text, bank_account text)
language sql
stable
security definer
set search_path = public
as $$
  select id, driver_code, first_name, paternal_surname, bank_account
  from public.profiles
  where upper(driver_code) = upper(_code)
    and role = 'driver'
    and status = 'active'
  limit 1;
$$;

-- Atomic fare payment: debits passenger, credits driver, records transaction.
create or replace function public.pay_fare(
  _driver_code text,
  _tickets integer,
  _lat numeric default null,
  _lng numeric default null
)
returns table(
  verification_code text,
  total numeric,
  base_amount numeric,
  extra_amount numeric,
  category public.fare_category,
  new_balance numeric
)
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  _p public.profiles%ROWTYPE;
  _d public.profiles%ROWTYPE;
  _base numeric; _extra numeric; _total numeric; _code text; _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _tickets IS NULL OR _tickets < 1 OR _tickets > 10 THEN RAISE EXCEPTION 'Cantidad de pasajes inválida'; END IF;

  SELECT * INTO _p FROM public.profiles WHERE id = auth.uid();
  IF _p.id IS NULL OR _p.status <> 'active' THEN RAISE EXCEPTION 'Pasajero no activo'; END IF;

  SELECT * INTO _d FROM public.profiles
    WHERE upper(driver_code) = upper(_driver_code) AND role = 'driver' AND status = 'active';
  IF _d.id IS NULL THEN RAISE EXCEPTION 'Chofer no encontrado o no activo'; END IF;

  _base  := public.fare_for_category(coalesce(_p.category, 'general'));
  _extra := (_tickets - 1) * 3.0;             -- extra tickets always at General fare
  _total := _base + _extra;
  IF _p.balance < _total THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  _code := lpad(floor(random()*100000)::int::text, 5, '0');

  UPDATE public.profiles SET balance = balance - _total WHERE id = _p.id RETURNING balance INTO _bal;
  UPDATE public.profiles SET balance = balance + _total WHERE id = _d.id;

  INSERT INTO public.transactions (driver_id, passenger_id, category, amount, verification_code, tickets, latitude, longitude)
  VALUES (_d.id, _p.id, coalesce(_p.category,'general'), _total, _code, _tickets, _lat, _lng);

  RETURN QUERY SELECT _code, _total, _base, _extra, coalesce(_p.category,'general')::public.fare_category, _bal;
END; $$;

create or replace function public.topup_wallet(_amount numeric, _method text default 'qr')
returns numeric
language plpgsql
security definer
set search_path = public
as $$
DECLARE _bal numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF _amount IS NULL OR _amount <= 0 OR _amount > 1000 THEN RAISE EXCEPTION 'Monto inválido'; END IF;
  UPDATE public.profiles SET balance = balance + _amount WHERE id = auth.uid() RETURNING balance INTO _bal;
  INSERT INTO public.wallet_topups (user_id, amount, method) VALUES (auth.uid(), _amount, coalesce(_method,'qr'));
  RETURN _bal;
END; $$;

create or replace function public.withdraw_earnings(_amount numeric, _destination text)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
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

-- ---------- 10. TRIGGERS ----------
create or replace function public.reports_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

create trigger trg_reports_updated_at
before update on public.reports
for each row execute function public.reports_touch_updated_at();

-- ---------- 11. REALTIME (driver OLED live updates) ----------
alter publication supabase_realtime add table public.transactions;

-- ---------- 12. STORAGE BUCKETS ----------
insert into storage.buckets (id, name, public)
values ('kyc-documents','kyc-documents', false), ('qr-codes','qr-codes', false)
on conflict (id) do nothing;

create policy "kyc owner access" on storage.objects
  for all to authenticated
  using (bucket_id = 'kyc-documents' and (owner = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor')))
  with check (bucket_id = 'kyc-documents' and owner = auth.uid());

create policy "qr owner access" on storage.objects
  for all to authenticated
  using (bucket_id = 'qr-codes' and (owner = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'supervisor')))
  with check (bucket_id = 'qr-codes' and owner = auth.uid());
