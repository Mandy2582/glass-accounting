-- Run this script in your Supabase Dashboard SQL Editor to add the missing columns
-- to support advanced order linking, partial deliveries, and invoice tracking.

-- 1. Add linked_order_id and parent_order_id for linking Sales Orders to Purchase Orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS linked_order_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS parent_order_id UUID;

-- 2. Add delivery-related tracking columns
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_direct_delivery BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS supplier_delivery_date TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_delivery_date TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_to_us NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_to_customer NUMERIC DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS deliveries JSONB DEFAULT '[]'::jsonb;

-- 3. Add invoice_id column for linking the order to its generated invoice
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_id UUID;

-- 4. Comment explanations for columns
COMMENT ON COLUMN orders.linked_order_id IS 'Links Sales Order to Purchase Order and vice versa';
COMMENT ON COLUMN orders.parent_order_id IS 'Customer order ID reference';
COMMENT ON COLUMN orders.is_direct_delivery IS 'True if delivery skips the main warehouse and goes directly to customer';
COMMENT ON COLUMN orders.deliveries IS 'JSON tracking of partial delivery attempts/records';
COMMENT ON COLUMN orders.invoice_id IS 'Links this order to its generated invoice';
