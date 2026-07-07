-- Adds customer-facing shop metadata to inventory items.
-- Run this once in Supabase SQL Editor before using product image / online visibility controls.

alter table public.items
    add column if not exists product_group text,
    add column if not exists show_online boolean not null default true,
    add column if not exists image_url text;

update public.items
set show_online = true
where show_online is null;

create index if not exists idx_items_show_online on public.items(show_online);
create index if not exists idx_items_product_group on public.items(product_group);
