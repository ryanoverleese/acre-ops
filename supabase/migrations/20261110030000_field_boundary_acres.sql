-- Boundary-derived acres on field_boundaries.
-- geometry is GeoJSON jsonb, CRS EPSG:4326, axis_order lonlat (enforced by checks).
-- Trigger-maintained column (not GENERATED): jsonb + PostGIS is not a portable
-- IMMUTABLE generated expression across Supabase and PGlite fixtures.
-- fields.acres is left in place as fallback when no boundary row exists.
-- Not applied to production by this commit.

BEGIN;

-- Supabase: PostGIS lives in the extensions schema. Prefer that install path.
-- Fixture engines without PostGIS continue; field_boundary_geojson_acres falls
-- back to spherical math.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'postgis not available; boundary acres will use spherical fallback (%)',
    SQLERRM;
END $$;

-- Acres from GeoJSON polygon/multipolygon. SRID 4326 → geography → m² → acres.
-- PostGIS calls are schema-qualified to whichever schema owns the extension
-- (extensions on Supabase; public if already installed elsewhere).
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
  postgis_schema text;
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
  SELECT n.nspname
    INTO postgis_schema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'postgis'
   LIMIT 1;

  -- Production / Supabase path: ellipsoid-aware geography area.
  -- EXECUTE + schema qualification keeps types/functions resolvable when
  -- PostGIS is in extensions (or public), and keeps CREATE FUNCTION working
  -- on fixture engines that lack PostGIS entirely.
  IF postgis_schema IS NOT NULL THEN
    BEGIN
      EXECUTE format(
        'SELECT round(
           (%1$I.ST_Area(
              %1$I.ST_SetSRID(%1$I.ST_GeomFromGeoJSON($1), 4326)::%1$I.geography
            ) / 4046.8564224)::numeric,
           2
         )',
        postgis_schema
      )
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

-- Owner/service use only. Grower roles never call this; they SELECT the
-- acres column through grower_* views (no EXECUTE grants for growers).
REVOKE ALL ON FUNCTION public.field_boundary_geojson_acres(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acre_grower') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.field_boundary_geojson_acres(jsonb) FROM acre_grower';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acre_grower_preview') THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.field_boundary_geojson_acres(jsonb) FROM acre_grower_preview';
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.field_boundary_geojson_acres(jsonb) TO service_role;

COMMENT ON FUNCTION public.field_boundary_geojson_acres(jsonb) IS
  'Acres from field_boundaries.geometry GeoJSON (EPSG:4326 lonlat). Uses schema-qualified ST_Area(geography) when PostGIS is present.';

-- Views may already reference acres from a partial apply; drop before column swap.
DROP VIEW IF EXISTS public.grower_fields;
DROP VIEW IF EXISTS public.grower_field_boundaries;

ALTER TABLE public.field_boundaries
  DROP COLUMN IF EXISTS acres;

ALTER TABLE public.field_boundaries
  ADD COLUMN acres numeric(14,2);

COMMENT ON COLUMN public.field_boundaries.acres IS
  'Area in acres from boundary geometry (EPSG:4326 geography via ST_Area). Primary acres source; fields.acres remains as fallback when no boundary exists.';

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

-- Interim grower views until 20261110040000 adds acres_from_boundary.
-- Prefer field_boundaries.acres; fall back to fields.acres. No PostGIS in the view.
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

-- Restore the same SELECT grants growers already have (drop/create clears them).
-- No EXECUTE on field_boundary_geojson_acres — views only read the acres column.
REVOKE ALL ON TABLE
  public.grower_fields,
  public.grower_field_boundaries
FROM PUBLIC, anon, authenticated, service_role;

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
