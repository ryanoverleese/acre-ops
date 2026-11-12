-- Grower probe list may show the probe type and the billing entity that owns it.
-- The owner name is returned only when that billing entity is already tied to
-- the signed-in farm through contact_billing_entities → contact_operations.
-- acre_grower still has no SELECT on the office tables.

BEGIN;

CREATE OR REPLACE VIEW public.grower_probe_assignments
WITH (security_barrier = true) AS
SELECT pa.id,
       pa.field_season_id,
       fs.field_id,
       fs.season,
       pa.probe_id,
       p.serial_number AS probe_serial_number,
       p.year_new AS probe_year_new,
       pa.probe_number,
       pa.label,
       status.value AS probe_status,
       pa.install_date,
       pa.install_lat,
       pa.install_lng,
       pa.placement_lat,
       pa.placement_lng,
       coalesce(pa.elevation, f.elevation) AS elevation,
       coalesce(nullif(pa.soil_type, ''), f.soil_type) AS soil_type,
       pa.removal_date,
       pa.removal_at,
       nullif(btrim(brand.value), '') AS probe_brand,
       owner.name AS owner_billing_entity
FROM public.probe_assignments AS pa
JOIN public.field_seasons AS fs ON fs.id = pa.field_season_id
JOIN public.fields AS f ON f.id = fs.field_id
LEFT JOIN public.probes AS p ON p.id = pa.probe_id
LEFT JOIN public.assignment_probe_status_options AS status ON status.id = pa.probe_status_id
LEFT JOIN public.probe_brand_options AS brand ON brand.id = p.brand_id
LEFT JOIN LATERAL (
  SELECT be.name
  FROM public.probe_billing_entities AS pbe
  JOIN public.billing_entities AS be ON be.id = pbe.billing_entity_id
  WHERE pbe.probe_id = p.id
    AND EXISTS (
      SELECT 1
      FROM public.contact_billing_entities AS cbe
      JOIN public.contact_operations AS co ON co.contact_id = cbe.contact_id
      WHERE cbe.billing_entity_id = be.id
        AND co.operation_id = public.grower_operation_id()
    )
  ORDER BY pbe.position, be.id
  LIMIT 1
) AS owner ON true
WHERE public.grower_can_see_field(fs.field_id);

COMMENT ON VIEW public.grower_probe_assignments IS
  'Grower-visible probe placements. probe_brand is probes.brand. owner_billing_entity is the first billing entity on the probe that this farm already reaches.';

COMMIT;
