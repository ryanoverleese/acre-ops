-- Acre Ops: initial, inventory-backed PostgreSQL schema (PostgreSQL 15+).
-- Source: lib/baserow.ts at 6bb77d8f426a24fcc7e4f360864643df259ef2fa.
-- Source of field types/formulas: supabase/baserow-inventory.md (2026-10-12).
-- Additional evidence: lib/data-mappings.ts; app/orders/page.tsx;
-- app/billing/page.tsx; app/api/{field-seasons,mileage,probe-rack/sync}/route.ts;
-- app/settings/SettingsClient.tsx; app/installer/InstallerApp.tsx.
--
-- DRAFT ONLY: this file was authored and statically checked without connecting
-- to Baserow, Supabase, or any database, and without executing this migration.
-- The inventory supplies source fields missing from the TypeScript contracts.
-- These 22 tables cover TABLE_IDS, not the inventory's unused journal table.
-- Reconcile option IDs and source rows with an OFFLINE export before import.
-- No select option IDs/values are invented or seeded here.
--
-- Import contract:
-- * Each of the 22 TABLE_IDS entries has a same-named table. Its bigint identity
--   is a NEW ID. baserow_id is the unique old row ID, scoped to that source table.
--   It stays nullable for records created after the migration.
-- * Dropdowns are separate editable, field-scoped lookup tables, never enums.
--   Their baserow_id is the old OPTION ID, not a row ID. Import options first,
--   preserving labels, colors and order; identical labels in different fields
--   must not be merged. Labels are unique WITHIN each options table; reconcile
--   any duplicate source labels before import. No guessed seeds are included.
--   Exception requested for water_recs.report_type: keep the option label as
--   text rather than adding another lookup table.
-- * Map every old link ID through the TARGET table's baserow_id; never copy an
--   old link ID into a new FK. Import base rows, then resolve FKs and junctions.
-- * Baserow link arrays used as one parent in the checked-in app become nullable
--   FKs (field, field_season, probe, invoice, product, order_link, and the scalar
--   billing/notification/rack links). Reject and review any source array with
--   more than one element before import; NEVER silently take its first item.
-- * The seven junction tables preserve multi-links / multiple_select values,
--   including contact operations/billing, probe contacts/ownership/billing, and
--   field-season services. position preserves source link order (zero-based).
--   Junctions have no baserow_id: Baserow does not expose an ID for each edge;
--   their endpoint crosswalks and composite primary key identify each edge.
-- * Normalize empty date/numeric strings to NULL. Decimal strings become
--   numeric values; legacy elevation/soil_type select wrappers use their value,
--   not their option ID. Reject nonnumeric elevation instead of discarding it.
--   Keep IDs/serials, notes and contact details as text where defined as text.
-- * Import source autonumbers separately from row IDs: water_recs.record_name,
--   orders.order_id and order_items.item_id have their own BY DEFAULT identity.
--   Preserve their exported values, then advance EVERY identity sequence past
--   its imported maximum before enabling writes. Do not substitute row IDs.
-- * Planned installer/remover are separate Baserow dropdowns, NOT links to the
--   installers table. Historical installer/removed_by/uploaded_by strings are
--   also not authenticated-user or installer IDs.
-- * field_seasons.notes is a legacy alias for field_note, not another source
--   column. Reconcile conflicting alias values; import into field_note only.
-- * File/photo JSON stores arrays of {bucket, path, name, size, mime} pointing
--   to Supabase Storage. size is a nonnegative integer byte count. Upload the
--   actual files through the Storage API first; never import expiring Baserow
--   URLs or write directly to storage.objects. [] means no attachments.
-- * Non-null probe serials are unique, as verified in the inventory. Normalize
--   missing serials to NULL before import; multiple NULL serials are allowed.
--   No uniqueness is guessed for field+season, probe positions, or rack+slot.
--   In particular, racks 7-13 legitimately have duplicate labels
--   (app/api/probe-rack/sync/route.ts); those labels remain nonunique.
--
-- Security:
-- * Enable RLS on ALL base, lookup and junction tables. There are deliberately
--   NO policies or client grants until the office/installer/grower auth model
--   is designed. Normal client roles therefore have no access by default.
-- * Views use security_invoker=true so later grants cannot bypass table RLS.
--   See https://supabase.com/docs/guides/database/postgres/row-level-security
-- * Revoke Supabase's possible default anon/authenticated grants only on the
--   objects created here. Do not change existing schema-wide default privileges.
-- * public.users mirrors legacy Baserow credentials; it is NOT auth.users.
--   Installer PINs and approval tokens remain private. Migrate credential/PIN
--   handling before enabling any client access; never expose these wholesale.
-- * History-bearing FKs use RESTRICT. CASCADE only removes junction edges.
--
-- Calculated values are read-only views below, not copied totals. Writable
-- invoices.amount and invoices.actual_billed_amount remain independent inputs.
-- This is a schema foundation, not an app cutover or a data-import script.

BEGIN;

-- Validate durable Storage references without connecting to Storage or creating
-- buckets. No signed URLs, raw Baserow metadata, or extra object keys are kept.
-- This pure helper is not SECURITY DEFINER and does not read any table.
CREATE FUNCTION public.storage_file_refs_valid(files jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
    SELECT CASE
        WHEN jsonb_typeof(files) IS DISTINCT FROM 'array' THEN false
        ELSE NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(files) AS entry(item)
            WHERE (CASE WHEN jsonb_typeof(item) = 'object' THEN
                item ?& ARRAY['bucket', 'path', 'name', 'size', 'mime']
                AND item - ARRAY['bucket', 'path', 'name', 'size', 'mime'] = '{}'::jsonb
                AND jsonb_typeof(item -> 'bucket') = 'string'
                AND length(item ->> 'bucket') > 0
                AND jsonb_typeof(item -> 'path') = 'string'
                AND length(item ->> 'path') > 0
                AND jsonb_typeof(item -> 'name') = 'string'
                AND length(item ->> 'name') > 0
                AND jsonb_typeof(item -> 'mime') = 'string'
                AND length(item ->> 'mime') > 0
                AND CASE WHEN jsonb_typeof(item -> 'size') = 'number'
                    THEN (item ->> 'size')::numeric >= 0
                         AND trunc((item ->> 'size')::numeric) = (item ->> 'size')::numeric
                    ELSE false
                END
            ELSE false END) IS NOT TRUE
        )
    END;
$$;
REVOKE ALL PRIVILEGES ON FUNCTION public.storage_file_refs_valid(jsonb) FROM PUBLIC, anon, authenticated;

-- 1. Editable dropdown catalogs. Each catalog represents ONE Baserow field.
CREATE TABLE public.contact_customer_type_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.contact_customer_type_options IS 'Editable options for contacts.customer_type (multiple_select); baserow_id is the source option ID.';

CREATE TABLE public.contact_main_contact_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.contact_main_contact_options IS 'Editable options for contacts.is_main_contact; baserow_id is the source option ID.';

CREATE TABLE public.field_water_source_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_water_source_options IS 'Editable options for fields.water_source; baserow_id is the source option ID.';

CREATE TABLE public.field_fuel_source_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_fuel_source_options IS 'Editable options for fields.fuel_source; baserow_id is the source option ID.';

CREATE TABLE public.field_irrigation_type_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_irrigation_type_options IS 'Editable options for fields.irrigation_type; baserow_id is the source option ID.';

CREATE TABLE public.field_row_direction_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_row_direction_options IS 'Editable options for fields.row_direction; baserow_id is the source option ID.';

CREATE TABLE public.field_drip_tubing_direction_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_drip_tubing_direction_options IS 'Editable options for fields.drip_tubing_direction; baserow_id is the source option ID.';

CREATE TABLE public.probe_brand_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.probe_brand_options IS 'Editable options for probes.brand; baserow_id is the source option ID.';

CREATE TABLE public.probe_status_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.probe_status_options IS 'Editable options for probes.status; baserow_id is the source option ID.';

CREATE TABLE public.probe_rack_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.probe_rack_options IS 'Editable options for probes.rack; baserow_id is the source option ID.';

CREATE TABLE public.probe_trade_year_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.probe_trade_year_options IS 'Editable options for probes.trade_year; baserow_id is the source option ID.';

CREATE TABLE public.field_season_crop_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_crop_options IS 'Editable options for field_seasons.crop; baserow_id is the source option ID.';

CREATE TABLE public.field_season_side_dress_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_side_dress_options IS 'Editable options for field_seasons.side_dress; baserow_id is the source option ID.';

CREATE TABLE public.field_season_early_removal_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_early_removal_options IS 'Editable options for field_seasons.early_removal; baserow_id is the source option ID.';

CREATE TABLE public.field_season_early_install_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_early_install_options IS 'Editable options for field_seasons.early_install; baserow_id is the source option ID.';

CREATE TABLE public.field_season_ready_to_remove_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_ready_to_remove_options IS 'Editable options for field_seasons.ready_to_remove; baserow_id is the source option ID.';

CREATE TABLE public.field_season_planned_installer_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_planned_installer_options IS 'Editable options for field_seasons.planned_installer; baserow_id is the source option ID.';

CREATE TABLE public.field_season_planned_remover_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_planned_remover_options IS 'Editable options for field_seasons.planned_remover; baserow_id is the source option ID.';

CREATE TABLE public.field_season_remover_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_remover_options IS 'Editable options for field_seasons.remover; separate from planned_remover and installer rows.';

CREATE TABLE public.field_season_removal_priority_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_removal_priority_options IS 'Editable options for field_seasons.removal_priority; baserow_id is the source option ID.';

CREATE TABLE public.field_season_approval_status_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.field_season_approval_status_options IS 'Editable options for field_seasons.approval_status; baserow_id is the source option ID.';

CREATE TABLE public.assignment_antenna_type_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.assignment_antenna_type_options IS 'Editable options for probe_assignments.antenna_type; baserow_id is the source option ID.';

CREATE TABLE public.assignment_battery_type_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.assignment_battery_type_options IS 'Editable options for probe_assignments.battery_type; baserow_id is the source option ID.';

CREATE TABLE public.assignment_probe_status_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.assignment_probe_status_options IS 'Editable options for probe_assignments.probe_status; baserow_id is the source option ID.';

CREATE TABLE public.assignment_approval_status_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.assignment_approval_status_options IS 'Editable options for probe_assignments.approval_status; baserow_id is the source option ID.';

CREATE TABLE public.invoice_status_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.invoice_status_options IS 'Editable options for invoices.status; baserow_id is the source option ID.';

CREATE TABLE public.product_category_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.product_category_options IS 'Editable options for products_services.category; baserow_id is the source option ID.';

CREATE TABLE public.product_unit_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.product_unit_options IS 'Editable options for products_services.unit; baserow_id is the source option ID.';

CREATE TABLE public.product_status_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.product_status_options IS 'Editable options for products_services.status; baserow_id is the source option ID.';

CREATE TABLE public.inventory_category_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.inventory_category_options IS 'Editable options for inventory.category; baserow_id is the source option ID.';

CREATE TABLE public.user_role_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.user_role_options IS 'Editable options for users.role; baserow_id is the source option ID.';

CREATE TABLE public.weather_station_connectivity_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.weather_station_connectivity_options IS 'Editable options for weather_stations.connectivity_type; baserow_id is the source option ID.';

CREATE TABLE public.weather_station_status_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.weather_station_status_options IS 'Editable options for weather_stations.status; baserow_id is the source option ID.';

CREATE TABLE public.order_status_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.order_status_options IS 'Editable options for orders.status; baserow_id is the source option ID.';

CREATE TABLE public.notification_page_type_options (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    value text NOT NULL UNIQUE,
    color text,
    sort_order integer NOT NULL DEFAULT 0,
    active boolean NOT NULL DEFAULT true
);
COMMENT ON TABLE public.notification_page_type_options IS 'Editable options for notifications.page_type; baserow_id is the source option ID.';


-- 2. One base table per TABLE_IDS entry.

-- Baserow TABLE_IDS.operations = 817295.
CREATE TABLE public.operations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    name text NOT NULL,
    notes text,
    approval_token text
);
COMMENT ON TABLE public.operations IS 'Baserow operations (table 817295); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.billing_entities = 817297.
CREATE TABLE public.billing_entities (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    name text NOT NULL,
    notes text,
    address text,
    self_install boolean
);
COMMENT ON TABLE public.billing_entities IS 'Baserow billing_entities (table 817297); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.contacts = 817294.
CREATE TABLE public.contacts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    name text NOT NULL,
    email text,
    phone text,
    address text,
    address_lat numeric(10,7) CHECK (address_lat BETWEEN -90 AND 90),
    address_lng numeric(10,7) CHECK (address_lng BETWEEN -180 AND 180),
    notes text,
    cropx_username text,
    date_entered timestamptz,
    soil_temp_updates boolean,
    android boolean,
    is_main_contact_id bigint REFERENCES public.contact_main_contact_options(id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.contacts IS 'Baserow contacts (table 817294); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.products_services = 826849.
CREATE TABLE public.products_services (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    name text,
    service_type text,
    rate numeric(14,2),
    dealer_fee numeric(14,2),
    description text,
    category_id bigint REFERENCES public.product_category_options(id) ON DELETE RESTRICT,
    unit_id bigint REFERENCES public.product_unit_options(id) ON DELETE RESTRICT,
    active boolean,
    status_id bigint REFERENCES public.product_status_options(id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.products_services IS 'Baserow products_services (table 826849); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.fields = 817298.
CREATE TABLE public.fields (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    name text NOT NULL,
    billing_entity_id bigint REFERENCES public.billing_entities(id) ON DELETE RESTRICT,
    acres numeric(14,4),
    pivot_acres numeric(14,4),
    lat numeric(10,7) CHECK (lat BETWEEN -90 AND 90),
    lng numeric(10,7) CHECK (lng BETWEEN -180 AND 180),
    water_source_id bigint REFERENCES public.field_water_source_options(id) ON DELETE RESTRICT,
    fuel_source_id bigint REFERENCES public.field_fuel_source_options(id) ON DELETE RESTRICT,
    notes text,
    elevation numeric,
    soil_type text,
    placement_notes text,
    irrigation_type_id bigint REFERENCES public.field_irrigation_type_options(id) ON DELETE RESTRICT,
    row_direction_id bigint REFERENCES public.field_row_direction_options(id) ON DELETE RESTRICT,
    drip_tubing_direction_id bigint REFERENCES public.field_drip_tubing_direction_options(id) ON DELETE RESTRICT,
    drip_tubing_spacing numeric,
    drip_emitter_spacing numeric,
    drip_zones integer,
    drip_gpm numeric,
    drip_depth numeric,
    field_directions text,
    install_directions text,
    nrcs_field boolean,
    cropx_field_uuid text,
    plss_township integer,
    plss_range integer,
    plss_section integer,
    plss_description text
);
COMMENT ON TABLE public.fields IS 'Baserow fields (table 817298); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.probes = 817299.
CREATE TABLE public.probes (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    serial_number text,
    brand_id bigint REFERENCES public.probe_brand_options(id) ON DELETE RESTRICT,
    year_new integer,
    status_id bigint REFERENCES public.probe_status_options(id) ON DELETE RESTRICT,
    rack_id bigint REFERENCES public.probe_rack_options(id) ON DELETE RESTRICT,
    rack_slot integer,
    notes text,
    damages_repairs text,
    date_created date,
    trade_year_id bigint REFERENCES public.probe_trade_year_options(id) ON DELETE RESTRICT,
    is_trade boolean,
    solo boolean
);
COMMENT ON TABLE public.probes IS 'Baserow probes (table 817299); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.field_seasons = 817300.
CREATE TABLE public.field_seasons (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    field_id bigint REFERENCES public.fields(id) ON DELETE RESTRICT,
    season integer,
    crop_id bigint REFERENCES public.field_season_crop_options(id) ON DELETE RESTRICT,
    crop_confirmed boolean,
    side_dress_id bigint REFERENCES public.field_season_side_dress_options(id) ON DELETE RESTRICT,
    logger_id text,
    early_removal_id bigint REFERENCES public.field_season_early_removal_options(id) ON DELETE RESTRICT,
    early_install_id bigint REFERENCES public.field_season_early_install_options(id) ON DELETE RESTRICT,
    hybrid_variety text,
    ready_to_remove_id bigint REFERENCES public.field_season_ready_to_remove_options(id) ON DELETE RESTRICT,
    planting_date date,
    route_order text,
    planned_installer_id bigint REFERENCES public.field_season_planned_installer_options(id) ON DELETE RESTRICT,
    planned_remover_id bigint REFERENCES public.field_season_planned_remover_options(id) ON DELETE RESTRICT,
    remover_id bigint REFERENCES public.field_season_remover_options(id) ON DELETE RESTRICT,
    irrigator text,
    removal_priority_id bigint REFERENCES public.field_season_removal_priority_options(id) ON DELETE RESTRICT,
    ready_to_install boolean,
    install_group integer,
    removal_date date,
    removal_notes text,
    approval_status_id bigint REFERENCES public.field_season_approval_status_options(id) ON DELETE RESTRICT,
    approval_notes text,
    approval_date timestamptz,
    approval_sent date,
    field_note text
);
COMMENT ON TABLE public.field_seasons IS 'Baserow field_seasons (table 817300); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.probe_assignments = 819350.
CREATE TABLE public.probe_assignments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    field_season_id bigint REFERENCES public.field_seasons(id) ON DELETE RESTRICT,
    probe_id bigint REFERENCES public.probes(id) ON DELETE RESTRICT,
    probe_number integer,
    placement_order integer,
    route_order integer,
    ready_to_install boolean,
    crop_confirmed boolean,
    planned_remover text,
    label text,
    antenna_type_id bigint REFERENCES public.assignment_antenna_type_options(id) ON DELETE RESTRICT,
    battery_type_id bigint REFERENCES public.assignment_battery_type_options(id) ON DELETE RESTRICT,
    placement_lat numeric(10,7) CHECK (placement_lat BETWEEN -90 AND 90),
    placement_lng numeric(10,7) CHECK (placement_lng BETWEEN -180 AND 180),
    elevation numeric,
    soil_type text,
    placement_notes text,
    probe_status_id bigint REFERENCES public.assignment_probe_status_options(id) ON DELETE RESTRICT,
    installer text,
    install_date timestamptz,
    removal_date date,
    removal_notes text,
    removed_by text,
    removal_photo jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.storage_file_refs_valid(removal_photo)),
    install_lat numeric(10,7) CHECK (install_lat BETWEEN -90 AND 90),
    install_lng numeric(10,7) CHECK (install_lng BETWEEN -180 AND 180),
    install_photo_field_end jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.storage_file_refs_valid(install_photo_field_end)),
    install_photo_extra jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.storage_file_refs_valid(install_photo_extra)),
    install_notes text,
    grower_notified date,
    pickup_access text,
    cropx_telemetry_id text,
    signal_strength text,
    approval_status_id bigint REFERENCES public.assignment_approval_status_options(id) ON DELETE RESTRICT,
    approval_notes text,
    approval_date date,
    approval_sent date
);
COMMENT ON TABLE public.probe_assignments IS 'Baserow probe_assignments (table 819350); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.repairs = 817301.
CREATE TABLE public.repairs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    record_name text,
    field_season_id bigint REFERENCES public.field_seasons(id) ON DELETE RESTRICT,
    probe_assignment_id bigint REFERENCES public.probe_assignments(id) ON DELETE RESTRICT,
    reported_at date,
    problem text,
    fix text,
    repaired_at date,
    notified_customer boolean,
    probe_replaced boolean,
    new_probe_serial text,
    watch_list boolean
);
COMMENT ON TABLE public.repairs IS 'Baserow repairs (table 817301); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.water_recs = 817302.
CREATE TABLE public.water_recs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    record_name bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE,
    field_season_id bigint REFERENCES public.field_seasons(id) ON DELETE RESTRICT,
    date date,
    recommendation text,
    suggested_water_day text,
    report_type text,
    priority boolean
);
COMMENT ON TABLE public.water_recs IS 'Baserow water_recs (table 817302); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.invoices = 817303.
CREATE TABLE public.invoices (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    record_name text,
    billing_entity_id bigint REFERENCES public.billing_entities(id) ON DELETE RESTRICT,
    season integer,
    amount numeric(14,2),
    status_id bigint REFERENCES public.invoice_status_options(id) ON DELETE RESTRICT,
    sent_at date,
    deposit_at date,
    paid_at date,
    notes text,
    check_number bigint,
    actual_billed_amount numeric(14,2),
    invoice_number bigint,
    matched_in_qb boolean
);
COMMENT ON TABLE public.invoices IS 'Baserow invoices (table 817303); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.invoice_lines = 817304.
CREATE TABLE public.invoice_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    record_name text,
    invoice_id bigint REFERENCES public.invoices(id) ON DELETE RESTRICT,
    field_season_id bigint REFERENCES public.field_seasons(id) ON DELETE RESTRICT,
    service_type text,
    rate numeric(14,2),
    quantity numeric(14,4)
);
COMMENT ON TABLE public.invoice_lines IS 'Baserow invoice_lines (table 817304); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.inventory = 827222.
CREATE TABLE public.inventory (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    item_name text,
    category_id bigint REFERENCES public.inventory_category_options(id) ON DELETE RESTRICT,
    quantity numeric(14,4)
);
COMMENT ON TABLE public.inventory IS 'Baserow inventory (table 827222); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.users = 828606.
CREATE TABLE public.users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    email text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    role_id bigint NOT NULL REFERENCES public.user_role_options(id) ON DELETE RESTRICT,
    active boolean NOT NULL,
    created_at timestamptz,
    last_login timestamptz
);
COMMENT ON TABLE public.users IS 'Baserow users (table 828606); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.weather_stations = 831050.
CREATE TABLE public.weather_stations (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    station_name text,
    model text,
    billing_entity_id bigint REFERENCES public.billing_entities(id) ON DELETE RESTRICT,
    install_lat numeric(10,7) CHECK (install_lat BETWEEN -90 AND 90),
    install_lng numeric(10,7) CHECK (install_lng BETWEEN -180 AND 180),
    install_date date,
    connectivity_type_id bigint REFERENCES public.weather_station_connectivity_options(id) ON DELETE RESTRICT,
    status_id bigint REFERENCES public.weather_station_status_options(id) ON DELETE RESTRICT,
    price_paid numeric(14,2),
    notes text
);
COMMENT ON TABLE public.weather_stations IS 'Baserow weather_stations (table 831050); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.orders = 831072.
CREATE TABLE public.orders (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    order_id bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE,
    billing_entity_id bigint REFERENCES public.billing_entities(id) ON DELETE RESTRICT,
    order_date date,
    tracking_number text,
    valid_until date,
    status_id bigint REFERENCES public.order_status_options(id) ON DELETE RESTRICT,
    notes text,
    quote_valid_days integer
);
COMMENT ON TABLE public.orders IS 'Baserow orders (table 831072); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.order_items = 831073.
CREATE TABLE public.order_items (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    item_id bigint GENERATED BY DEFAULT AS IDENTITY UNIQUE,
    order_link_id bigint REFERENCES public.orders(id) ON DELETE RESTRICT,
    product_id bigint REFERENCES public.products_services(id) ON DELETE RESTRICT,
    quantity numeric(14,4),
    unit_price numeric(14,2),
    notes text
);
COMMENT ON TABLE public.order_items IS 'Baserow order_items (table 831073); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.notifications = 854433.
CREATE TABLE public.notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    operation_id bigint REFERENCES public.operations(id) ON DELETE RESTRICT,
    field_name text,
    changed_field bigint REFERENCES public.fields(id) ON DELETE RESTRICT,
    new_value text,
    page_type_id bigint REFERENCES public.notification_page_type_options(id) ON DELETE RESTRICT,
    read boolean,
    created_on timestamptz
);
COMMENT ON TABLE public.notifications IS 'Baserow notifications (table 854433); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.documents = 861653.
CREATE TABLE public.documents (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    name text,
    file jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (public.storage_file_refs_valid(file)),
    description text,
    uploaded_by text,
    uploaded_at timestamptz
);
COMMENT ON TABLE public.documents IS 'Baserow documents (table 861653); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.probe_rack = 934076.
CREATE TABLE public.probe_rack (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    rack text NOT NULL,
    rack_slot integer NOT NULL,
    probe_id bigint REFERENCES public.probes(id) ON DELETE RESTRICT
);
COMMENT ON TABLE public.probe_rack IS 'Baserow probe_rack (table 934076); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.installers = 939826.
CREATE TABLE public.installers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    name text,
    pin text
);
COMMENT ON TABLE public.installers IS 'Baserow installers (table 939826); baserow_id preserves the source row ID.';

-- Baserow TABLE_IDS.mileage_logs = 982999.
CREATE TABLE public.mileage_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    baserow_id bigint UNIQUE CHECK (baserow_id > 0),
    installer text,
    date date,
    start_miles numeric(14,1),
    end_miles numeric(14,1),
    notes text
);
COMMENT ON TABLE public.mileage_logs IS 'Baserow mileage_logs (table 982999); baserow_id preserves the source row ID.';

COMMENT ON COLUMN public.probes.rack_id IS 'Editable probes.rack dropdown; not a probe_rack row ID. Both source representations remain available for reconciliation.';
COMMENT ON COLUMN public.probe_rack.rack IS 'Source text label; rack+rack_slot is deliberately not unique because several source rows can share a physical slot label.';
COMMENT ON COLUMN public.field_seasons.planned_installer_id IS 'Option from field_seasons.planned_installer, not an installers row ID.';
COMMENT ON COLUMN public.field_seasons.planned_remover_id IS 'Option from field_seasons.planned_remover, not an installers row ID.';
COMMENT ON COLUMN public.field_seasons.remover_id IS 'Source remover dropdown; deliberately separate from planned_remover.';
COMMENT ON COLUMN public.probe_assignments.planned_remover IS 'Source free text, unlike the separate field_seasons.planned_remover dropdown.';
COMMENT ON COLUMN public.probes.solo IS 'Source boolean named Solo?; normalized to solo.';
COMMENT ON COLUMN public.billing_entities.address IS 'Source long-text column named Address; normalized to address.';
COMMENT ON COLUMN public.notifications.changed_field IS 'Actual inventory link to fields, not the text property name inferred by the old TypeScript interface.';
COMMENT ON COLUMN public.water_recs.report_type IS 'Source option label stored as text by request; preserve full_report/full, water_day_update/update, overview and farm_insight until normalization is explicitly approved.';
COMMENT ON COLUMN public.water_recs.record_name IS 'Source autonumber; preserve its exported value independently of baserow_id.';
COMMENT ON COLUMN public.orders.order_id IS 'Source order autonumber; separate from both id and baserow_id.';
COMMENT ON COLUMN public.probe_assignments.removal_photo IS 'Supabase Storage references: [{bucket, path, name, size, mime}]; size in bytes; no expiring URLs.';
COMMENT ON COLUMN public.probe_assignments.install_photo_field_end IS 'Supabase Storage references: [{bucket, path, name, size, mime}]; size in bytes; no expiring URLs.';
COMMENT ON COLUMN public.probe_assignments.install_photo_extra IS 'Supabase Storage references: [{bucket, path, name, size, mime}]; size in bytes; no expiring URLs.';
COMMENT ON COLUMN public.documents.file IS 'Supabase Storage references: [{bucket, path, name, size, mime}]; size in bytes; no expiring URLs.';
COMMENT ON COLUMN public.field_seasons.field_note IS 'Canonical source field. FieldSeason.notes in TypeScript is only a legacy alias.';
COMMENT ON COLUMN public.invoices.amount IS 'Manually writable source amount, including invoice-only charges; do not replace it with a generated column.';
COMMENT ON COLUMN public.invoices.actual_billed_amount IS 'Manually entered billed amount; NULL means not entered, not zero.';
COMMENT ON COLUMN public.order_items.item_id IS 'Source item_id, distinct from the Baserow row ID stored in baserow_id.';
COMMENT ON COLUMN public.users.password_hash IS 'Private legacy bcrypt hash. Not a Supabase Auth account; never include in public views.';
COMMENT ON COLUMN public.installers.pin IS 'Private legacy PIN; preserved for an explicit credential migration, not safe for client reads.';
COMMENT ON COLUMN public.probe_assignments.install_date IS 'Preserves the full ISO installation timestamp written by app/api/install/route.ts.';
COMMENT ON COLUMN public.mileage_logs.installer IS 'Historical installer name as written by app/api/mileage/route.ts; not a Baserow link.';

-- 3. Multi-link and multiple-select junctions.

CREATE TABLE public.contact_operations (
    contact_id bigint NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    operation_id bigint NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (contact_id, operation_id)
);
COMMENT ON TABLE public.contact_operations IS 'Normalized contacts.operations; preserve source array order in position.';

CREATE TABLE public.contact_billing_entities (
    contact_id bigint NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    billing_entity_id bigint NOT NULL REFERENCES public.billing_entities(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (contact_id, billing_entity_id)
);
COMMENT ON TABLE public.contact_billing_entities IS 'Normalized contacts.billing_entity; preserve source array order in position.';

CREATE TABLE public.contact_customer_types (
    contact_id bigint NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    customer_type_id bigint NOT NULL REFERENCES public.contact_customer_type_options(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (contact_id, customer_type_id)
);
COMMENT ON TABLE public.contact_customer_types IS 'Normalized contacts.customer_type; preserve source array order in position.';

CREATE TABLE public.probe_contacts (
    probe_id bigint NOT NULL REFERENCES public.probes(id) ON DELETE CASCADE,
    contact_id bigint NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (probe_id, contact_id)
);
COMMENT ON TABLE public.probe_contacts IS 'Normalized probes.contact; preserve source array order in position.';

CREATE TABLE public.probe_billing_entities (
    probe_id bigint NOT NULL REFERENCES public.probes(id) ON DELETE CASCADE,
    billing_entity_id bigint NOT NULL REFERENCES public.billing_entities(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (probe_id, billing_entity_id)
);
COMMENT ON TABLE public.probe_billing_entities IS 'Normalized probes.billing_entity; preserve source array order in position.';

CREATE TABLE public.probe_owner_operations (
    probe_id bigint NOT NULL REFERENCES public.probes(id) ON DELETE CASCADE,
    operation_id bigint NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (probe_id, operation_id)
);
COMMENT ON TABLE public.probe_owner_operations IS 'Normalized probes.owner_operation; preserve source array order in position.';

CREATE TABLE public.field_season_services (
    field_season_id bigint NOT NULL REFERENCES public.field_seasons(id) ON DELETE CASCADE,
    product_service_id bigint NOT NULL REFERENCES public.products_services(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (field_season_id, product_service_id)
);
COMMENT ON TABLE public.field_season_services IS 'Normalized field_seasons.service_type (link_row, NOT a dropdown); preserve source array order in position.';


-- 4. FK and common access-path indexes.

CREATE INDEX contacts_is_main_contact_id_idx ON public.contacts (is_main_contact_id);
CREATE INDEX products_services_category_id_idx ON public.products_services (category_id);
CREATE INDEX products_services_unit_id_idx ON public.products_services (unit_id);
CREATE INDEX products_services_status_id_idx ON public.products_services (status_id);
CREATE INDEX fields_billing_entity_id_idx ON public.fields (billing_entity_id);
CREATE INDEX fields_water_source_id_idx ON public.fields (water_source_id);
CREATE INDEX fields_fuel_source_id_idx ON public.fields (fuel_source_id);
CREATE INDEX fields_irrigation_type_id_idx ON public.fields (irrigation_type_id);
CREATE INDEX fields_row_direction_id_idx ON public.fields (row_direction_id);
CREATE INDEX fields_drip_tubing_direction_id_idx ON public.fields (drip_tubing_direction_id);
CREATE INDEX probes_brand_id_idx ON public.probes (brand_id);
CREATE INDEX probes_status_id_idx ON public.probes (status_id);
CREATE INDEX probes_rack_id_idx ON public.probes (rack_id);
CREATE INDEX probes_trade_year_id_idx ON public.probes (trade_year_id);
CREATE INDEX field_seasons_field_id_idx ON public.field_seasons (field_id);
CREATE INDEX field_seasons_crop_id_idx ON public.field_seasons (crop_id);
CREATE INDEX field_seasons_side_dress_id_idx ON public.field_seasons (side_dress_id);
CREATE INDEX field_seasons_early_removal_id_idx ON public.field_seasons (early_removal_id);
CREATE INDEX field_seasons_early_install_id_idx ON public.field_seasons (early_install_id);
CREATE INDEX field_seasons_ready_to_remove_id_idx ON public.field_seasons (ready_to_remove_id);
CREATE INDEX field_seasons_planned_installer_id_idx ON public.field_seasons (planned_installer_id);
CREATE INDEX field_seasons_planned_remover_id_idx ON public.field_seasons (planned_remover_id);
CREATE INDEX field_seasons_remover_id_idx ON public.field_seasons (remover_id);
CREATE INDEX field_seasons_removal_priority_id_idx ON public.field_seasons (removal_priority_id);
CREATE INDEX field_seasons_approval_status_id_idx ON public.field_seasons (approval_status_id);
CREATE INDEX probe_assignments_field_season_id_idx ON public.probe_assignments (field_season_id);
CREATE INDEX probe_assignments_probe_id_idx ON public.probe_assignments (probe_id);
CREATE INDEX probe_assignments_antenna_type_id_idx ON public.probe_assignments (antenna_type_id);
CREATE INDEX probe_assignments_battery_type_id_idx ON public.probe_assignments (battery_type_id);
CREATE INDEX probe_assignments_probe_status_id_idx ON public.probe_assignments (probe_status_id);
CREATE INDEX probe_assignments_approval_status_id_idx ON public.probe_assignments (approval_status_id);
CREATE INDEX repairs_field_season_id_idx ON public.repairs (field_season_id);
CREATE INDEX repairs_probe_assignment_id_idx ON public.repairs (probe_assignment_id);
CREATE INDEX water_recs_field_season_id_idx ON public.water_recs (field_season_id);
CREATE INDEX invoices_billing_entity_id_idx ON public.invoices (billing_entity_id);
CREATE INDEX invoices_status_id_idx ON public.invoices (status_id);
CREATE INDEX invoice_lines_invoice_id_idx ON public.invoice_lines (invoice_id);
CREATE INDEX invoice_lines_field_season_id_idx ON public.invoice_lines (field_season_id);
CREATE INDEX inventory_category_id_idx ON public.inventory (category_id);
CREATE INDEX users_role_id_idx ON public.users (role_id);
CREATE INDEX weather_stations_billing_entity_id_idx ON public.weather_stations (billing_entity_id);
CREATE INDEX weather_stations_connectivity_type_id_idx ON public.weather_stations (connectivity_type_id);
CREATE INDEX weather_stations_status_id_idx ON public.weather_stations (status_id);
CREATE INDEX orders_billing_entity_id_idx ON public.orders (billing_entity_id);
CREATE INDEX orders_status_id_idx ON public.orders (status_id);
CREATE INDEX order_items_order_link_id_idx ON public.order_items (order_link_id);
CREATE INDEX order_items_product_id_idx ON public.order_items (product_id);
CREATE INDEX notifications_operation_id_idx ON public.notifications (operation_id);
CREATE INDEX notifications_changed_field_idx ON public.notifications (changed_field);
CREATE INDEX notifications_page_type_id_idx ON public.notifications (page_type_id);
CREATE INDEX probe_rack_probe_id_idx ON public.probe_rack (probe_id);
CREATE INDEX contact_operations_operation_id_idx ON public.contact_operations (operation_id);
CREATE INDEX contact_operations_position_idx ON public.contact_operations (contact_id, position);
CREATE INDEX contact_billing_entities_billing_entity_id_idx ON public.contact_billing_entities (billing_entity_id);
CREATE INDEX contact_billing_entities_position_idx ON public.contact_billing_entities (contact_id, position);
CREATE INDEX contact_customer_types_customer_type_id_idx ON public.contact_customer_types (customer_type_id);
CREATE INDEX contact_customer_types_position_idx ON public.contact_customer_types (contact_id, position);
CREATE INDEX probe_contacts_contact_id_idx ON public.probe_contacts (contact_id);
CREATE INDEX probe_contacts_position_idx ON public.probe_contacts (probe_id, position);
CREATE INDEX probe_billing_entities_billing_entity_id_idx ON public.probe_billing_entities (billing_entity_id);
CREATE INDEX probe_billing_entities_position_idx ON public.probe_billing_entities (probe_id, position);
CREATE INDEX probe_owner_operations_operation_id_idx ON public.probe_owner_operations (operation_id);
CREATE INDEX probe_owner_operations_position_idx ON public.probe_owner_operations (probe_id, position);
CREATE INDEX field_season_services_product_service_id_idx ON public.field_season_services (product_service_id);
CREATE INDEX field_season_services_position_idx ON public.field_season_services (field_season_id, position);
CREATE INDEX contacts_email_idx ON public.contacts (lower(email));
CREATE INDEX users_email_idx ON public.users (lower(email));
CREATE UNIQUE INDEX probes_serial_number_unique_idx ON public.probes (serial_number)
    WHERE serial_number IS NOT NULL;
CREATE INDEX probes_rack_slot_idx ON public.probes (rack_id, rack_slot);
CREATE INDEX field_seasons_season_idx ON public.field_seasons (season, field_id);
CREATE INDEX probe_assignments_position_idx ON public.probe_assignments (field_season_id, probe_number);
CREATE INDEX water_recs_history_idx ON public.water_recs (field_season_id, date DESC);
CREATE INDEX invoices_season_idx ON public.invoices (billing_entity_id, season);
CREATE INDEX probe_rack_label_idx ON public.probe_rack (rack, rack_slot);
CREATE INDEX mileage_logs_installer_date_idx ON public.mileage_logs (installer, date DESC);
CREATE INDEX notifications_unread_idx ON public.notifications (created_on DESC) WHERE read IS NOT TRUE;
CREATE INDEX documents_uploaded_at_idx ON public.documents (uploaded_at DESC);

-- 5. Calculations and relationship lookups. Aggregate each child collection
-- independently before joining, to avoid multiplying totals through contacts
-- or multiple services/probes. Invoker security applies at every view layer.
-- These views keep Baserow's original derived column names. A future data-layer
-- adapter still needs to wrap scalar lookup values in Baserow's array shape;
-- the current app is deliberately not switched to these views in this commit.

-- Exact ai_ufid formula from the inventory. Baserow row_id() means baserow_id
-- for imported rows, NOT the newly allocated PostgreSQL primary key. Native
-- rows fall back to id. Keep right(left(...), 1): the fourth alphabet has only
-- 13 characters despite the modulo-14 calculation, so substring is not equal.
CREATE VIEW public.fields_calculated
WITH (security_invoker = true) AS
SELECT f.*,
       concat(
           right(left('FJKRTXY2345679', (mod(coalesce(f.baserow_id, f.id), 14) + 1)::integer), 1),
           right(left('FJKRTXY2345679', (mod(coalesce(f.baserow_id, f.id) / 14, 14) + 1)::integer), 1),
           right(left('FJKRTXY2345679', (mod(coalesce(f.baserow_id, f.id) / 196, 14) + 1)::integer), 1),
           right(left('JKRTXY2345679', (mod(coalesce(f.baserow_id, f.id) / 2744, 14) + 1)::integer), 1)
       ) AS ai_ufid
FROM public.fields AS f;
COMMENT ON COLUMN public.fields_calculated.ai_ufid IS 'Inventory formula using original Baserow row_id for imports; calculated, never stored.';

-- lib/data-mappings.ts: billing entities reach operations THROUGH contacts;
-- this is a derived relationship, not another independently editable link.
CREATE VIEW public.billing_entity_operations
WITH (security_invoker = true) AS
SELECT DISTINCT cb.billing_entity_id, co.operation_id
FROM public.contact_billing_entities AS cb
JOIN public.contact_operations AS co ON co.contact_id = cb.contact_id;

-- app/settings/SettingsClient.tsx: catalog margin is dollars, not a percent.
CREATE VIEW public.products_services_calculated
WITH (security_invoker = true) AS
SELECT ps.*, coalesce(ps.rate, 0) - coalesce(ps.dealer_fee, 0) AS margin
FROM public.products_services AS ps;

-- app/orders/page.tsx: missing quantity/price contributes zero.
-- A saved unit_price is a price snapshot, not the catalog's current rate.
CREATE VIEW public.order_items_calculated
WITH (security_invoker = true) AS
SELECT oi.*, coalesce(oi.quantity, 0) * coalesce(oi.unit_price, 0) AS line_total,
       ps.service_type AS product_name
FROM public.order_items AS oi
LEFT JOIN public.products_services AS ps ON ps.id = oi.product_id;

-- Replaces the derived Order.total field. A new empty order totals zero.
CREATE VIEW public.orders_calculated
WITH (security_invoker = true) AS
SELECT o.*, coalesce(items.total, 0::numeric) AS total,
       coalesce(items.item_count, 0::bigint) AS item_count,
       be.name AS billing_entity_name,
       os.value AS status
FROM public.orders AS o
LEFT JOIN (
    SELECT order_link_id, sum(line_total) AS total, count(*) AS item_count
    FROM public.order_items_calculated
    GROUP BY order_link_id
) AS items ON items.order_link_id = o.id
LEFT JOIN public.billing_entities AS be ON be.id = o.billing_entity_id
LEFT JOIN public.order_status_options AS os ON os.id = o.status_id;

-- Missing invoice quantity defaults to one; explicit zero remains zero.
-- Use saved invoice-line rate, not a changing catalog rate. The current billing
-- screen's seasonal service-price forecast/discount logic is NOT an invoice
-- line formula and must not silently replace historical invoice amounts.
CREATE VIEW public.invoice_lines_calculated
WITH (security_invoker = true) AS
SELECT il.*, coalesce(il.rate, 0) * coalesce(il.quantity, 1) AS line_total
FROM public.invoice_lines AS il;

CREATE VIEW public.invoices_calculated
WITH (security_invoker = true) AS
SELECT i.*, coalesce(lines.line_count, 0::bigint) AS line_count,
       coalesce(lines.line_total, 0::numeric) AS line_total,
       CASE WHEN coalesce(lines.line_count, 0) > 0
            THEN lines.line_total
            ELSE coalesce(i.amount, 0)
       END AS calculated_amount,
       be.name AS billing_entity_name,
       s.value AS status
FROM public.invoices AS i
LEFT JOIN (
    SELECT invoice_id, count(*) AS line_count, sum(line_total) AS line_total
    FROM public.invoice_lines_calculated
    GROUP BY invoice_id
) AS lines ON lines.invoice_id = i.id
LEFT JOIN public.billing_entities AS be ON be.id = i.billing_entity_id
LEFT JOIN public.invoice_status_options AS s ON s.id = i.status_id;

-- Per-invoice totals, not the UI's live-catalog seasonal billing projection.
CREATE VIEW public.billing_entity_invoice_totals
WITH (security_invoker = true) AS
SELECT billing_entity_id, season,
       sum(calculated_amount) AS total_billed,
       sum(CASE WHEN lower(status) = 'paid' THEN calculated_amount ELSE 0 END) AS total_paid,
       sum(actual_billed_amount) AS actual_billed_amount,
       count(*) AS invoice_count
FROM public.invoices_calculated
WHERE billing_entity_id IS NOT NULL
GROUP BY billing_entity_id, season;

CREATE VIEW public.field_seasons_calculated
WITH (security_invoker = true) AS
SELECT fs.*, CASE WHEN f.id IS NOT NULL AND be.id IS NOT NULL
                 THEN concat(be.name, ' - ', f.name, ' - ', fs.season)
            END AS record_name,
       f.name AS field_name, f.billing_entity_id,
       be.name AS billing_entity_name, be.name AS entity, crop.value AS crop,
       remover.value AS remover,
       coalesce(services.service_types, ARRAY[]::text[]) AS service_types,
       coalesce(assignments.probe_count, 0::bigint) AS probe_count
FROM public.field_seasons AS fs
LEFT JOIN public.fields AS f ON f.id = fs.field_id
LEFT JOIN public.billing_entities AS be ON be.id = f.billing_entity_id
LEFT JOIN public.field_season_crop_options AS crop ON crop.id = fs.crop_id
LEFT JOIN public.field_season_remover_options AS remover ON remover.id = fs.remover_id
LEFT JOIN (
    SELECT fss.field_season_id,
           array_agg(ps.service_type ORDER BY fss.position, fss.product_service_id) AS service_types
    FROM public.field_season_services AS fss
    JOIN public.products_services AS ps ON ps.id = fss.product_service_id
    GROUP BY fss.field_season_id
) AS services ON services.field_season_id = fs.id
LEFT JOIN (
    SELECT field_season_id, count(*) AS probe_count
    FROM public.probe_assignments
    GROUP BY field_season_id
) AS assignments ON assignments.field_season_id = fs.id;

CREATE VIEW public.probe_assignments_calculated
WITH (security_invoker = true) AS
SELECT pa.*, CASE WHEN fs.id IS NOT NULL AND f.id IS NOT NULL AND p.id IS NOT NULL
                 THEN concat(fs.season, ' - ', f.name, ' - ', p.serial_number)
            END AS record_name,
       fs.season, fs.field_id, f.name AS field_name, f.name AS "Field",
       p.serial_number AS probe_serial_number, status.value AS probe_status,
       coalesce(pa.placement_lat, f.lat) AS effective_placement_lat,
       coalesce(pa.placement_lng, f.lng) AS effective_placement_lng,
       coalesce(pa.elevation, f.elevation) AS effective_elevation,
       coalesce(nullif(pa.soil_type, ''), f.soil_type) AS effective_soil_type
FROM public.probe_assignments AS pa
LEFT JOIN public.field_seasons AS fs ON fs.id = pa.field_season_id
LEFT JOIN public.fields AS f ON f.id = fs.field_id
LEFT JOIN public.probes AS p ON p.id = pa.probe_id
LEFT JOIN public.assignment_probe_status_options AS status ON status.id = pa.probe_status_id;

-- Source water_recs.field = lookup('field_season', 'field'). A missing link
-- stays NULL, and LEFT JOIN preserves recommendations without a linked season.
CREATE VIEW public.water_recs_calculated
WITH (security_invoker = true) AS
SELECT wr.*, f.name AS field
FROM public.water_recs AS wr
LEFT JOIN public.field_seasons AS fs ON fs.id = wr.field_season_id
LEFT JOIN public.fields AS f ON f.id = fs.field_id;

-- Keep the app's inferred field_id alias as a read-only projection of the one
-- real source link; never store two independently editable notification links.
CREATE VIEW public.notifications_calculated
WITH (security_invoker = true) AS
SELECT n.*, n.changed_field AS field_id
FROM public.notifications AS n;

COMMENT ON COLUMN public.field_seasons_calculated.record_name IS 'Inventory: concat(lookup(field,billing_entity), separator, lookup(field,name), separator, season). Empty source lookup becomes NULL.';
COMMENT ON COLUMN public.field_seasons_calculated.entity IS 'Inventory: lookup(field,billing_entity), exposed as the billing entity name.';
COMMENT ON COLUMN public.probe_assignments_calculated.record_name IS 'Inventory: concat(lookup(field_season,season), separator, lookup(field_season,field), separator, lookup(probe,serial_number)). Empty source lookup becomes NULL.';
COMMENT ON COLUMN public.probe_assignments_calculated."Field" IS 'Original case-sensitive Baserow lookup column name.';
COMMENT ON COLUMN public.water_recs_calculated.field IS 'Original Baserow lookup column name: field name through field_season.';

-- app/repairs/page.tsx: repaired_at is authoritative for resolved/open.
-- watch_list stays a separate flag rather than overwriting that status.
CREATE VIEW public.repairs_calculated
WITH (security_invoker = true) AS
SELECT r.*, CASE WHEN r.repaired_at IS NULL THEN 'open' ELSE 'resolved' END AS status,
       r.repaired_at IS NULL AS is_open
FROM public.repairs AS r;

-- app/installer/InstallerApp.tsx: incomplete odometer pairs stay NULL.
-- Do not clamp negative entries; that would hide source corrections/errors.
CREATE VIEW public.mileage_logs_calculated
WITH (security_invoker = true) AS
SELECT ml.*, ml.end_miles - ml.start_miles AS total_miles
FROM public.mileage_logs AS ml;

CREATE VIEW public.probe_rack_calculated
WITH (security_invoker = true) AS
SELECT pr.*, p.serial_number, pr.probe_id IS NULL AS is_empty
FROM public.probe_rack AS pr
LEFT JOIN public.probes AS p ON p.id = pr.probe_id;

-- 6. Fail-closed row-level security on every table.

ALTER TABLE public.contact_customer_type_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_main_contact_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_water_source_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_fuel_source_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_irrigation_type_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_row_direction_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_drip_tubing_direction_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_brand_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_rack_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_trade_year_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_crop_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_side_dress_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_early_removal_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_early_install_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_ready_to_remove_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_planned_installer_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_planned_remover_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_remover_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_removal_priority_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_approval_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_antenna_type_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_battery_type_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_probe_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_approval_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_category_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_unit_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_category_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_station_connectivity_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_station_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_page_type_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_recs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_rack ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mileage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_billing_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_billing_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.probe_owner_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_season_services ENABLE ROW LEVEL SECURITY;

-- Restrict only this migration's objects; no schema-wide REVOKE or GRANT.
REVOKE ALL PRIVILEGES ON TABLE
    public.contact_customer_type_options,
    public.contact_main_contact_options,
    public.field_water_source_options,
    public.field_fuel_source_options,
    public.field_irrigation_type_options,
    public.field_row_direction_options,
    public.field_drip_tubing_direction_options,
    public.probe_brand_options,
    public.probe_status_options,
    public.probe_rack_options,
    public.probe_trade_year_options,
    public.field_season_crop_options,
    public.field_season_side_dress_options,
    public.field_season_early_removal_options,
    public.field_season_early_install_options,
    public.field_season_ready_to_remove_options,
    public.field_season_planned_installer_options,
    public.field_season_planned_remover_options,
    public.field_season_remover_options,
    public.field_season_removal_priority_options,
    public.field_season_approval_status_options,
    public.assignment_antenna_type_options,
    public.assignment_battery_type_options,
    public.assignment_probe_status_options,
    public.assignment_approval_status_options,
    public.invoice_status_options,
    public.product_category_options,
    public.product_unit_options,
    public.product_status_options,
    public.inventory_category_options,
    public.user_role_options,
    public.weather_station_connectivity_options,
    public.weather_station_status_options,
    public.order_status_options,
    public.notification_page_type_options,
    public.operations,
    public.billing_entities,
    public.contacts,
    public.products_services,
    public.fields,
    public.probes,
    public.field_seasons,
    public.probe_assignments,
    public.repairs,
    public.water_recs,
    public.invoices,
    public.invoice_lines,
    public.inventory,
    public.users,
    public.weather_stations,
    public.orders,
    public.order_items,
    public.notifications,
    public.documents,
    public.probe_rack,
    public.installers,
    public.mileage_logs,
    public.contact_operations,
    public.contact_billing_entities,
    public.contact_customer_types,
    public.probe_contacts,
    public.probe_billing_entities,
    public.probe_owner_operations,
    public.field_season_services,
    public.billing_entity_operations,
    public.fields_calculated,
    public.products_services_calculated,
    public.order_items_calculated,
    public.orders_calculated,
    public.invoice_lines_calculated,
    public.invoices_calculated,
    public.billing_entity_invoice_totals,
    public.field_seasons_calculated,
    public.probe_assignments_calculated,
    public.water_recs_calculated,
    public.notifications_calculated,
    public.repairs_calculated,
    public.mileage_logs_calculated,
    public.probe_rack_calculated
FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES ON SEQUENCE
    public.contact_customer_type_options_id_seq,
    public.contact_main_contact_options_id_seq,
    public.field_water_source_options_id_seq,
    public.field_fuel_source_options_id_seq,
    public.field_irrigation_type_options_id_seq,
    public.field_row_direction_options_id_seq,
    public.field_drip_tubing_direction_options_id_seq,
    public.probe_brand_options_id_seq,
    public.probe_status_options_id_seq,
    public.probe_rack_options_id_seq,
    public.probe_trade_year_options_id_seq,
    public.field_season_crop_options_id_seq,
    public.field_season_side_dress_options_id_seq,
    public.field_season_early_removal_options_id_seq,
    public.field_season_early_install_options_id_seq,
    public.field_season_ready_to_remove_options_id_seq,
    public.field_season_planned_installer_options_id_seq,
    public.field_season_planned_remover_options_id_seq,
    public.field_season_remover_options_id_seq,
    public.field_season_removal_priority_options_id_seq,
    public.field_season_approval_status_options_id_seq,
    public.assignment_antenna_type_options_id_seq,
    public.assignment_battery_type_options_id_seq,
    public.assignment_probe_status_options_id_seq,
    public.assignment_approval_status_options_id_seq,
    public.invoice_status_options_id_seq,
    public.product_category_options_id_seq,
    public.product_unit_options_id_seq,
    public.product_status_options_id_seq,
    public.inventory_category_options_id_seq,
    public.user_role_options_id_seq,
    public.weather_station_connectivity_options_id_seq,
    public.weather_station_status_options_id_seq,
    public.order_status_options_id_seq,
    public.notification_page_type_options_id_seq,
    public.operations_id_seq,
    public.billing_entities_id_seq,
    public.contacts_id_seq,
    public.products_services_id_seq,
    public.fields_id_seq,
    public.probes_id_seq,
    public.field_seasons_id_seq,
    public.probe_assignments_id_seq,
    public.repairs_id_seq,
    public.water_recs_id_seq,
    public.water_recs_record_name_seq,
    public.invoices_id_seq,
    public.invoice_lines_id_seq,
    public.inventory_id_seq,
    public.users_id_seq,
    public.weather_stations_id_seq,
    public.orders_id_seq,
    public.orders_order_id_seq,
    public.order_items_id_seq,
    public.order_items_item_id_seq,
    public.notifications_id_seq,
    public.documents_id_seq,
    public.probe_rack_id_seq,
    public.installers_id_seq,
    public.mileage_logs_id_seq
FROM PUBLIC, anon, authenticated;

-- Do not add blanket USING (true) policies here. A later, separately reviewed
-- auth migration must define grants AND per-role/per-operation access policies.
COMMIT;
