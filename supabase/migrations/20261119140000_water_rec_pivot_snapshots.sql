-- Locked pivot position saved with a water recommendation.
--
-- Staff press "Lock pivot position" while writing a Full Report rec. The
-- server reads the linked pivot(s) once (GET-only Valley status) and the
-- snapshot is stored with that rec when it is saved. Only four values per
-- pivot are kept: the pivot link (device serial from field_valley_pivots),
-- arm angle, on/off, and when it was locked. No pressure, direction, history,
-- device name, account login, or raw vendor payload.
--
-- Once saved, a snapshot is fixed: UPDATE is blocked by trigger and the app
-- never inserts a second snapshot for a rec that already has one. Deleting the
-- rec deletes its snapshot (ON DELETE CASCADE).
--
-- Access matches public.water_recs: RLS on, no browser grants, office reads
-- and writes through the postgres role. Growers read only through
-- public.grower_water_rec_pivot_snapshots, filtered by grower_can_see_field.
--
-- Not applied to any database by this commit.

BEGIN;

CREATE TABLE public.water_rec_pivot_snapshots (
  water_rec_id bigint NOT NULL REFERENCES public.water_recs(id) ON DELETE CASCADE,
  pivot_serial text NOT NULL,
  arm_angle numeric(4,1) NOT NULL,
  pivot_on boolean NOT NULL,
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (water_rec_id, pivot_serial),
  CONSTRAINT water_rec_pivot_snapshots_serial_check CHECK (pivot_serial ~ '^[0-9]{1,20}$'),
  CONSTRAINT water_rec_pivot_snapshots_angle_check CHECK (arm_angle >= 0 AND arm_angle < 360)
);

COMMENT ON TABLE public.water_rec_pivot_snapshots IS
  'Pivot position locked in by staff when writing a water rec. Arm angle, on/off, lock time and pivot link only. Fixed once saved.';
COMMENT ON COLUMN public.water_rec_pivot_snapshots.pivot_serial IS
  'Pivot link: device serial from public.field_valley_pivots at lock time. Not a foreign key so the snapshot survives a later link change.';
COMMENT ON COLUMN public.water_rec_pivot_snapshots.arm_angle IS
  'Reported arm angle at lock time, degrees clockwise from north, 0 to <360.';
COMMENT ON COLUMN public.water_rec_pivot_snapshots.pivot_on IS
  'True only when the pivot reported power ON at lock time. OFF, IDLE and unknown are false.';
COMMENT ON COLUMN public.water_rec_pivot_snapshots.captured_at IS
  'When staff pressed Lock pivot position (server time).';

CREATE OR REPLACE FUNCTION public.water_rec_pivot_snapshots_fixed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'A locked pivot snapshot cannot be changed'
    USING ERRCODE = 'check_violation';
END;
$$;

REVOKE ALL ON FUNCTION public.water_rec_pivot_snapshots_fixed() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER water_rec_pivot_snapshots_no_update
  BEFORE UPDATE ON public.water_rec_pivot_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.water_rec_pivot_snapshots_fixed();

ALTER TABLE public.water_rec_pivot_snapshots ENABLE ROW LEVEL SECURITY;

-- Same grants as public.water_recs (001_init): nothing for browser roles.
-- acre_grower never touches the base table.
REVOKE ALL ON TABLE public.water_rec_pivot_snapshots
  FROM PUBLIC, anon, authenticated, acre_grower;

-- Grower read path: one row per locked pivot on a rec the signed-in farm can
-- already see. No serial, no lock author, nothing else.
CREATE OR REPLACE VIEW public.grower_water_rec_pivot_snapshots
WITH (security_barrier = true) AS
SELECT s.water_rec_id,
       row_number() OVER (PARTITION BY s.water_rec_id ORDER BY s.pivot_serial)::integer AS pivot_index,
       s.arm_angle,
       s.pivot_on,
       s.captured_at
FROM public.water_rec_pivot_snapshots AS s
JOIN public.water_recs AS wr ON wr.id = s.water_rec_id
JOIN public.field_seasons AS fs ON fs.id = wr.field_season_id
WHERE public.grower_can_see_field(fs.field_id);

COMMENT ON VIEW public.grower_water_rec_pivot_snapshots IS
  'Grower-visible locked pivot positions for app.grower_operation_id. Same field check as grower_water_recs.';

REVOKE ALL ON TABLE public.grower_water_rec_pivot_snapshots
  FROM PUBLIC, anon, authenticated, service_role, acre_grower;
GRANT SELECT ON public.grower_water_rec_pivot_snapshots TO acre_grower;

COMMIT;
