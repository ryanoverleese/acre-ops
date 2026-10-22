-- Server-only links; populate separately after reviewing the real pivot matches.
-- No device settings, commands, credentials, or telemetry are stored here.
CREATE TABLE public.field_valley_pivots (
    field_id bigint NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
    valley_username text NOT NULL CHECK (length(valley_username) BETWEEN 1 AND 128 AND valley_username = btrim(valley_username)),
    serial text NOT NULL CHECK (serial ~ '^[0-9]{1,20}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (field_id, valley_username, serial)
);
ALTER TABLE public.field_valley_pivots ENABLE ROW LEVEL SECURITY;
-- Revoke service_role too: Supabase may give new tables default ALL grants.
REVOKE ALL ON public.field_valley_pivots FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.field_valley_pivots TO service_role;
COMMENT ON TABLE public.field_valley_pivots IS 'Reviewed Acre field to AgSense device links. Server-only read-only telemetry integration; never auto-match by field name.';
