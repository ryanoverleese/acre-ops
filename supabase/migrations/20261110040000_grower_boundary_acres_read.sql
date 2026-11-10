-- Grower acres from boundary geometry on the read side (Ryan).
-- field_boundaries.geometry is GeoJSON jsonb, CRS EPSG:4326, axis_order lonlat.
-- Prefer ST_Area(geography)/4046.8564224 via field_boundary_geojson_acres, rounded
-- to 1 decimal. No boundary → fall back to fields.acres and flag acres_from_boundary.
-- Not applied to production by this commit.

BEGIN;

-- Depends on field_boundary_geojson_acres from 20261110030000_field_boundary_acres.sql
-- (PostGIS ST_Area geography when available; spherical fallback for fixtures).
-- Grower selects the view as invoker, so the role needs EXECUTE on the helper.
GRANT EXECUTE ON FUNCTION public.field_boundary_geojson_acres(jsonb) TO acre_grower;

DROP VIEW IF EXISTS public.grower_fields;
CREATE VIEW public.grower_fields
WITH (security_barrier = true) AS
SELECT f.id,
       f.name,
       coalesce(b.boundary_acres, f.acres)::numeric(14,4) AS acres,
       (b.boundary_acres IS NOT NULL) AS acres_from_boundary,
       f.lat,
       f.lng,
       f.elevation,
       f.soil_type
FROM public.fields AS f
LEFT JOIN LATERAL (
  SELECT round(public.field_boundary_geojson_acres(fb.geometry), 1) AS boundary_acres
    FROM public.field_boundaries AS fb
   WHERE fb.field_id = f.id
   LIMIT 1
) AS b ON true
WHERE public.grower_can_see_field(f.id);

COMMENT ON VIEW public.grower_fields IS
  'Grower-visible fields. acres = round(ST_Area(boundary geography)/4046.8564224, 1) when a boundary exists; else fields.acres. acres_from_boundary marks the source.';

DROP VIEW IF EXISTS public.grower_field_boundaries;
CREATE VIEW public.grower_field_boundaries
WITH (security_barrier = true) AS
SELECT fb.field_id,
       fb.geometry,
       fb.crs,
       fb.axis_order,
       fb.source,
       fb.updated_at,
       round(public.field_boundary_geojson_acres(fb.geometry), 1) AS acres
FROM public.field_boundaries AS fb
WHERE public.grower_can_see_field(fb.field_id);

COMMENT ON VIEW public.grower_field_boundaries IS
  'Grower-visible field outlines. acres is boundary area rounded to 1 decimal.';

REVOKE ALL ON TABLE
  public.grower_fields,
  public.grower_field_boundaries
FROM PUBLIC, anon, authenticated, service_role, acre_grower;

GRANT SELECT ON
  public.grower_fields,
  public.grower_field_boundaries
TO acre_grower;

COMMIT;
