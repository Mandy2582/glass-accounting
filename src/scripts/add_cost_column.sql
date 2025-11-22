-- Add cost_amount column to invoice_items table
ALTER TABLE invoice_items 
ADD COLUMN cost_amount numeric DEFAULT 0;

-- Optional: Comment to explain
COMMENT ON COLUMN invoice_items.cost_amount IS 'Total FIFO cost of this line item at the time of sale';
