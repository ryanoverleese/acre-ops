-- Grower farm PIN for login by operations.name.
-- Same bcrypt shape as installers.pin. Password/PIN plaintext never stored.
-- Not applied to the live project by this commit.

BEGIN;

ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS grower_pin text;

ALTER TABLE public.operations
  DROP CONSTRAINT IF EXISTS operations_grower_pin_bcrypt_only;

ALTER TABLE public.operations
  ADD CONSTRAINT operations_grower_pin_bcrypt_only
  CHECK (
    grower_pin IS NULL
    OR grower_pin ~ '^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$'
  );

COMMENT ON COLUMN public.operations.grower_pin IS
  'Private bcrypt hash for grower app login (4–6 digit PIN). Never include in public views or grower_* reads.';

REVOKE ALL ON TABLE public.operations FROM acre_grower;

COMMIT;
