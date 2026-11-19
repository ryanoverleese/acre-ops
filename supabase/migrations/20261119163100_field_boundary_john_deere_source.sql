-- Add source=john_deere to boundary imports, with Operations Center lineage.
-- Does not rewrite existing CropX, file, or edited rows.
-- Apply this file to production only after review; do not auto-apply from this change.

ALTER TABLE public.field_boundary_imports
  DROP CONSTRAINT field_boundary_imports_source_check;
ALTER TABLE public.field_boundary_imports
  ADD CONSTRAINT field_boundary_imports_source_check
  CHECK (source IN ('cropx', 'file', 'john_deere'));

ALTER TABLE public.field_boundary_import_rows
  ADD COLUMN source_jd_org_id text,
  ADD COLUMN source_jd_field_id text,
  ADD COLUMN source_jd_boundary_id text,
  ADD COLUMN source_jd_fetched_at timestamptz;

ALTER TABLE public.field_boundaries
  ADD COLUMN source_jd_org_id text,
  ADD COLUMN source_jd_field_id text,
  ADD COLUMN source_jd_boundary_id text,
  ADD COLUMN source_jd_fetched_at timestamptz;

ALTER TABLE public.field_boundaries
  DROP CONSTRAINT field_boundaries_source_check;
ALTER TABLE public.field_boundaries
  ADD CONSTRAINT field_boundaries_source_check
  CHECK (source IN ('cropx', 'edited', 'file', 'john_deere'));

ALTER TABLE public.field_boundary_import_rows
  DROP CONSTRAINT field_boundary_import_rows_source_check;
ALTER TABLE public.field_boundary_import_rows
  ADD CONSTRAINT field_boundary_import_rows_source_check
  CHECK (source IN ('cropx', 'file', 'john_deere'));

-- Lineage helpers: CropX and file branches must leave John Deere columns empty.
-- A john_deere row keeps org, field, boundary, and fetched_at, and no CropX/file lineage.
-- An edited row may keep CropX, file, or John Deere lineage, or none (hand-drawn).

ALTER TABLE public.field_boundaries
  DROP CONSTRAINT field_boundaries_lineage_check;

ALTER TABLE public.field_boundaries
  ADD CONSTRAINT field_boundaries_lineage_check
  CHECK (
    (
      source = 'cropx'
      AND cropx_field_uuid IS NOT NULL
      AND source_file_name IS NULL
      AND source_file_sha256 IS NULL
      AND source_feature_name IS NULL
      AND source_jd_org_id IS NULL
      AND source_jd_field_id IS NULL
      AND source_jd_boundary_id IS NULL
      AND source_jd_fetched_at IS NULL
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
      AND source_jd_org_id IS NULL
      AND source_jd_field_id IS NULL
      AND source_jd_boundary_id IS NULL
      AND source_jd_fetched_at IS NULL
    )
    OR
    (
      source = 'john_deere'
      AND cropx_field_uuid IS NULL
      AND source_file_name IS NULL
      AND source_file_sha256 IS NULL
      AND source_feature_name IS NULL
      AND source_jd_org_id IS NOT NULL
      AND source_jd_org_id = btrim(source_jd_org_id)
      AND char_length(source_jd_org_id) BETWEEN 1 AND 64
      AND source_jd_org_id ~ '^[A-Za-z0-9._:-]+$'
      AND source_jd_field_id IS NOT NULL
      AND source_jd_field_id = btrim(source_jd_field_id)
      AND char_length(source_jd_field_id) BETWEEN 1 AND 64
      AND source_jd_field_id ~ '^[A-Za-z0-9._:-]+$'
      AND source_jd_boundary_id IS NOT NULL
      AND source_jd_boundary_id = btrim(source_jd_boundary_id)
      AND char_length(source_jd_boundary_id) BETWEEN 1 AND 64
      AND source_jd_boundary_id ~ '^[A-Za-z0-9._:-]+$'
      AND source_jd_fetched_at IS NOT NULL
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
          AND source_jd_org_id IS NULL
          AND source_jd_field_id IS NULL
          AND source_jd_boundary_id IS NULL
          AND source_jd_fetched_at IS NULL
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
          AND source_jd_org_id IS NULL
          AND source_jd_field_id IS NULL
          AND source_jd_boundary_id IS NULL
          AND source_jd_fetched_at IS NULL
        )
        OR
        (
          cropx_field_uuid IS NULL
          AND source_file_name IS NULL
          AND source_file_sha256 IS NULL
          AND source_feature_name IS NULL
          AND source_jd_org_id IS NOT NULL
          AND source_jd_org_id = btrim(source_jd_org_id)
          AND char_length(source_jd_org_id) BETWEEN 1 AND 64
          AND source_jd_org_id ~ '^[A-Za-z0-9._:-]+$'
          AND source_jd_field_id IS NOT NULL
          AND source_jd_field_id = btrim(source_jd_field_id)
          AND char_length(source_jd_field_id) BETWEEN 1 AND 64
          AND source_jd_field_id ~ '^[A-Za-z0-9._:-]+$'
          AND source_jd_boundary_id IS NOT NULL
          AND source_jd_boundary_id = btrim(source_jd_boundary_id)
          AND char_length(source_jd_boundary_id) BETWEEN 1 AND 64
          AND source_jd_boundary_id ~ '^[A-Za-z0-9._:-]+$'
          AND source_jd_fetched_at IS NOT NULL
        )
        OR
        (
          cropx_field_uuid IS NULL
          AND source_file_name IS NULL
          AND source_file_sha256 IS NULL
          AND source_feature_name IS NULL
          AND source_jd_org_id IS NULL
          AND source_jd_field_id IS NULL
          AND source_jd_boundary_id IS NULL
          AND source_jd_fetched_at IS NULL
        )
      )
    )
  );

ALTER TABLE public.field_boundary_import_rows
  DROP CONSTRAINT field_boundary_import_rows_lineage_check;

ALTER TABLE public.field_boundary_import_rows
  ADD CONSTRAINT field_boundary_import_rows_lineage_check
  CHECK (
    (
      source = 'cropx'
      AND cropx_field_uuid IS NOT NULL
      AND source_file_name IS NULL
      AND source_file_sha256 IS NULL
      AND source_feature_name IS NULL
      AND source_jd_org_id IS NULL
      AND source_jd_field_id IS NULL
      AND source_jd_boundary_id IS NULL
      AND source_jd_fetched_at IS NULL
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
      AND source_jd_org_id IS NULL
      AND source_jd_field_id IS NULL
      AND source_jd_boundary_id IS NULL
      AND source_jd_fetched_at IS NULL
    )
    OR
    (
      source = 'john_deere'
      AND cropx_field_uuid IS NULL
      AND source_file_name IS NULL
      AND source_file_sha256 IS NULL
      AND source_feature_name IS NULL
      AND source_jd_org_id IS NOT NULL
      AND source_jd_org_id = btrim(source_jd_org_id)
      AND char_length(source_jd_org_id) BETWEEN 1 AND 64
      AND source_jd_org_id ~ '^[A-Za-z0-9._:-]+$'
      AND source_jd_field_id IS NOT NULL
      AND source_jd_field_id = btrim(source_jd_field_id)
      AND char_length(source_jd_field_id) BETWEEN 1 AND 64
      AND source_jd_field_id ~ '^[A-Za-z0-9._:-]+$'
      AND source_jd_boundary_id IS NOT NULL
      AND source_jd_boundary_id = btrim(source_jd_boundary_id)
      AND char_length(source_jd_boundary_id) BETWEEN 1 AND 64
      AND source_jd_boundary_id ~ '^[A-Za-z0-9._:-]+$'
      AND source_jd_fetched_at IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT field_boundaries_lineage_check ON public.field_boundaries IS
  'CropX keeps a uuid. File keeps shapefile lineage. John Deere keeps org, field, boundary, and fetched_at. Edited may keep any of those or be a hand-drawn boundary with none.';
COMMENT ON COLUMN public.field_boundaries.source_jd_org_id IS 'John Deere Operations Center organization id. Null for CropX and file. Kept when the boundary is later edited.';
COMMENT ON COLUMN public.field_boundaries.source_jd_field_id IS 'John Deere field id. Null for CropX and file.';
COMMENT ON COLUMN public.field_boundaries.source_jd_boundary_id IS 'John Deere boundary id. Null for CropX and file.';
COMMENT ON COLUMN public.field_boundaries.source_jd_fetched_at IS 'When this John Deere boundary was fetched. Null for CropX and file.';
COMMENT ON TABLE public.field_boundaries IS 'One current boundary for public.fields.id. CropX rows keep a uuid. File rows keep shapefile lineage. John Deere rows keep Operations Center org, field, boundary, and fetched_at. Apply skips unchanged rows and never overwrites an edited boundary.';
