-- Approved 2026-10-12: every fields.billing_entity link belongs in this join.
-- Live read-only preflight found two fields with two links; preserve every link
-- and its original order, without designating a primary billing entity.
-- This is additive. The original applied 001_init.sql remains unchanged.
BEGIN;

CREATE TABLE public.field_billing_entities (
    field_id bigint NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
    billing_entity_id bigint NOT NULL REFERENCES public.billing_entities(id) ON DELETE CASCADE,
    position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
    PRIMARY KEY (field_id, billing_entity_id)
);
CREATE INDEX field_billing_entities_billing_entity_id_idx
    ON public.field_billing_entities (billing_entity_id);
CREATE INDEX field_billing_entities_position_idx
    ON public.field_billing_entities (field_id, position);
ALTER TABLE public.field_billing_entities ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.field_billing_entities FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.field_billing_entities IS
    'Authoritative billing relationship for EVERY field, including single-link fields. Import fields.billing_entity here using baserow_id crosswalks. Future Supabase app reads/writes must use this join.';
COMMENT ON COLUMN public.fields.billing_entity_id IS
    'Deprecated compatibility column; importer leaves it NULL for every field. Not authoritative. Read and write field billing exclusively through public.field_billing_entities.';

-- Preserve the existing view signature, but derive ALL billing values from the
-- join. The scalar billing_entity_id is only a computed convenience for exactly
-- one linked entity, never an arbitrarily chosen first entity.
-- Verified source multi-link formula text, e.g.:
-- Mike Hadley - Old Place West - 2025, Craig Hadley - Old Place West - 2025
CREATE OR REPLACE VIEW public.field_seasons_calculated
WITH (security_invoker = true) AS
SELECT fs.*, billing.record_names AS record_name,
       f.name AS field_name, billing.single_billing_entity_id AS billing_entity_id,
       billing.names AS billing_entity_name, billing.names AS entity, crop.value AS crop,
       remover.value AS remover,
       coalesce(services.service_types, ARRAY[]::text[]) AS service_types,
       coalesce(assignments.probe_count, 0::bigint) AS probe_count
FROM public.field_seasons AS fs
LEFT JOIN public.fields AS f ON f.id = fs.field_id
LEFT JOIN LATERAL (
    SELECT CASE WHEN count(*) = 1 THEN min(be.id) END AS single_billing_entity_id,
           string_agg(be.name, ', ' ORDER BY fb.position, fb.billing_entity_id) AS names,
           string_agg(concat(be.name, ' - ', f.name, ' - ', fs.season),
                      ', ' ORDER BY fb.position, fb.billing_entity_id) AS record_names
    FROM public.field_billing_entities AS fb
    JOIN public.billing_entities AS be ON be.id = fb.billing_entity_id
    WHERE fb.field_id = f.id
) AS billing ON true
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
REVOKE ALL PRIVILEGES ON TABLE public.field_seasons_calculated FROM PUBLIC, anon, authenticated;
COMMENT ON COLUMN public.field_seasons_calculated.record_name IS
    'Baserow concat/lookup display: a full record name per linked billing entity, joined with comma-space in source link order.';
COMMENT ON COLUMN public.field_seasons_calculated.billing_entity_id IS
    'Derived from field_billing_entities only when exactly one entity is linked; NULL for zero or multiple links. Use the join for the complete relationship.';

COMMIT;
