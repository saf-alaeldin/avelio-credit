-- Fix settlement overlap trigger to use inclusive date comparison
-- Previous trigger used PostgreSQL OVERLAPS which treats ranges as half-open [start, end)
-- This allowed settlements to share boundary dates (e.g., Feb 1-5 and Feb 5-8)

CREATE OR REPLACE FUNCTION check_settlement_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM settlements
    WHERE station_id = NEW.station_id
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND status NOT IN ('REJECTED')
      AND (is_deleted = false OR is_deleted IS NULL)
      AND NEW.period_from <= period_to
      AND NEW.period_to >= period_from
  ) THEN
    RAISE EXCEPTION 'Settlement period overlaps with an existing settlement for this station';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
