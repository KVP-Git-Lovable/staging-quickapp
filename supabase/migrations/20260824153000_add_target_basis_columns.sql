-- Lets the annual figure for Quantity, Revenue, and Visits be "decide later"
-- instead of required upfront. 'direct' = typed at plan level (today's only
-- behaviour); 'derived' = follows whatever is assigned to people so far;
-- 'unset' = nothing chosen yet, same display as 'derived' with nothing to sum.
alter table public.fy_target_config
  add column quantity_basis text not null default 'direct'
    check (quantity_basis in ('direct', 'derived', 'unset')),
  add column revenue_basis text not null default 'direct'
    check (revenue_basis in ('direct', 'derived', 'unset')),
  add column visits_basis text not null default 'direct'
    check (visits_basis in ('direct', 'derived', 'unset'));
