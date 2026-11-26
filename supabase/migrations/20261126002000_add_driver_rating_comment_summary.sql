BEGIN;

CREATE VIEW public.driver_rating_report_comments
WITH (security_invoker = true)
AS
SELECT
  tx.driver_id,
  coalesce(
    jsonb_agg(
      jsonb_build_object(
        'rating', r.rating,
        'comment', btrim(r.comment),
        'created_at', r.created_at
      )
      ORDER BY r.created_at DESC
    ) FILTER (WHERE nullif(btrim(r.comment), '') IS NOT NULL),
    '[]'::jsonb
  ) AS comments
FROM public.transaction_ratings AS r
JOIN public.transactions AS tx ON tx.id = r.transaction_id
GROUP BY tx.driver_id;

REVOKE ALL ON public.driver_rating_report_comments FROM PUBLIC, anon;
GRANT SELECT ON public.driver_rating_report_comments TO authenticated;

COMMIT;
