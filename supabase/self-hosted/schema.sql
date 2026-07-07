-- Arjun Glass House self-hosted Supabase schema
-- Generated for the current application storage layer.

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text default 'glass',
  type text,
  product_group text,
  show_online boolean not null default true,
  image_url text,
  make text,
  model text,
  thickness numeric,
  width numeric,
  height numeric,
  unit text not null default 'nos',
  stock numeric not null default 0,
  warehouse_stock jsonb not null default '{"Warehouse A":0,"Warehouse B":0}'::jsonb,
  min_stock numeric not null default 0,
  rate numeric not null default 0,
  rate_unit text,
  purchase_rate numeric default 0,
  purchase_rate_unit text,
  hsn_code text,
  conversion_factor numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null default 'customer',
  phone text default '',
  address text default '',
  balance numeric not null default 0,
  credit_limit numeric not null default 0,
  gstin text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parties
  add column if not exists credit_limit numeric not null default 0;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'sale',
  number text not null,
  supplier_invoice_number text,
  date text not null,
  party_id uuid,
  party_name text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  paid_amount numeric not null default 0,
  status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  item_id uuid,
  item_name text,
  description text,
  make text,
  model text,
  type text,
  warehouse text,
  width numeric default 0,
  height numeric default 0,
  quantity numeric default 0,
  unit text,
  sqft numeric default 0,
  rate numeric default 0,
  amount numeric default 0,
  line_total numeric,
  cost_amount numeric,
  source_type text,
  design_id uuid,
  design_piece_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.items(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  date text not null,
  rate numeric not null default 0,
  quantity numeric not null default 0,
  remaining_quantity numeric not null default 0,
  warehouse text default 'Warehouse A',
  cost_amount numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  date text not null,
  type text not null,
  party_id uuid,
  party_name text,
  employee_id uuid,
  employee_name text,
  amount numeric not null default 0,
  description text,
  mode text not null default 'cash',
  bank_account_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  account_number text,
  type text default 'current',
  od_limit numeric default 0,
  interest_rate numeric default 0,
  opening_balance numeric default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vouchers_bank_account_id_fkey'
      and conrelid = 'public.vouchers'::regclass
  ) then
    alter table public.vouchers
      add constraint vouchers_bank_account_id_fkey
      foreign key (bank_account_id) references public.bank_accounts(id) on delete set null;
  end if;
end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  number text not null,
  general_number text,
  so_number text,
  po_number text,
  requires_design boolean default false,
  date text not null,
  delivery_date text,
  party_id uuid,
  party_name text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  status text not null default 'pending',
  notes text,
  paid_amount numeric not null default 0,
  payment_status text not null default 'unpaid',
  linked_order_id uuid,
  parent_order_id uuid,
  invoice_id uuid,
  is_direct_delivery boolean default false,
  supplier_delivery_date text,
  customer_delivery_date text,
  delivered_to_us numeric default 0,
  delivered_to_customer numeric default 0,
  deliveries jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  designation text,
  phone text,
  joining_date text,
  basic_salary numeric not null default 0,
  status text not null default 'active',
  balance numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete cascade,
  date text not null,
  status text not null,
  note text,
  created_at timestamptz not null default now(),
  unique(employee_id, date)
);

create table if not exists public.payroll (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees(id) on delete set null,
  employee_name text,
  month text not null,
  basic_salary numeric default 0,
  present_days numeric default 0,
  total_days numeric default 0,
  deductions numeric default 0,
  bonus numeric default 0,
  net_salary numeric default 0,
  status text not null default 'generated',
  payment_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.settings (
  id text primary key default 'default',
  pricing_config jsonb,
  business_config jsonb,
  app_settings jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.thickness_pricing (
  id uuid primary key default gen_random_uuid(),
  thickness numeric not null unique,
  rate_per_sqft numeric not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_designs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer_id uuid,
  customer_name text,
  drawing_data jsonb not null default '{}'::jsonb,
  base_shape text,
  total_area numeric not null default 0,
  gross_area numeric not null default 0,
  holes integer not null default 0,
  cuts integer not null default 0,
  complexity_level text not null default 'simple',
  base_rate numeric not null default 0,
  complexity_charge numeric not null default 0,
  edge_finishing_charge numeric not null default 0,
  estimated_cost numeric not null default 0,
  status text not null default 'draft',
  created_date text not null default (now()::date)::text,
  approved_date text,
  notes text,
  order_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_show_online on public.items(show_online);
create index if not exists idx_items_category on public.items(category);
create index if not exists idx_items_product_group on public.items(product_group);
create index if not exists idx_invoices_created_at on public.invoices(created_at desc);
create index if not exists idx_invoices_type_date on public.invoices(type, date);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_type on public.orders(type);
create index if not exists idx_stock_batches_item_id on public.stock_batches(item_id);
create index if not exists idx_custom_designs_created_date on public.custom_designs(created_date desc);

insert into public.thickness_pricing (thickness, rate_per_sqft) values
  (3.5, 100), (4, 110), (5, 120), (6, 130), (8, 150),
  (10, 180), (12, 210), (15, 250), (19, 300)
on conflict (thickness) do nothing;

insert into public.settings (id, pricing_config, business_config)
values ('default', '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- The current frontend talks directly to Supabase. Keep public schema usable
-- for anon/authenticated clients; app-level roles still gate staff screens.
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on all tables in schema public to anon, authenticated, service_role;
grant all privileges on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all privileges on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all privileges on sequences to anon, authenticated, service_role;
