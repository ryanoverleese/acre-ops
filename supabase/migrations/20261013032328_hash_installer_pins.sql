-- One-time, rerunnable PIN conversion. Apply to Acre Ops before deploying
-- bcrypt-only installer login. Never logs/returns PINs or their hashes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $$
DECLARE
    crypto_schema name;
    installer record;
    hashed text;
    bcrypt_pattern constant text := '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$';
BEGIN
    SELECT n.nspname INTO STRICT crypto_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pgcrypto';
    LOCK TABLE public.installers IN SHARE ROW EXCLUSIVE MODE;
    IF EXISTS (SELECT 1 FROM public.installers WHERE pin IS NOT NULL AND btrim(pin) <> ''
               AND pin !~ '^[0-9]{4,6}$' AND pin !~ bcrypt_pattern) THEN
        RAISE EXCEPTION 'Installer PIN migration blocked: unexpected format; no PINs changed';
    END IF;
    FOR installer IN SELECT id, pin FROM public.installers WHERE pin ~ '^[0-9]{4,6}$' ORDER BY id LOOP
        EXECUTE format('SELECT %I.crypt($1, %I.gen_salt(''bf'', 12))', crypto_schema, crypto_schema)
            INTO hashed USING installer.pin;
        UPDATE public.installers SET pin = hashed WHERE id = installer.id;
    END LOOP;
    UPDATE public.installers SET pin = NULL WHERE pin IS NOT NULL AND btrim(pin) = '';
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.installers'::regclass AND conname = 'installers_pin_bcrypt_only') THEN
        ALTER TABLE public.installers ADD CONSTRAINT installers_pin_bcrypt_only
            CHECK (pin IS NULL OR pin ~ '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$');
    END IF;
END $$;
COMMIT;
