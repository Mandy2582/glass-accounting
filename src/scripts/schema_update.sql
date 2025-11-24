-- Add balance to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS balance NUMERIC DEFAULT 0;

-- Add employee fields to vouchers
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employees(id);
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS employee_name TEXT;
