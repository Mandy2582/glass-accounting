alter table public.custom_designs
  add column if not exists source_image_base64 text,
  add column if not exists source_image_mime_type text;
