-- An order must not complete an EVENT.
--
-- auto_update_visit_status_on_order exists for retailer visits, where taking an
-- order really does mean "this call was productive, it is over". It sets the
-- visit to productive AND stamps check_out_time.
--
-- An event order carries visit_id = the event's shared visit, so the first sale
-- at a day-long stall instantly marked the whole event finished: status
-- productive, checked out, never checked in. The card then reads "Completed"
-- and correctly hides both Edit and Start — the rep is locked out of an event
-- that is still running. 11 events were found in that state, the oldest from
-- 28 April 2026, so this predates the multi-user event work.
--
-- An event ends when someone checks out of it, not when it makes its first
-- sale. The retailer-visit behaviour is unchanged.
--
-- NOTE: two triggers (trigger_auto_update_visit_on_order and
-- trigger_auto_update_visit_status_on_order) both call this function on the
-- same events, so it runs twice per order. Harmless but wasteful; left in place
-- rather than dropped without review.
create or replace function public.auto_update_visit_status_on_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_visit_id uuid;
  has_items       boolean;
  is_activity     boolean;
begin
  if new.status = 'confirmed' then
    select exists (select 1 from order_items where order_id = new.id) into has_items;

    if not has_items then
      raise log 'auto_update_visit_status_on_order: skipping order % - no items yet', new.id;
      return new;
    end if;

    target_visit_id := new.visit_id;

    if target_visit_id is null and new.retailer_id is not null and new.user_id is not null then
      select id into target_visit_id
        from visits
       where retailer_id = new.retailer_id
         and user_id = new.user_id
         and planned_date = new.order_date
         and status in ('planned', 'in-progress', 'unproductive')
       order by created_at desc
       limit 1;
    end if;

    if target_visit_id is not null then
      -- The guard. Events and other activities run on their own clock.
      select (coalesce(v.visit_type, '') = 'activity' or v.activity_event_id is not null)
        into is_activity
        from visits v where v.id = target_visit_id;

      if is_activity then
        raise log 'auto_update_visit_status_on_order: visit % is an activity, leaving its status alone', target_visit_id;
        return new;
      end if;

      update visits
         set status = 'productive',
             check_out_time = coalesce(check_out_time, new.created_at),
             no_order_reason = null,
             updated_at = now()
       where id = target_visit_id
         and status in ('planned', 'in-progress', 'unproductive');
    end if;
  end if;

  return new;
end;
$function$;

-- Undo what the trigger already wrote to event visits.
--
-- Scope is deliberately narrow: only event visits never checked into
-- (check_in_time is null) whose event is still open. Both together mean nobody
-- ever started or finished it — the productive status and check_out_time came
-- from the trigger, not a person. An event a rep genuinely completed has a
-- check_in_time and is not touched.
--
-- No orders, invoices or amounts are altered. Only the two fields the trigger
-- wrote are put back.
update public.visits v
   set status = 'planned',
       check_out_time = null,
       updated_at = now()
  from public.activity_events ae
 where ae.visit_id = v.id
   and ae.activity_type = 'Event'
   and v.status = 'productive'
   and v.check_in_time is null
   and coalesce(ae.status, '') <> 'closed'
   and exists (
     select 1 from public.orders o
      where o.visit_id = v.id and o.status = 'confirmed'
   );
