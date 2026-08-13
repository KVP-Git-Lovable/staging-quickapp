import { supabase } from '@/integrations/supabase/client';

/**
 * Resolves the `:id` in the /event/:id/* routes to an event.
 *
 * The id means different things depending on who is looking. The owner reaches
 * an event through `activity_events.visit_id`, which is what those routes were
 * built around. An assigned rep has their OWN visit row for the same event, so
 * their id matches nothing on activity_events and has to be resolved through
 * `visits.activity_event_id`. Older links may also carry the event id itself.
 *
 * Everything downstream — orders, stock, summary — must key off the event's
 * canonical `visit_id`, never the id from the route. Bind an order to a
 * participant's visit instead and the event splits into one order list per
 * person, which is exactly what a shared stall must not do.
 */
export async function fetchEventByRouteId(routeId: string, columns = '*') {
  const wanted = columns === '*' ? '*' : ensureColumns(columns);

  // Owner's visit id, or the event id itself.
  const { data: direct } = await supabase
    .from('activity_events')
    .select(wanted)
    .or(`id.eq.${routeId},visit_id.eq.${routeId}`)
    .limit(1)
    .maybeSingle();
  if (direct) return direct as any;

  // A participant's own visit row.
  const { data: visit } = await supabase
    .from('visits')
    .select('activity_event_id')
    .eq('id', routeId)
    .maybeSingle();
  const eventId = (visit as any)?.activity_event_id;
  if (!eventId) return null;

  const { data: viaParticipant } = await supabase
    .from('activity_events')
    .select(wanted)
    .eq('id', eventId)
    .maybeSingle();
  return (viaParticipant as any) ?? null;
}

/** Callers select narrow column lists; these two are always needed to resolve. */
function ensureColumns(columns: string) {
  const have = columns.split(',').map((c) => c.trim());
  for (const needed of ['id', 'visit_id']) {
    if (!have.includes(needed)) have.push(needed);
  }
  return have.join(',');
}
