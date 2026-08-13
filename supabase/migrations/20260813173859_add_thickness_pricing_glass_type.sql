alter table public.thickness_pricing
  add column if not exists glass_type text;

alter table public.thickness_pricing
  drop constraint if exists thickness_pricing_thickness_key;

create unique index if not exists idx_thickness_pricing_type
  on public.thickness_pricing (thickness, coalesce(lower(glass_type), ''));
