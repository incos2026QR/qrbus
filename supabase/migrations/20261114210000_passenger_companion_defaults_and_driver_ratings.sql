BEGIN;

CREATE TABLE public.passenger_companion_defaults (
  passenger_id uuid PRIMARY KEY REFERENCES public.passengers(id) ON DELETE CASCADE,
  categories public.fare_category[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT passenger_companion_defaults_max_categories
    CHECK (cardinality(categories) <= 9)
);

ALTER TABLE public.passenger_companion_defaults ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.passenger_companion_defaults TO authenticated;
GRANT ALL ON public.passenger_companion_defaults TO service_role;

CREATE POLICY "passengers read own companion defaults"
  ON public.passenger_companion_defaults FOR SELECT TO authenticated
  USING (passenger_id = auth.uid());

CREATE OR REPLACE FUNCTION public.save_my_companion_defaults(
  _companions public.fare_category[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _passenger_id uuid := auth.uid();
  _categories public.fare_category[] := coalesce(
    _companions,
    '{}'::public.fare_category[]
  );
BEGIN
  IF _passenger_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF cardinality(_categories) > 9 THEN
    RAISE EXCEPTION 'Máximo 9 acompañantes predeterminados';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.passengers
    WHERE id = _passenger_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Pasajero no activo';
  END IF;

  INSERT INTO public.passenger_companion_defaults (passenger_id, categories)
  VALUES (_passenger_id, _categories)
  ON CONFLICT (passenger_id) DO UPDATE
  SET categories = EXCLUDED.categories, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_companion_defaults(public.fare_category[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_companion_defaults(public.fare_category[])
  TO authenticated;

CREATE TABLE public.transaction_ratings (
  transaction_id uuid PRIMARY KEY REFERENCES public.transactions(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES public.passengers(id) ON DELETE CASCADE,
  rating numeric(2, 1) NOT NULL
    CHECK (rating >= 0.5 AND rating <= 5 AND rating * 2 = trunc(rating * 2)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX transaction_ratings_passenger_id_idx
  ON public.transaction_ratings (passenger_id);

ALTER TABLE public.transaction_ratings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.transaction_ratings TO authenticated;
GRANT ALL ON public.transaction_ratings TO service_role;

CREATE POLICY "passengers read own transaction ratings"
  ON public.transaction_ratings FOR SELECT TO authenticated
  USING (passenger_id = auth.uid());

CREATE POLICY "drivers read ratings for their transactions"
  ON public.transaction_ratings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.transactions AS tx
      WHERE tx.id = transaction_ratings.transaction_id
        AND tx.driver_id = auth.uid()
    )
  );

CREATE POLICY "staff read transaction ratings"
  ON public.transaction_ratings FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "passengers rate own transactions"
  ON public.transaction_ratings FOR INSERT TO authenticated
  WITH CHECK (
    passenger_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.transactions AS tx
      WHERE tx.id = transaction_ratings.transaction_id
        AND tx.passenger_id = auth.uid()
    )
  );

COMMIT;
