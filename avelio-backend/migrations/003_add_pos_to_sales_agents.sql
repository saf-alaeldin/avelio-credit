-- Migration: Add point_of_sale field to sales_agents table
-- This field is only used for Juba station agents

-- Add point_of_sale column
ALTER TABLE sales_agents
ADD COLUMN IF NOT EXISTS point_of_sale VARCHAR(100);

-- Add comment
COMMENT ON COLUMN sales_agents.point_of_sale IS 'Point of Sale location for Juba station agents';

-- Create index for point_of_sale for faster filtering
CREATE INDEX IF NOT EXISTS idx_sales_agents_pos ON sales_agents(point_of_sale);

SELECT 'Migration completed: Added point_of_sale field to sales_agents' as message;
