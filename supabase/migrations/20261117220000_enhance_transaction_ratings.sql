BEGIN;

ALTER TABLE public.transaction_ratings
  ADD COLUMN selected_comments text[] NOT NULL DEFAULT '{}',
  ADD COLUMN comment text;

ALTER TABLE public.transaction_ratings
  DROP CONSTRAINT IF EXISTS transaction_ratings_rating_check,
  ADD CONSTRAINT transaction_ratings_rating_half_star_check
    CHECK (rating BETWEEN 0.5 AND 5 AND rating * 2 = trunc(rating * 2)),
  ADD CONSTRAINT transaction_ratings_comment_length_check
    CHECK (comment IS NULL OR char_length(comment) <= 500),
  ADD CONSTRAINT transaction_ratings_selected_comments_check
    CHECK (
      cardinality(selected_comments) <= 10
      AND selected_comments <@
        CASE
          WHEN rating = 5 THEN ARRAY[
            'trato_amable',
            'conduccion_segura',
            'cobro_correcto',
            'respeto_pasaje_diferenciado',
            'vehiculo_buen_estado'
          ]::text[]
          ELSE ARRAY[
            'trato_amable',
            'conduccion_segura',
            'cobro_correcto',
            'respeto_pasaje_diferenciado',
            'vehiculo_buen_estado',
            'trato_mejorable',
            'conduccion_puede_mejorar',
            'cobro_puede_mejorar',
            'respeto_pasaje_diferenciado_puede_mejorar',
            'vehiculo_requiere_mejoras'
          ]::text[]
        END
    );

CREATE VIEW public.driver_rating_report_summary
WITH (security_invoker = true)
AS
WITH rating_summary AS (
  SELECT
    tx.driver_id,
    count(*)::integer AS rating_count,
    avg(r.rating)::numeric(3, 2) AS average_rating,
    count(*) FILTER (WHERE r.rating = 1)::integer AS rating_1_count,
    count(*) FILTER (WHERE r.rating = 0.5)::integer AS rating_0_5_count,
    count(*) FILTER (WHERE r.rating = 1.5)::integer AS rating_1_5_count,
    count(*) FILTER (WHERE r.rating = 2)::integer AS rating_2_count,
    count(*) FILTER (WHERE r.rating = 2.5)::integer AS rating_2_5_count,
    count(*) FILTER (WHERE r.rating = 3)::integer AS rating_3_count,
    count(*) FILTER (WHERE r.rating = 3.5)::integer AS rating_3_5_count,
    count(*) FILTER (WHERE r.rating = 4)::integer AS rating_4_count,
    count(*) FILTER (WHERE r.rating = 4.5)::integer AS rating_4_5_count,
    count(*) FILTER (WHERE r.rating = 5)::integer AS rating_5_count
  FROM public.transaction_ratings AS r
  JOIN public.transactions AS tx ON tx.id = r.transaction_id
  GROUP BY tx.driver_id
),
reason_summary AS (
  SELECT
    tx.driver_id,
    jsonb_object_agg(reasons.reason, reasons.selections) AS selected_reason_counts
  FROM (
    SELECT
      tx.driver_id,
      selected_reason.reason,
      count(*)::integer AS selections
    FROM public.transaction_ratings AS r
    JOIN public.transactions AS tx ON tx.id = r.transaction_id
    CROSS JOIN LATERAL unnest(r.selected_comments) AS selected_reason(reason)
    GROUP BY tx.driver_id, selected_reason.reason
  ) AS reasons
  GROUP BY reasons.driver_id
)
SELECT
  summary.driver_id,
  summary.rating_count,
  summary.average_rating,
  summary.rating_0_5_count,
  summary.rating_1_count,
  summary.rating_1_5_count,
  summary.rating_2_count,
  summary.rating_2_5_count,
  summary.rating_3_count,
  summary.rating_3_5_count,
  summary.rating_4_count,
  summary.rating_4_5_count,
  summary.rating_5_count,
  coalesce(reasons.selected_reason_counts, '{}'::jsonb) AS selected_reason_counts
FROM rating_summary AS summary
LEFT JOIN reason_summary AS reasons ON reasons.driver_id = summary.driver_id;

REVOKE ALL ON public.driver_rating_report_summary FROM PUBLIC, anon;
GRANT SELECT ON public.driver_rating_report_summary TO authenticated;

COMMIT;
