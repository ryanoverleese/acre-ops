-- Field boundaries for Acre Ops. Not applied to the live project by this commit.
-- field_id is public.fields.id. It is never a field_seasons id or a Baserow id.
-- Staging rows are the import record. field_boundaries changes only when an
-- authorized apply copies an eligible row, or a staff member explicitly edits.
-- CRS is stored only when the dataset declares EPSG:4326 and lonlat. No transform.

CREATE FUNCTION public.field_boundary_geometry_valid(geom jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  kind text;
  polys jsonb;
  rings jsonb;
  ring jsonb;
  pos jsonb;
  i int;
  j int;
  k int;
  lon numeric;
  lat numeric;
  lon0 numeric;
  lat0 numeric;
BEGIN
  IF geom IS NULL OR jsonb_typeof(geom) <> 'object' THEN RETURN false; END IF;
  IF jsonb_exists(geom, 'crs') OR jsonb_exists(geom, 'bbox') THEN RETURN false; END IF;
  kind := geom->>'type';
  IF kind = 'Polygon' THEN
    polys := jsonb_build_array(geom->'coordinates');
  ELSIF kind = 'MultiPolygon' THEN
    polys := geom->'coordinates';
  ELSE
    RETURN false;
  END IF;
  IF jsonb_typeof(polys) <> 'array' OR jsonb_array_length(polys) < 1 OR jsonb_array_length(polys) > 100 THEN
    RETURN false;
  END IF;
  FOR i IN 0..jsonb_array_length(polys) - 1 LOOP
    rings := polys->i;
    IF jsonb_typeof(rings) <> 'array' OR jsonb_array_length(rings) < 1 OR jsonb_array_length(rings) > 100 THEN
      RETURN false;
    END IF;
    FOR j IN 0..jsonb_array_length(rings) - 1 LOOP
      ring := rings->j;
      IF jsonb_typeof(ring) <> 'array' OR jsonb_array_length(ring) < 4 OR jsonb_array_length(ring) > 20000 THEN
        RETURN false;
      END IF;
      lon0 := NULL;
      lat0 := NULL;
      FOR k IN 0..jsonb_array_length(ring) - 1 LOOP
        pos := ring->k;
        IF jsonb_typeof(pos) <> 'array' OR jsonb_array_length(pos) <> 2 THEN RETURN false; END IF;
        IF jsonb_typeof(pos->0) <> 'number' OR jsonb_typeof(pos->1) <> 'number' THEN RETURN false; END IF;
        lon := (pos->>0)::numeric;
        lat := (pos->>1)::numeric;
        IF lon < -180 OR lon > 180 OR lat < -90 OR lat > 90 THEN RETURN false; END IF;
        IF k > 0 AND k < jsonb_array_length(ring) - 1 AND lon = (ring->(k - 1)->>0)::numeric AND lat = (ring->(k - 1)->>1)::numeric THEN
          RETURN false;
        END IF;
        IF k = 0 THEN lon0 := lon; lat0 := lat; END IF;
        IF k = jsonb_array_length(ring) - 1 AND (lon IS DISTINCT FROM lon0 OR lat IS DISTINCT FROM lat0) THEN
          RETURN false;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.field_boundary_geometry_valid(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.field_boundary_imports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source = 'cropx'),
  mode text NOT NULL CHECK (mode = 'stage'),
  crs text NOT NULL CHECK (crs = 'EPSG:4326'),
  axis_order text NOT NULL CHECK (axis_order = 'lonlat'),
  observed_at timestamptz NOT NULL,
  dataset_sha256 text NOT NULL CHECK (dataset_sha256 ~ '^[0-9a-f]{64}$'),
  summary jsonb NOT NULL
);
COMMENT ON TABLE public.field_boundary_imports IS 'Authorized CropX boundary import jobs. Dry-runs are not stored. Apply reads these rows and does not call CropX.';

CREATE TABLE public.field_boundary_import_rows (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id bigint NOT NULL REFERENCES public.field_boundary_imports(id) ON DELETE CASCADE,
  cropx_field_uuid text NOT NULL CHECK (cropx_field_uuid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  source_field_name text,
  source_farm_id text,
  source_farm_name text,
  source_cropx_field_id text,
  geometry jsonb CHECK (geometry IS NULL OR public.field_boundary_geometry_valid(geometry)),
  geometry_sha256 text CHECK (geometry_sha256 IS NULL OR geometry_sha256 ~ '^[0-9a-f]{64}$'),
  declared_field_id bigint,
  resolved_field_id bigint REFERENCES public.fields(id) ON DELETE RESTRICT,
  disposition text NOT NULL CHECK (disposition IN (
    'eligible', 'unchanged', 'conflict_edited', 'conflict_changed', 'ambiguous',
    'unmatched', 'invalid_geometry', 'identity_disagreement', 'unconfirmed_crosswalk',
    'failed_fetch', 'held_unresolved'
  )),
  source_observed_at timestamptz,
  legacy_br_field_season_id bigint,
  source_field_season_id bigint,
  detail text NOT NULL,
  resolution text CHECK (resolution IS NULL OR resolution = 'accept_replacement'),
  apply_result text CHECK (apply_result IS NULL OR apply_result IN ('inserted', 'replaced', 'skipped_unchanged', 'blocked')),
  applied_at timestamptz,
  CHECK ((geometry IS NULL) = (geometry_sha256 IS NULL)),
  CHECK (disposition <> 'eligible' OR resolved_field_id IS NOT NULL),
  CHECK (resolution IS NULL OR disposition = 'conflict_changed')
);
COMMENT ON COLUMN public.field_boundary_import_rows.declared_field_id IS 'Crosswalk claim. Not a foreign key: a field-season id must be retainable for review and must not be treated as fields.id.';
COMMENT ON COLUMN public.field_boundary_import_rows.resolved_field_id IS 'public.fields.id after an exact unique cropx_field_uuid match. Null when the match is ambiguous, missing, or disagreed.';
COMMENT ON COLUMN public.field_boundary_import_rows.source_cropx_field_id IS 'CropX content.fieldId preserved as provenance. It is not an Acre field id.';
COMMENT ON COLUMN public.field_boundary_import_rows.legacy_br_field_season_id IS 'Baserow field-season id used only as a bridge. Not the boundary owner.';
COMMENT ON COLUMN public.field_boundary_import_rows.source_field_season_id IS 'public.field_seasons.id from the bridge. Not the boundary owner.';

CREATE TABLE public.field_boundaries (
  field_id bigint PRIMARY KEY REFERENCES public.fields(id) ON DELETE RESTRICT,
  cropx_field_uuid text NOT NULL UNIQUE CHECK (cropx_field_uuid ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  geometry jsonb NOT NULL CHECK (public.field_boundary_geometry_valid(geometry)),
  geometry_sha256 text NOT NULL CHECK (geometry_sha256 ~ '^[0-9a-f]{64}$'),
  crs text NOT NULL CHECK (crs = 'EPSG:4326'),
  axis_order text NOT NULL CHECK (axis_order = 'lonlat'),
  source text NOT NULL CHECK (source IN ('cropx', 'edited')),
  source_observed_at timestamptz,
  import_row_id bigint REFERENCES public.field_boundary_import_rows(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  CHECK ((source = 'edited') = (edited_at IS NOT NULL))
);
COMMENT ON TABLE public.field_boundaries IS 'One current boundary for public.fields.id. CropX imports skip unchanged rows and never overwrite edited_at rows.';
COMMENT ON COLUMN public.field_boundaries.field_id IS 'public.fields.id, the enduring field. Never field_seasons.id or a Baserow field-season id.';

CREATE INDEX field_boundary_import_rows_import_id_idx ON public.field_boundary_import_rows(import_id);

ALTER TABLE public.field_boundary_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_boundary_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_boundaries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.field_boundary_imports FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.field_boundary_import_rows FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.field_boundaries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.field_boundary_imports TO service_role;
GRANT SELECT ON public.field_boundary_import_rows TO service_role;
GRANT SELECT ON public.field_boundaries TO service_role;
