-- Allow hand-drawn boundaries with no CropX uuid and no shapefile lineage.
-- source='edited' already requires edited_at; this only relaxes provenance.

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
        OR
        (
          cropx_field_uuid IS NULL
          AND source_file_name IS NULL
          AND source_file_sha256 IS NULL
          AND source_feature_name IS NULL
        )
      )
    )
  );

COMMENT ON CONSTRAINT field_boundaries_lineage_check ON public.field_boundaries IS
  'CropX keeps a uuid. File keeps shapefile lineage. Edited may keep either lineage or be a hand-drawn boundary with none.';
