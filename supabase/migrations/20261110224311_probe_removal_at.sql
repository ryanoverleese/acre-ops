-- Not applied to production by this commit.
-- Ryan applies this file before the app that reads removal_at ships.
--
-- probe_assignments.removal_date is a date. Changing it to timestamptz would
-- rewrite every existing pull to midnight. This adds a nullable removal_at
-- and does not modify existing rows. Old pulls stay date-only (removal_at NULL).
-- New pulls still fill removal_date so current readers, this view, the
-- pulled-today count, and the CropX deactivate payload keep working.
--
-- The calculated view lists columns explicitly. pa.* would insert removal_at
-- before record_name, and CREATE OR REPLACE cannot reorder columns, so the
-- new column is appended.

BEGIN;

ALTER TABLE public.probe_assignments
  ADD COLUMN removal_at timestamptz;

COMMENT ON COLUMN public.probe_assignments.removal_at IS
  'Instant the probe was pulled, when known. NULL on historical rows that only have removal_date. New removals set both. Display removal_at in America/Chicago; when NULL, show removal_date with no time.';

COMMENT ON COLUMN public.probe_assignments.removal_date IS
  'Calendar date of the pull. Kept for existing readers, the pulled-today count, and the CropX deactivate payload. Historical rows have no removal_at and must not be shown with a fabricated time.';

CREATE OR REPLACE VIEW public.probe_assignments_calculated
WITH (security_invoker = true) AS
SELECT pa.id,
       pa.baserow_id,
       pa.field_season_id,
       pa.probe_id,
       pa.probe_number,
       pa.placement_order,
       pa.route_order,
       pa.ready_to_install,
       pa.crop_confirmed,
       pa.planned_remover,
       pa.label,
       pa.antenna_type_id,
       pa.battery_type_id,
       pa.placement_lat,
       pa.placement_lng,
       pa.elevation,
       pa.soil_type,
       pa.placement_notes,
       pa.probe_status_id,
       pa.installer,
       pa.install_date,
       pa.removal_date,
       pa.removal_notes,
       pa.removed_by,
       pa.removal_photo,
       pa.install_lat,
       pa.install_lng,
       pa.install_photo_field_end,
       pa.install_photo_extra,
       pa.install_notes,
       pa.grower_notified,
       pa.pickup_access,
       pa.cropx_telemetry_id,
       pa.signal_strength,
       pa.approval_status_id,
       pa.approval_notes,
       pa.approval_date,
       pa.approval_sent,
       CASE
           WHEN fs.id IS NOT NULL AND f.id IS NOT NULL AND p.id IS NOT NULL
               THEN concat(fs.season, ' - ', f.name, ' - ', p.serial_number)
           ELSE NULL::text
       END AS record_name,
       fs.season,
       fs.field_id,
       f.name AS field_name,
       f.name AS "Field",
       p.serial_number AS probe_serial_number,
       status.value AS probe_status,
       coalesce(pa.placement_lat, f.lat) AS effective_placement_lat,
       coalesce(pa.placement_lng, f.lng) AS effective_placement_lng,
       coalesce(pa.elevation, f.elevation) AS effective_elevation,
       coalesce(nullif(pa.soil_type, ''), f.soil_type) AS effective_soil_type,
       pa.removal_at
FROM public.probe_assignments AS pa
LEFT JOIN public.field_seasons AS fs ON fs.id = pa.field_season_id
LEFT JOIN public.fields AS f ON f.id = fs.field_id
LEFT JOIN public.probes AS p ON p.id = pa.probe_id
LEFT JOIN public.assignment_probe_status_options AS status ON status.id = pa.probe_status_id;

COMMENT ON COLUMN public.probe_assignments_calculated.removal_at IS
  'Same instant as probe_assignments.removal_at. NULL when the pull only has a date.';

-- Growers already see probe status. Append the pull date and instant so the
-- grower app can show a time without opening office tables.
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
       pa.removal_at
FROM public.probe_assignments AS pa
JOIN public.field_seasons AS fs ON fs.id = pa.field_season_id
JOIN public.fields AS f ON f.id = fs.field_id
LEFT JOIN public.probes AS p ON p.id = pa.probe_id
LEFT JOIN public.assignment_probe_status_options AS status ON status.id = pa.probe_status_id
WHERE public.grower_can_see_field(fs.field_id);

COMMENT ON VIEW public.grower_probe_assignments IS
  'Grower-visible probe placements for app.grower_operation_id. Includes serial, year_new, and removal_date/removal_at when a pull was recorded.';

COMMIT;
