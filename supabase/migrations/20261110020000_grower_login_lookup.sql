-- Grower login lookup. Additive.
-- Lets acre_grower (and later acre_grower_preview) resolve farm name → id, name,
-- PIN hash, and current-customer flag without SELECT on base tables.
-- No roles or passwords are created here.

BEGIN;

-- Exactly one matching farm (trim, case-insensitive). Zero rows when missing or duplicate.
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
     WHERE lower(btrim(o.name)) = lower(btrim(p_farm_name))
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
  'Read-only farm login projection for grower roles. Returns at most one row: id, name, grower_pin hash, is_current_customer. No base-table grants required.';

COMMIT;
