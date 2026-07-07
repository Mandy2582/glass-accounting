alter table public.items
add column if not exists rate_unit text,
add column if not exists purchase_rate_unit text;

update public.items
set
  rate_unit = coalesce(rate_unit, case when category = 'glass' then 'sqft' else unit end),
  purchase_rate_unit = coalesce(purchase_rate_unit, rate_unit, case when category = 'glass' then 'sqft' else unit end)
where rate_unit is null
   or purchase_rate_unit is null;
