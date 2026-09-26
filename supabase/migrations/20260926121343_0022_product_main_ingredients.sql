-- 0022: declared main ingredients of a product (e.g. trade designations WPC 80,
-- WPI 90). A declaration, never a measured composition. At most 12 entries,
-- each 1-64 characters, enforced by the database.

create or replace function private.short_text_list(p text[], p_max_items integer, p_max_len integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(cardinality(p), 0) <= p_max_items
     and not exists (select 1 from unnest(p) x where x is null or length(trim(x)) = 0 or length(x) > p_max_len);
$$;

alter table public.product_targets
  add column main_ingredients text[] not null default '{}'::text[],
  add constraint product_targets_main_ingredients_check check (private.short_text_list(main_ingredients, 12, 64));

comment on column public.product_targets.main_ingredients is
  'Declared main ingredients (e.g. trade designations WPC 80, WPI 90). A declaration, not a measured composition.';
