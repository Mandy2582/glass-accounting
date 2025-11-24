-- Create bank_accounts table
CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    account_number TEXT,
    type TEXT CHECK (type IN ('savings', 'current', 'od')),
    od_limit NUMERIC DEFAULT 0,
    interest_rate NUMERIC DEFAULT 0,
    opening_balance NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Add bank_account_id to vouchers
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);
