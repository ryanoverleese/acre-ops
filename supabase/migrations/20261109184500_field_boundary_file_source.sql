-- Shapefile boundaries for Acre Ops. Not applied to the live project by this commit.
-- Additive only. This file does not rewrite or remove existing rows. The existing CropX rows stay valid.
-- A cropx row still requires cropx_field_uuid. A file row has a null uuid and
-- records the shapefile name, the zip sha256, and the feature name.
-- field_boundaries is still written only by the stage/apply path.

ALTER TABLE public.field_boundary_imports
  DROP CONSTRAINT field_boundary_imports_source_check;
ALTER TABLE public.field_boundary_imports
  ADD CONSTRAINT field_boundary_imports_source_check
  CHECK (source IN ('cropx', 'file'));
COMMENT ON TABLE public.field_boundary_imports IS 'Authorized boundary import jobs from CropX or a provided shapefile. Dry-runs are not stored. Apply reads these rows and does not call CropX.';

ALTER TABLE public.field_boundary_import_rows
  ADD COLUMN source text NOT NULL DEFAULT 'cropx',
  ADD COLUMN source_file_name text,
  ADD COLUMN source_file_sha256 text,
  ADD COLUMN source_feature_name text;
ALTER TABLE public.field_boundary_import_rows
  ALTER COLUMN cropx_field_uuid DROP NOT NULL;
ALTER TABLE public.field_boundary_import_rows
  ADD CONSTRAINT field_boundary_import_rows_source_check
  CHECK (source IN ('cropx', 'file'));
ALTER TABLE public.field_boundary_import_rows
  ADD CONSTRAINT field_boundary_import_rows_lineage_check
  CHECK (
    (
      source = 'cropx'
      AND cropx_field_uuid IS NOT NULL
      AND source_file_name IS NULL
      AND source_file_sha256 IS NULL
      AND source_feature_name IS NULL
    )
    OR
    (
      source = 'file'
      AND cropx_field_uuid IS NULL
      AND source_file_name IS NOT NULL
      AND source_file_name = btrim(source_file_name)
      AND char_length(source_file_name) BETWEEN 1 AND 200
      AND source_file_sha256 ~ '^[0-9a-f]{64}$'
      AND source_feature_name IS NOT NULL
      AND source_feature_name = btrim(source_feature_name)
      AND char_length(source_feature_name) BETWEEN 1 AND 200
    )
  );
COMMENT ON COLUMN public.field_boundary_import_rows.source IS 'cropx requires cropx_field_uuid. file requires source_file_name, source_file_sha256, and source_feature_name.';
COMMENT ON COLUMN public.field_boundary_import_rows.source_file_name IS 'Shapefile name for a file import. Null on a CropX row.';
COMMENT ON COLUMN public.field_boundary_import_rows.source_file_sha256 IS 'SHA-256 of the zip the shapefile came from. Null on a CropX row.';
COMMENT ON COLUMN public.field_boundary_import_rows.source_feature_name IS 'Feature name inside the shapefile. Null on a CropX row.';

ALTER TABLE public.field_boundaries
  ADD COLUMN source_file_name text,
  ADD COLUMN source_file_sha256 text,
  ADD COLUMN source_feature_name text;
ALTER TABLE public.field_boundaries
  DROP CONSTRAINT field_boundaries_source_check;
ALTER TABLE public.field_boundaries
  ADD CONSTRAINT field_boundaries_source_check
  CHECK (source IN ('cropx', 'edited', 'file'));
ALTER TABLE public.field_boundaries
  ALTER COLUMN cropx_field_uuid DROP NOT NULL;
ALTER TABLE public.field_boundaries
  DROP CONSTRAINT field_boundaries_cropx_field_uuid_key;
CREATE UNIQUE INDEX field_boundaries_cropx_field_uuid_key
  ON public.field_boundaries (cropx_field_uuid)
  WHERE cropx_field_uuid IS NOT NULL;
COMMENT ON INDEX public.field_boundaries_cropx_field_uuid_key IS 'Non-null CropX uuids stay unique. File boundaries leave cropx_field_uuid null.';
ALTER TABLE public.field_boundaries
  ADD CONSTRAINT field_boundaries_lineage_check
  CHECK (
    (
      source = 'cropx'
      AND cropx_field_uuid IS NOT NULL
      AND source_file_name IS NULL
      AND source_file_sha256 IS NULL
      AND source_feature_name IS NULL
    )
    OR
    (
      source = 'file'
      AND cropx_field_uuid IS NULL
      AND source_file_name IS NOT NULL
      AND source_file_name = btrim(source_file_name)
      AND char_length(source_file_name) BETWEEN 1 AND 200
      AND source_file_sha256 ~ '^[0-9a-f]{64}$'
      AND source_feature_name IS NOT NULL
      AND source_feature_name = btrim(source_feature_name)
      AND char_length(source_feature_name) BETWEEN 1 AND 200
    )
    OR
    (
      source = 'edited'
      AND (
        (
          cropx_field_uuid IS NOT NULL
          AND source_file_name IS NULL
          AND source_file_sha256 IS NULL
          AND source_feature_name IS NULL
        )
        OR
        (
          cropx_field_uuid IS NULL
          AND source_file_name IS NOT NULL
          AND source_file_name = btrim(source_file_name)
          AND char_length(source_file_name) BETWEEN 1 AND 200
          AND source_file_sha256 ~ '^[0-9a-f]{64}$'
          AND source_feature_name IS NOT NULL
          AND source_feature_name = btrim(source_feature_name)
          AND char_length(source_feature_name) BETWEEN 1 AND 200
        )
      )
    )
  );
COMMENT ON TABLE public.field_boundaries IS 'One current boundary for public.fields.id. CropX rows keep a uuid. File rows are keyed by field_id and keep the shapefile name, zip sha256, and feature name. Apply skips unchanged rows and never overwrites an edited boundary.';
COMMENT ON COLUMN public.field_boundaries.source_file_name IS 'Shapefile name for source file. Null for CropX. Kept when the boundary is later edited.';
COMMENT ON COLUMN public.field_boundaries.source_file_sha256 IS 'SHA-256 of the zip the shapefile came from. Null for CropX.';
COMMENT ON COLUMN public.field_boundaries.source_feature_name IS 'Feature name inside the shapefile. Null for CropX.';
