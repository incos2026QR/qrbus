CREATE OR REPLACE FUNCTION public.fare_for_category(_c public.fare_category)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (
      SELECT precio
      FROM public.tarifas
      WHERE tipo = CASE _c
        WHEN 'secundaria'::public.fare_category THEN 'universitario'
        ELSE _c::text
      END
    ),
    2.0
  )::numeric
$function$;
