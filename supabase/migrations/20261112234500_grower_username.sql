-- Dedicated grower login username.
-- operations.name stays the farm name everywhere else (Acre Ops, CropX).
-- Login matches grower_username when it is non-blank, otherwise operations.name.
-- Not applied to the live project by this commit.

BEGIN;

ALTER TABLE public.operations
  ADD COLUMN IF NOT EXISTS grower_username text;

COMMENT ON COLUMN public.operations.grower_username IS
  'Optional grower sign-in name. When non-blank, grower_login_lookup matches this instead of operations.name. The farm name itself is unchanged.';

-- Case-insensitive uniqueness on the trimmed username. Blank and NULL do not
-- occupy a login key, so several farms can still sign in by operations.name.
CREATE UNIQUE INDEX IF NOT EXISTS operations_grower_username_ci_uidx
  ON public.operations (lower(btrim(grower_username)))
  WHERE grower_username IS NOT NULL
    AND btrim(grower_username) <> '';

-- Production Fishell Farms is operations.id 20. Refuse to stamp a different
-- farm that happens to hold that id. Also match by name so a restored row
-- with the same farm name gets the same login.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.operations
     WHERE id = 20
       AND lower(btrim(name)) IS DISTINCT FROM 'fishell farms'
  ) THEN
    RAISE EXCEPTION 'operations.id 20 is not Fishell Farms; refusing to set grower_username';
  END IF;
END $$;

UPDATE public.operations
   SET grower_username = 'Fishell'
 WHERE id = 20
    OR lower(btrim(name)) = 'fishell farms';

-- Login key is the username when set, otherwise the farm name.
-- name in the result stays operations.name for the pilot allow-list and session.
CREATE OR REPLACE FUNCTION public.grower_login_lookup(p_farm_name text)
RETURNS TABLE (
  id bigint,
  name text,
  grower_pin text,
  is_current_customer boolean
)
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matches AS (
    SELECT o.id, o.name, o.grower_pin
      FROM public.operations AS o
     WHERE lower(btrim(coalesce(nullif(btrim(o.grower_username), ''), o.name)))
           = lower(btrim(p_farm_name))
  )
  SELECT m.id,
         m.name,
         m.grower_pin,
         EXISTS (
           SELECT 1
             FROM public.contact_operations AS co
             JOIN public.contact_customer_types AS cct
               ON cct.contact_id = co.contact_id
             JOIN public.contact_customer_type_options AS opt
               ON opt.id = cct.customer_type_id
            WHERE co.operation_id = m.id
              AND opt.value = 'Current Customer'
         ) AS is_current_customer
    FROM matches AS m
   WHERE (SELECT count(*)::int FROM matches) = 1;
$$;

REVOKE ALL ON FUNCTION public.grower_login_lookup(text)
  FROM PUBLIC, anon, authenticated, service_role, acre_grower;

GRANT EXECUTE ON FUNCTION public.grower_login_lookup(text) TO acre_grower;

COMMENT ON FUNCTION public.grower_login_lookup(text) IS
  'Read-only farm login projection for grower roles. Matches grower_username when non-blank, otherwise operations.name. Returns at most one row: id, name (operations.name), grower_pin hash, is_current_customer. No base-table grants required.';

-- New columns do not grant acre_grower access to operations.
REVOKE ALL ON TABLE public.operations FROM acre_grower;

COMMIT;
