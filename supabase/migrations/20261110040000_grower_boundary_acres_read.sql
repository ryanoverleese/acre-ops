-- Grower views: use field_boundaries.acres as the primary acres column.
-- Depends on 20261110030000_field_boundary_acres.sql (trigger-maintained column
-- from GeoJSON geometry via ST_Area(geography), 2 decimal places).
-- Fall back to fields.acres when no boundary acres exist; flag the source.
-- Not applied to production by this commit.

BEGIN;

DROP VIEW IF EXISTS public.grower_fields;
CREATE VIEW public.grower_fields
WITH (security_barrier = true) AS
SELECT f.id,
       f.name,
       coalesce(fb.acres, f.acres)::numeric(14,4) AS acres,
       (fb.acres IS NOT NULL) AS acres_from_boundary,
       f.lat,
       f.lng,
       f.elevation,
       f.soil_type
FROM public.fields AS f
LEFT JOIN public.field_boundaries AS fb ON fb.field_id = f.id
WHERE public.grower_can_see_field(f.id);

COMMENT ON VIEW public.grower_fields IS
  'Grower-visible fields. acres prefer field_boundaries.acres (geometry-derived); else fields.acres. acres_from_boundary marks the source.';

DROP VIEW IF EXISTS public.grower_field_boundaries;
CREATE VIEW public.grower_field_boundaries
WITH (security_barrier = true) AS
SELECT fb.field_id,
       fb.geometry,
       fb.crs,
       fb.axis_order,
       fb.source,
       fb.updated_at,
       fb.acres
FROM public.field_boundaries AS fb
WHERE public.grower_can_see_field(fb.field_id);

COMMENT ON VIEW public.grower_field_boundaries IS
  'Grower-visible field outlines including field_boundaries.acres.';

REVOKE ALL ON TABLE
  public.grower_fields,
  public.grower_field_boundaries
FROM PUBLIC, anon, authenticated, service_role, acre_grower;

GRANT SELECT ON
  public.grower_fields,
  public.grower_field_boundaries
TO acre_grower;

COMMIT;
