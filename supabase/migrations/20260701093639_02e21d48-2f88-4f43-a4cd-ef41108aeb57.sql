
alter table public.activity_types
  add column if not exists parent_id uuid references public.activity_types(id) on delete restrict,
  add column if not exists is_category boolean not null default false,
  add column if not exists photo_required boolean not null default false,
  add column if not exists location_required boolean not null default false,
  add column if not exists show_in_picker boolean not null default true;

insert into public.activity_types (code, name, is_category, is_sales_activity, sort_order, show_in_picker)
values
  ('cat_field_visit','Field Visit', true, false, 1, true),
  ('cat_survey_intel','Survey & Intel', true, false, 2, true),
  ('cat_distributor_dealer','Distributor & Dealer', true, false, 3, true),
  ('cat_meeting_training','Meeting & Training', true, false, 4, true),
  ('cat_events_promotions','Events & Promotions', true, false, 5, true)
on conflict (code) do nothing;

update public.activity_types set parent_id=(select id from public.activity_types where code='cat_field_visit'), is_category=false
  where name in ('Joint Visit','Doctor Visit');

update public.activity_types set parent_id=(select id from public.activity_types where code='cat_survey_intel'), is_category=false
  where name in ('Route Survey','Market Survey','Competitor Analysis');

update public.activity_types set parent_id=(select id from public.activity_types where code='cat_distributor_dealer'), is_category=false
  where name in ('Distributor Visit','Dealer Meeting');

update public.activity_types set parent_id=(select id from public.activity_types where code='cat_meeting_training'), is_category=false
  where name in ('Meeting / Training','Training');

update public.activity_types set parent_id=(select id from public.activity_types where code='cat_events_promotions'), is_category=false
  where name in ('Marketing Event','Promotional Campaign','Exhibition','Celebration','Product Demo','Promotion','Other');

update public.activity_types set show_in_picker=false where name in ('Counter Sale','Event');
