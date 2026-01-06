-- Migration: Add point_of_sale field to station_sales table
-- and make agent_id nullable for non-Juba stations

-- Add point_of_sale column
ALTER TABLE station_sales
ADD COLUMN IF NOT EXISTS point_of_sale VARCHAR(100);

-- Make agent_id nullable (it's now optional for non-Juba stations)
ALTER TABLE station_sales
ALTER COLUMN agent_id DROP NOT NULL;

-- Add comment
COMMENT ON COLUMN station_sales.point_of_sale IS 'Point of Sale location (required for Juba station)';

-- Create index for point_of_sale for faster filtering
CREATE INDEX IF NOT EXISTS idx_station_sales_pos ON station_sales(point_of_sale);

SELECT 'Migration completed: Added point_of_sale field and made agent_id optional' as message;
