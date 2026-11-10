-- Grower read lock. Additive. Does not change office tables or office grants.
-- Creates a weaker login role that can only SELECT grower_* views.
-- Those views include a row only when the signed-in farm reaches it through
-- field_billing_entities → contact_billing_entities → contact_operations.
-- fields.billing_entity_id is never used.
--
-- Password for acre_grower is NOT set here. Set it in the Supabase dashboard
-- (or ALTER ROLE) and put the connection string in DATABASE_URL_GROWER.
-- This migration is not applied to the live project by this commit.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acre_grower') THEN
    CREATE ROLE acre_grower NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS LOGIN;
  END IF;
END $$;

COMMENT ON ROLE acre_grower IS
  'Read-only grower app login. May SELECT only public.grower_* views. Scope with set_config(''app.grower_operation_id'', <id>, true) per request.';

-- So the owner (migrations / contract tests) can SET LOCAL ROLE acre_grower
-- for a transaction. Production connections log in as acre_grower directly.
DO $$
BEGIN
  GRANT acre_grower TO CURRENT_USER;
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;

-- Session farm id for the current grower request. Empty / unset → no rows.
-- SECURITY DEFINER so acre_grower can call it; it only reads a session setting.
CREATE OR REPLACE FUNCTION public.grower_operation_id()
RETURNS bigint
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(btrim(current_setting('app.grower_operation_id', true)), '')::bigint;
$$;

REVOKE ALL ON FUNCTION public.grower_operation_id() FROM PUBLIC, anon, authenticated, service_role, acre_grower;
GRANT EXECUTE ON FUNCTION public.grower_operation_id() TO acre_grower;

COMMENT ON FUNCTION public.grower_operation_id() IS
  'Returns the farm id set by set_config(''app.grower_operation_id'', …, true). Used only by grower_* views.';

-- True when the signed-in farm reaches this field through billing joins only.
-- SECURITY DEFINER: acre_grower has no SELECT on the join tables; the owner
-- reads them and returns only a boolean. search_path is pinned.
CREATE OR REPLACE FUNCTION public.grower_can_see_field(p_field_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.grower_operation_id() IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.field_billing_entities AS fbe
       JOIN public.contact_billing_entities AS cbe
         ON cbe.billing_entity_id = fbe.billing_entity_id
       JOIN public.contact_operations AS co
         ON co.contact_id = cbe.contact_id
       WHERE fbe.field_id = p_field_id
         AND co.operation_id = public.grower_operation_id()
     );
$$;

REVOKE ALL ON FUNCTION public.grower_can_see_field(bigint) FROM PUBLIC, anon, authenticated, service_role, acre_grower;
GRANT EXECUTE ON FUNCTION public.grower_can_see_field(bigint) TO acre_grower;

COMMENT ON FUNCTION public.grower_can_see_field(bigint) IS
  'Farm-scoped field check via field_billing_entities only. Ignores fields.billing_entity_id.';

CREATE OR REPLACE VIEW public.grower_fields
WITH (security_barrier = true) AS
SELECT f.id,
       f.name,
       f.acres,
       f.lat,
       f.lng,
       f.elevation,
       f.soil_type
FROM public.fields AS f
WHERE public.grower_can_see_field(f.id);

COMMENT ON VIEW public.grower_fields IS
  'Grower-visible fields for app.grower_operation_id. Billing join only.';

CREATE OR REPLACE VIEW public.grower_field_boundaries
WITH (security_barrier = true) AS
SELECT fb.field_id,
       fb.geometry,
       fb.crs,
       fb.axis_order,
       fb.source,
       fb.updated_at
FROM public.field_boundaries AS fb
WHERE public.grower_can_see_field(fb.field_id);

COMMENT ON VIEW public.grower_field_boundaries IS
  'Grower-visible field outlines for app.grower_operation_id.';

CREATE OR REPLACE VIEW public.grower_field_seasons
WITH (security_barrier = true) AS
SELECT fs.id,
       fs.field_id,
       fs.season,
       fs.field_note
FROM public.field_seasons AS fs
WHERE public.grower_can_see_field(fs.field_id);

COMMENT ON VIEW public.grower_field_seasons IS
  'Grower-visible field seasons for app.grower_operation_id.';

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
       coalesce(nullif(pa.soil_type, ''), f.soil_type) AS soil_type
FROM public.probe_assignments AS pa
JOIN public.field_seasons AS fs ON fs.id = pa.field_season_id
JOIN public.fields AS f ON f.id = fs.field_id
LEFT JOIN public.probes AS p ON p.id = pa.probe_id
LEFT JOIN public.assignment_probe_status_options AS status ON status.id = pa.probe_status_id
WHERE public.grower_can_see_field(fs.field_id);

COMMENT ON VIEW public.grower_probe_assignments IS
  'Grower-visible probe placements for app.grower_operation_id. Includes serial and year_new.';

CREATE OR REPLACE VIEW public.grower_water_recs
WITH (security_barrier = true) AS
SELECT wr.id,
       wr.field_season_id,
       fs.field_id,
       fs.season,
       wr.date,
       wr.recommendation,
       wr.suggested_water_day,
       wr.report_type,
       wr.priority
FROM public.water_recs AS wr
JOIN public.field_seasons AS fs ON fs.id = wr.field_season_id
WHERE public.grower_can_see_field(fs.field_id);

COMMENT ON VIEW public.grower_water_recs IS
  'Grower-visible water recommendations for app.grower_operation_id. App filters report_type.';

REVOKE ALL ON TABLE
  public.grower_fields,
  public.grower_field_boundaries,
  public.grower_field_seasons,
  public.grower_probe_assignments,
  public.grower_water_recs
FROM PUBLIC, anon, authenticated, service_role, acre_grower;

GRANT SELECT ON
  public.grower_fields,
  public.grower_field_boundaries,
  public.grower_field_seasons,
  public.grower_probe_assignments,
  public.grower_water_recs
TO acre_grower;

GRANT USAGE ON SCHEMA public TO acre_grower;

-- Fail closed on base tables and office views: no acre_grower access.
REVOKE ALL ON TABLE
  public.fields,
  public.field_boundaries,
  public.field_seasons,
  public.probe_assignments,
  public.probes,
  public.water_recs,
  public.operations,
  public.contacts,
  public.billing_entities,
  public.field_billing_entities,
  public.contact_billing_entities,
  public.contact_operations,
  public.contact_customer_types,
  public.users,
  public.installers,
  public.invoices,
  public.invoice_lines,
  public.probe_assignments_calculated,
  public.field_seasons_calculated,
  public.water_recs_calculated
FROM acre_grower;

COMMIT;
