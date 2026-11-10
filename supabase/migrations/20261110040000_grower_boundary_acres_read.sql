-- Grower views: read field_boundaries.acres (column), not live PostGIS.
-- Depends on 20261110030000_field_boundary_acres.sql. No ST_* in this file —
-- safe once the acres column exists even before/after PostGIS is enabled.
-- Fall back to fields.acres when no boundary acres exist; flag the source.
-- Grants match prior grower_read_lock SELECT-only grants (no new EXECUTE).
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
  'Grower-visible fields. acres prefer field_boundaries.acres (geometry-derived column); else fields.acres. acres_from_boundary marks the source.';

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
FROM PUBLIC, anon, authenticated, service_role;

-- Same SELECT grants growers already hold — no new privileges (no EXECUTE).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acre_grower') THEN
    EXECUTE 'REVOKE ALL ON public.grower_fields, public.grower_field_boundaries FROM acre_grower';
    EXECUTE 'GRANT SELECT ON public.grower_fields, public.grower_field_boundaries TO acre_grower';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acre_grower_preview') THEN
    EXECUTE 'REVOKE ALL ON public.grower_fields, public.grower_field_boundaries FROM acre_grower_preview';
    EXECUTE 'GRANT SELECT ON public.grower_fields, public.grower_field_boundaries TO acre_grower_preview';
  END IF;
END $$;

COMMIT;
