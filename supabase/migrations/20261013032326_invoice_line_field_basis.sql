-- Preserve the unsplit unit rate and field quantity independently of each
-- recipient's rounded share. Do not guess/backfill historical shared rates.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.invoice_lines
    ADD COLUMN IF NOT EXISTS field_unit_rate numeric(14,2),
    ADD COLUMN IF NOT EXISTS field_quantity numeric(14,4);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.invoice_lines'::regclass AND conname = 'invoice_lines_field_basis_valid') THEN
        ALTER TABLE public.invoice_lines ADD CONSTRAINT invoice_lines_field_basis_valid CHECK (
            (field_unit_rate IS NULL AND field_quantity IS NULL) OR
            (field_unit_rate IS NOT NULL AND field_quantity IS NOT NULL AND field_unit_rate >= 0 AND field_quantity >= 0)
        );
    END IF;
END $$;
-- Keep existing view columns in their original order; append the new snapshots.
CREATE OR REPLACE VIEW public.invoice_lines_calculated WITH (security_invoker = true) AS
SELECT il.id, il.baserow_id, il.record_name, il.invoice_id, il.field_season_id,
       il.service_type, il.rate, il.quantity,
       coalesce(il.rate, 0) * coalesce(il.quantity, 1) AS line_total,
       il.field_unit_rate, il.field_quantity
FROM public.invoice_lines il;
COMMENT ON COLUMN public.invoice_lines.field_unit_rate IS 'Original unsplit field unit rate at enrollment; not the allocated total.';
COMMENT ON COLUMN public.invoice_lines.field_quantity IS 'Field quantity used with field_unit_rate before equal allocation.';
COMMIT;
