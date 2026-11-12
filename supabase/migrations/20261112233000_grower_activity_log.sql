-- Grower sign-in and page-view log.
-- acre_grower (DATABASE_URL_GROWER) cannot read or write this table.
-- It may only call acre_private.log_grower_activity, which stamps
-- operation_id from app.grower_operation_id and stores a field name only
-- when grower_can_see_field is true.
-- acre_private is not an exposed Data API schema. Do not add it to
-- Supabase Exposed schemas.
-- Office staff read the table through the postgres role (DATABASE_URL).
-- Not applied to the live project by this commit.

BEGIN;

CREATE SCHEMA IF NOT EXISTS acre_private;

REVOKE ALL ON SCHEMA acre_private FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA acre_private TO acre_grower;

COMMENT ON SCHEMA acre_private IS
  'Private helpers for the grower app. Not an exposed API schema. acre_grower has USAGE only.';

CREATE TABLE public.grower_activity_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id bigint NOT NULL REFERENCES public.operations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  path text,
  field_id bigint REFERENCES public.fields(id) ON DELETE SET NULL,
  field_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grower_activity_log_operation_positive CHECK (operation_id > 0),
  CONSTRAINT grower_activity_log_event_type_check CHECK (
    event_type IN ('login', 'page_view', 'logout')
  ),
  CONSTRAINT grower_activity_log_path_check CHECK (
    path IS NULL
    OR (
      char_length(path) BETWEEN 1 AND 300
      AND path ~ '^/grower(/[A-Za-z0-9_-]+)*$'
    )
  ),
  CONSTRAINT grower_activity_log_field_positive CHECK (field_id IS NULL OR field_id > 0),
  CONSTRAINT grower_activity_log_field_name_len CHECK (
    field_name IS NULL OR char_length(field_name) <= 200
  )
);

COMMENT ON TABLE public.grower_activity_log IS
  'Grower sign-ins, sign-outs, and page views. Written only by acre_private.log_grower_activity. Office reads this table; acre_grower has no table privileges.';

COMMENT ON COLUMN public.grower_activity_log.field_name IS
  'Field name at the time of the visit, copied only when that farm can see the field.';

CREATE INDEX grower_activity_log_operation_created_idx
  ON public.grower_activity_log (operation_id, created_at DESC);

ALTER TABLE public.grower_activity_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.grower_activity_log
  FROM PUBLIC, anon, authenticated, service_role, acre_grower;

REVOKE ALL ON SEQUENCE public.grower_activity_log_id_seq
  FROM PUBLIC, anon, authenticated, service_role, acre_grower;

-- Inserts one row for the farm in app.grower_operation_id.
-- The caller cannot choose a different operation_id.
-- An identical event for that farm in the last few seconds is ignored so a
-- prefetch or a React strict-mode remount does not double-count.
CREATE OR REPLACE FUNCTION acre_private.log_grower_activity(
  p_event_type text,
  p_path text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_op bigint;
  v_path text;
  v_field_text text;
  v_field_id bigint;
  v_field_name text;
BEGIN
  v_op := public.grower_operation_id();
  IF v_op IS NULL OR v_op <= 0 THEN
    RAISE EXCEPTION 'grower operation is not set' USING ERRCODE = '42501';
  END IF;

  IF p_event_type IS NULL OR p_event_type NOT IN ('login', 'page_view', 'logout') THEN
    RAISE EXCEPTION 'invalid grower activity event' USING ERRCODE = '22023';
  END IF;

  v_path := NULLIF(btrim(p_path), '');
  IF v_path IS NOT NULL THEN
    v_path := split_part(split_part(v_path, '?', 1), '#', 1);
    IF char_length(v_path) > 1 AND right(v_path, 1) = '/' THEN
      v_path := left(v_path, char_length(v_path) - 1);
    END IF;
  END IF;

  IF p_event_type = 'logout' THEN
    v_path := NULL;
  ELSIF p_event_type = 'login' THEN
    IF v_path IS DISTINCT FROM '/grower/login' THEN
      RAISE EXCEPTION 'invalid grower activity path' USING ERRCODE = '22023';
    END IF;
  ELSIF v_path IS NULL
     OR char_length(v_path) > 300
     OR v_path !~ '^/grower(/[A-Za-z0-9_-]+)*$'
     OR NOT (
       v_path IN ('/grower/fields', '/grower/hardware', '/grower/recommendations')
       OR v_path ~ '^/grower/fields/[1-9][0-9]{0,14}$'
     )
  THEN
    RAISE EXCEPTION 'invalid grower activity path' USING ERRCODE = '22023';
  END IF;

  v_field_id := NULL;
  v_field_name := NULL;
  IF p_event_type = 'page_view' THEN
    v_field_text := substring(v_path FROM '^/grower/fields/([1-9][0-9]{0,14})$');
    IF v_field_text IS NOT NULL AND public.grower_can_see_field(v_field_text::bigint) THEN
      SELECT f.id, left(f.name, 200)
        INTO v_field_id, v_field_name
        FROM public.fields AS f
       WHERE f.id = v_field_text::bigint;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(714627, (v_op % 2147483647)::integer);

  IF EXISTS (
    SELECT 1
      FROM public.grower_activity_log AS existing
     WHERE existing.operation_id = v_op
       AND existing.event_type = p_event_type
       AND existing.path IS NOT DISTINCT FROM v_path
       AND existing.field_id IS NOT DISTINCT FROM v_field_id
       AND existing.created_at > now() - interval '3 seconds'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.grower_activity_log (
    operation_id, event_type, path, field_id, field_name
  ) VALUES (
    v_op, p_event_type, v_path, v_field_id, v_field_name
  );
END;
$$;

REVOKE ALL ON FUNCTION acre_private.log_grower_activity(text, text)
  FROM PUBLIC, anon, authenticated, service_role, acre_grower;

GRANT EXECUTE ON FUNCTION acre_private.log_grower_activity(text, text) TO acre_grower;

COMMENT ON FUNCTION acre_private.log_grower_activity(text, text) IS
  'Append a grower login, logout, or page view for app.grower_operation_id only. Field name is stored only when that farm can see the field.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'acre_grower_preview') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA acre_private FROM acre_grower_preview';
    EXECUTE 'GRANT USAGE ON SCHEMA acre_private TO acre_grower_preview';
    EXECUTE 'REVOKE ALL ON TABLE public.grower_activity_log FROM acre_grower_preview';
    EXECUTE 'REVOKE ALL ON SEQUENCE public.grower_activity_log_id_seq FROM acre_grower_preview';
    EXECUTE 'REVOKE ALL ON FUNCTION acre_private.log_grower_activity(text, text) FROM acre_grower_preview';
    EXECUTE 'GRANT EXECUTE ON FUNCTION acre_private.log_grower_activity(text, text) TO acre_grower_preview';
  END IF;
END $$;

COMMIT;
