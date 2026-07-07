-- Add thickness pricing support to the database
-- This migration adds a table for thickness-based pricing

-- Create thickness_pricing table
CREATE TABLE IF NOT EXISTS thickness_pricing (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thickness NUMERIC NOT NULL, -- in mm (supports 3.5, 4, 5, etc.)
    rate_per_sqft NUMERIC NOT NULL, -- Direct rate per sqft for this thickness
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create unique constraint on thickness
CREATE UNIQUE INDEX IF NOT EXISTS thickness_pricing_thickness_key ON thickness_pricing(thickness);

-- Insert default thickness pricing (you can adjust these rates)
INSERT INTO thickness_pricing (thickness, rate_per_sqft) VALUES
    (3.5, 100.00),  -- 3.5mm glass
    (4, 110.00),    -- 4mm glass
    (5, 120.00),    -- 5mm glass
    (6, 130.00),    -- 6mm glass (common default)
    (8, 150.00),    -- 8mm glass
    (10, 180.00),   -- 10mm glass
    (12, 210.00),   -- 12mm glass
    (15, 250.00),   -- 15mm glass
    (19, 300.00)    -- 19mm glass
ON CONFLICT (thickness) DO NOTHING;

-- Add default_thickness to pricing_settings table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pricing_settings') THEN
        ALTER TABLE pricing_settings 
        ADD COLUMN IF NOT EXISTS default_thickness NUMERIC DEFAULT 6;
    END IF;
END $$;

-- Add comment to table
COMMENT ON TABLE thickness_pricing IS 'Stores direct rate per sqft for each glass thickness';
COMMENT ON COLUMN thickness_pricing.thickness IS 'Glass thickness in millimeters';
COMMENT ON COLUMN thickness_pricing.rate_per_sqft IS 'Direct rate per square foot for this thickness';
