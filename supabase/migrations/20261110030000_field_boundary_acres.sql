-- Boundary-derived acres on field_boundaries.
-- geometry is GeoJSON jsonb, CRS EPSG:4326, axis_order lonlat (enforced by checks).
-- Prefer PostGIS geography ST_Area; fall back to spherical excess when PostGIS
-- is unavailable (fixture engines). fields.acres is left in place as fallback
-- for fields with no boundary row.
-- Trigger-maintained column (not GENERATED): jsonb + optional PostGIS cannot be
-- a portable IMMUTABLE generated expression across Supabase and PGlite.
-- Not applied to production by this commit.

BEGIN;

-- Supabase / local Postgres with PostGIS. Fixture engines without the
-- extension continue; field_boundary_geojson_acres falls back to spherical math.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'postgis not installed; boundary acres will use spherical fallback (%)',
    SQLERRM;
END $$;

-- Acres from GeoJSON polygon/multipolygon. SRID 4326 → geography → m² → acres.
CREATE OR REPLACE FUNCTION public.field_boundary_geojson_acres(geom jsonb)
RETURNS numeric
LANGUAGE plpgsql
STABLE
PARALLEL SAFE
STRICT
SET search_path = public, extensions
AS $$
DECLARE
  result numeric;
  kind text;
  polys jsonb;
  rings jsonb;
  ring jsonb;
  i int;
  k int;
  n int;
  lat1 float8;
  lng1 float8;
  lat2 float8;
  lng2 float8;
  total float8 := 0;
  area_m2 float8;
  earth_r float8 := 6371008.8;
BEGIN
  -- Production / Supabase path: ellipsoid-aware geography area.
  -- EXECUTE keeps ::geography out of parse-time resolution so fixture engines
  -- without PostGIS can still CREATE this function. search_path includes
  -- extensions because Supabase installs PostGIS there.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    BEGIN
      EXECUTE
        'SELECT round(
           (ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography) / 4046.8564224)::numeric,
           2
         )'
        INTO result
        USING geom::text;
      RETURN result;
    EXCEPTION
      WHEN invalid_parameter_value THEN
        RETURN NULL;
      WHEN data_exception THEN
        RETURN NULL;
    END;
  END IF;

  -- Fixture fallback (no PostGIS): spherical excess over exterior rings only.
  IF geom IS NULL OR jsonb_typeof(geom) <> 'object' THEN
    RETURN NULL;
  END IF;
  kind := geom->>'type';
  IF kind = 'Polygon' THEN
    polys := jsonb_build_array(geom->'coordinates');
  ELSIF kind = 'MultiPolygon' THEN
    polys := geom->'coordinates';
  ELSE
    RETURN NULL;
  END IF;
  IF jsonb_typeof(polys) <> 'array' THEN
    RETURN NULL;
  END IF;

  FOR i IN 0..jsonb_array_length(polys) - 1 LOOP
    rings := polys->i;
    IF jsonb_typeof(rings) <> 'array' OR jsonb_array_length(rings) < 1 THEN
      CONTINUE;
    END IF;
    -- Exterior ring only (index 0).
    ring := rings->0;
    IF jsonb_typeof(ring) <> 'array' OR jsonb_array_length(ring) < 4 THEN
      CONTINUE;
    END IF;
    n := jsonb_array_length(ring);
    FOR k IN 0..n - 2 LOOP
      lng1 := (ring->k->>0)::float8;
      lat1 := (ring->k->>1)::float8;
      lng2 := (ring->(k + 1)->>0)::float8;
      lat2 := (ring->(k + 1)->>1)::float8;
      total := total
        + radians(lng2 - lng1)
          * (2 + sin(radians(lat1)) + sin(radians(lat2)));
    END LOOP;
  END LOOP;

  area_m2 := abs((total * earth_r * earth_r) / 2);
  RETURN round((area_m2 / 4046.8564224)::numeric, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.field_boundary_geojson_acres(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.field_boundary_geojson_acres(jsonb) TO service_role;

COMMENT ON FUNCTION public.field_boundary_geojson_acres(jsonb) IS
  'Acres from field_boundaries.geometry GeoJSON (EPSG:4326 lonlat). Uses ST_Area(geography) when PostGIS is present.';

-- Views may already reference acres from a partial apply; drop before column swap.
DROP VIEW IF EXISTS public.grower_fields;
DROP VIEW IF EXISTS public.grower_field_boundaries;

ALTER TABLE public.field_boundaries
  DROP COLUMN IF EXISTS acres;

ALTER TABLE public.field_boundaries
  ADD COLUMN acres numeric(14,2);

COMMENT ON COLUMN public.field_boundaries.acres IS
  'Area in acres from boundary geometry (EPSG:4326 geography via ST_Area when PostGIS is present). Primary acres source; fields.acres remains as fallback when no boundary exists.';

CREATE OR REPLACE FUNCTION public.field_boundaries_acres_tg()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  NEW.acres := public.field_boundary_geojson_acres(NEW.geometry);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS field_boundaries_acres_tg ON public.field_boundaries;
CREATE TRIGGER field_boundaries_acres_tg
  BEFORE INSERT OR UPDATE OF geometry
  ON public.field_boundaries
  FOR EACH ROW
  EXECUTE FUNCTION public.field_boundaries_acres_tg();

-- Backfill existing rows (read geometry, write acres only).
UPDATE public.field_boundaries
   SET acres = public.field_boundary_geojson_acres(geometry);

-- Grower field acres: boundary first, then stored fields.acres.
CREATE VIEW public.grower_fields
WITH (security_barrier = true) AS
SELECT f.id,
       f.name,
       coalesce(fb.acres, f.acres)::numeric(14,4) AS acres,
       f.lat,
       f.lng,
       f.elevation,
       f.soil_type
FROM public.fields AS f
LEFT JOIN public.field_boundaries AS fb ON fb.field_id = f.id
WHERE public.grower_can_see_field(f.id);

COMMENT ON VIEW public.grower_fields IS
  'Grower-visible fields for app.grower_operation_id. Acres prefer field_boundaries.acres, else fields.acres.';

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
  'Grower-visible field outlines for app.grower_operation_id. Includes boundary acres.';

REVOKE ALL ON TABLE
  public.grower_fields,
  public.grower_field_boundaries
FROM PUBLIC, anon, authenticated, service_role, acre_grower;

GRANT SELECT ON
  public.grower_fields,
  public.grower_field_boundaries
TO acre_grower;

COMMIT;
