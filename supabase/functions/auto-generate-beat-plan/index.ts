import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetailerScore {
  retailer_id: string;
  retailer_name: string;
  beat_id: string;
  beat_name: string;
  priority_score: number;
  reasons: string[];
  days_since_last_visit: number;
  pending_amount: number;
  potential: string;
  avg_order_value: number;
}

interface DayPlan {
  day: string;
  date: string;
  beat_id: string;
  beat_name: string;
  retailers: RetailerScore[];
  estimated_value: number;
  is_prescheduled: boolean;
  rationale: string;
}

interface BeatRationale {
  beat_id: string;
  beat_name: string;
  date: string;
  day: string;
  is_prescheduled: boolean;
  rationale: string;
  factors: {
    retailer_count: number;
    high_priority_count: number;
    pending_collections: number;
    avg_days_since_visit: number;
    estimated_value: number;
    historical_pattern_match: boolean;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { userId, forceRegenerate, previewOnly, fromDate, toDate } = await req.json().catch(() => ({}));

    console.log('🗓️ Starting auto-generate-beat-plan', { userId, forceRegenerate, previewOnly, fromDate, toDate });

    // Get users (specific user if provided)
    let usersQuery = supabaseClient
      .from('profiles')
      .select('id, full_name');
    
    if (userId) {
      usersQuery = usersQuery.eq('id', userId);
    }

    const { data: users, error: usersError } = await usersQuery;
    if (usersError) throw usersError;

    console.log(`📊 Processing ${users?.length || 0} users`);

    const results = [];

    for (const user of users || []) {
      try {
        console.log(`👤 Generating plan for user: ${user.full_name} (${user.id})`);
        
        // Get planning dates: explicit range if provided, otherwise default (rest of week + next week)
        const planningDays = getPlanningDays(fromDate, toDate);
        console.log(`📅 Planning for ${planningDays.length} days:`, planningDays.map(d => d.date));

        if (planningDays.length === 0) {
          results.push({ userId: user.id, status: 'skipped', reason: 'No planning days in range' });
          continue;
        }

        // Fetch existing beat plans (pre-scheduled / recurring)
        const { data: existingPlans } = await supabaseClient
          .from('beat_plans')
          .select('*')
          .eq('user_id', user.id)
          .gte('plan_date', planningDays[0].date)
          .lte('plan_date', planningDays[planningDays.length - 1].date);

        const existingPlansByDate: { [date: string]: any } = {};
        (existingPlans || []).forEach(plan => {
          // Only consider non-auto-generated plans as pre-scheduled
          if (!plan.beat_data?.auto_generated) {
            existingPlansByDate[plan.plan_date] = plan;
          }
        });

        console.log(`📌 Found ${Object.keys(existingPlansByDate).length} pre-scheduled beats`);

        // Fetch user's beats (owned by the user — created_by may be an admin)
        const { data: beats } = await supabaseClient
          .from('beats')
          .select('*')
          .or(`owner_id.eq.${user.id},user_id.eq.${user.id}`)
          .eq('is_active', true);

        if (!beats || beats.length === 0) {
          console.log(`⚠️ No active beats for ${user.full_name}`);
          results.push({ userId: user.id, status: 'skipped', reason: 'No active beats' });
          continue;
        }

        // Fetch user's retailers with scoring data
        const { data: retailers } = await supabaseClient
          .from('retailers')
          .select('id, name, beat_id, beat_name, potential, pending_amount, last_visit_date, order_value, priority, status')
          .eq('user_id', user.id)
          .eq('status', 'active');

        if (!retailers || retailers.length === 0) {
          console.log(`⚠️ No active retailers for ${user.full_name}`);
          results.push({ userId: user.id, status: 'skipped', reason: 'No active retailers' });
          continue;
        }

        // Fetch recent orders for order pattern analysis
        const { data: recentOrders } = await supabaseClient
          .from('orders')
          .select('retailer_id, total_amount, created_at')
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

        // Fetch recent visits for visit pattern analysis
        const { data: recentVisits } = await supabaseClient
          .from('visits')
          .select('retailer_id, status, created_at')
          .eq('user_id', user.id)
          .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

        // Fetch historical beat plans for pattern analysis
        const { data: historicalPlans } = await supabaseClient
          .from('beat_plans')
          .select('beat_id, plan_date')
          .eq('user_id', user.id)
          .gte('plan_date', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

        // Score retailers
        const scoredRetailers = scoreRetailers(retailers, recentOrders || [], recentVisits || []);
        
        // Generate weekly plan respecting pre-scheduled beats
        const weeklyPlan = generateWeeklyPlan(
          beats,
          scoredRetailers,
          planningDays,
          historicalPlans || [],
          existingPlansByDate
        );

        // Build rationale for each day
        const planRationales: BeatRationale[] = weeklyPlan
          .filter(day => day.beat_id)
          .map(day => ({
            beat_id: day.beat_id,
            beat_name: day.beat_name,
            date: day.date,
            day: day.day,
            is_prescheduled: day.is_prescheduled,
            rationale: day.rationale,
            factors: {
              retailer_count: day.retailers.length,
              high_priority_count: day.retailers.filter(r => r.priority_score > 70).length,
              pending_collections: day.retailers.reduce((sum, r) => sum + r.pending_amount, 0),
              avg_days_since_visit: day.retailers.length > 0 
                ? Math.round(day.retailers.reduce((sum, r) => sum + r.days_since_last_visit, 0) / day.retailers.length)
                : 0,
              estimated_value: day.estimated_value,
              historical_pattern_match: false, // Will be set in generateWeeklyPlan
            },
          }));

        // Save beat plans to database (only for days without pre-scheduled beats)
        const plansToInsert = weeklyPlan
          .filter(day => day.beat_id && !day.is_prescheduled)
          .map(day => ({
            user_id: user.id,
            beat_id: day.beat_id,
            beat_name: day.beat_name,
            plan_date: day.date,
            beat_data: {
              auto_generated: true,
              generated_at: new Date().toISOString(),
              rationale: day.rationale,
              retailers: day.retailers.map(r => ({
                id: r.retailer_id,
                name: r.retailer_name,
                priority_score: r.priority_score,
                reasons: r.reasons,
              })),
              estimated_value: day.estimated_value,
            },
          }));

        if (previewOnly) {
          // Preview mode: do not write anything, just return the proposed plan
          results.push({
            userId: user.id,
            userName: user.full_name,
            status: 'success',
            plansCreated: 0,
            prescheduledPreserved: Object.keys(existingPlansByDate).length,
            planningPeriod: {
              start: planningDays[0].date,
              end: planningDays[planningDays.length - 1].date,
            },
            rationales: planRationales,
            weeklyPlan: weeklyPlan.filter(d => d.beat_id),
            previewOnly: true,
          });
          continue;
        }

        if (plansToInsert.length > 0) {
          // Delete existing auto-generated plans for these dates
          if (forceRegenerate) {
            const datesToDelete = plansToInsert.map(p => p.plan_date);
            for (const dateToDelete of datesToDelete) {
              // Only delete auto-generated plans, preserve manual ones
              const { data: existingForDate } = await supabaseClient
                .from('beat_plans')
                .select('id, beat_data')
                .eq('user_id', user.id)
                .eq('plan_date', dateToDelete);
              
              const autoGeneratedIds = (existingForDate || [])
                .filter(p => p.beat_data?.auto_generated)
                .map(p => p.id);
              
              if (autoGeneratedIds.length > 0) {
                await supabaseClient
                  .from('beat_plans')
                  .delete()
                  .in('id', autoGeneratedIds);
              }
            }
          }

          const { error: insertError } = await supabaseClient
            .from('beat_plans')
            .insert(plansToInsert);

          if (insertError) {
            console.error(`❌ Error inserting plans for ${user.full_name}:`, insertError);
            results.push({ userId: user.id, status: 'error', error: insertError.message });
            continue;
          }

          console.log(`✅ Created ${plansToInsert.length} beat plans for ${user.full_name}`);
          
          // Log the autonomous action
          try {
            await supabaseClient
              .from('ai_autonomous_actions')
              .insert({
                user_id: user.id,
                action_type: 'auto_beat_plan',
                action_data: {
                  planning_period: {
                    start: planningDays[0].date,
                    end: planningDays[planningDays.length - 1].date,
                  },
                  plans_created: plansToInsert.length,
                  prescheduled_preserved: Object.keys(existingPlansByDate).length,
                  total_retailers: plansToInsert.reduce((acc, p) => acc + (p.beat_data.retailers?.length || 0), 0),
                  estimated_value: plansToInsert.reduce((acc, p) => acc + (p.beat_data.estimated_value || 0), 0),
                  rationales: planRationales,
                },
                status: 'executed',
                executed_at: new Date().toISOString(),
                can_undo: true,
                undo_until: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              });
          } catch (actionErr) {
            console.log('Could not log autonomous action:', actionErr);
          }

          results.push({ 
            userId: user.id, 
            userName: user.full_name,
            status: 'success', 
            plansCreated: plansToInsert.length,
            prescheduledPreserved: Object.keys(existingPlansByDate).length,
            planningPeriod: {
              start: planningDays[0].date,
              end: planningDays[planningDays.length - 1].date,
            },
            rationales: planRationales,
            weeklyPlan: weeklyPlan.filter(d => d.beat_id),
          });
        } else {
          // All days are pre-scheduled, return the existing plan info
          results.push({ 
            userId: user.id, 
            userName: user.full_name,
            status: 'success', 
            plansCreated: 0,
            prescheduledPreserved: Object.keys(existingPlansByDate).length,
            planningPeriod: {
              start: planningDays[0].date,
              end: planningDays[planningDays.length - 1].date,
            },
            rationales: planRationales,
            weeklyPlan: weeklyPlan.filter(d => d.beat_id),
            message: 'All days have pre-scheduled beats',
          });
        }

      } catch (userError: any) {
        console.error(`❌ Error processing user ${user.id}:`, userError);
        results.push({ userId: user.id, status: 'error', error: userError.message });
      }
    }

    console.log('🏁 Auto-generate-beat-plan completed', { 
      totalUsers: users?.length || 0,
      successful: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
    });

    return new Response(JSON.stringify({ 
      success: true, 
      results,
      summary: {
        totalUsers: users?.length || 0,
        successful: results.filter(r => r.status === 'success').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        errors: results.filter(r => r.status === 'error').length,
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Fatal error in auto-generate-beat-plan:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Get planning days: only FUTURE dates (exclude today/past)
// - From tomorrow through this week's Saturday (Mon–Sat)
// - Plus the following week Monday–Saturday
function getPlanningDays(): { day: string; date: string }[] {
  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Start from tomorrow
  const start = new Date(now);
  start.setDate(now.getDate() + 1);

  // Skip Sundays (off day)
  if (start.getDay() === 0) {
    start.setDate(start.getDate() + 1);
  }

  const result: { day: string; date: string }[] = [];

  // Safety: if we somehow landed on Sunday again, return empty
  if (start.getDay() === 0) return result;

  // End of the first planning week = Saturday of start's week
  const endOfWeekSaturday = new Date(start);
  endOfWeekSaturday.setDate(start.getDate() + (6 - start.getDay()));

  // Add dates from start -> Saturday (Mon–Sat)
  for (let d = new Date(start); d <= endOfWeekSaturday; d.setDate(d.getDate() + 1)) {
    result.push({
      day: dayNames[d.getDay()],
      date: d.toISOString().split('T')[0],
    });
  }

  // Next planning week Monday (skip Sunday)
  const nextWeekMonday = new Date(endOfWeekSaturday);
  nextWeekMonday.setDate(endOfWeekSaturday.getDate() + 2);

  // Add next week Monday–Saturday (6 days)
  for (let i = 0; i < 6; i++) {
    const d = new Date(nextWeekMonday);
    d.setDate(nextWeekMonday.getDate() + i);
    result.push({
      day: dayNames[d.getDay()],
      date: d.toISOString().split('T')[0],
    });
  }

  return result;
}

// Score retailers based on multiple factors
function scoreRetailers(
  retailers: any[],
  orders: any[],
  visits: any[]
): RetailerScore[] {
  const today = new Date();
  
  // Create order lookup by retailer
  const ordersByRetailer = orders.reduce((acc: any, order: any) => {
    if (!acc[order.retailer_id]) acc[order.retailer_id] = [];
    acc[order.retailer_id].push(order);
    return acc;
  }, {});

  // Create visit lookup by retailer
  const visitsByRetailer = visits.reduce((acc: any, visit: any) => {
    if (!acc[visit.retailer_id]) acc[visit.retailer_id] = [];
    acc[visit.retailer_id].push(visit);
    return acc;
  }, {});

  return retailers.map(retailer => {
    const reasons: string[] = [];
    let score = 50; // Base score

    // Factor 1: Days since last visit (0-30 points)
    const lastVisit = retailer.last_visit_date ? new Date(retailer.last_visit_date) : null;
    const daysSinceLastVisit = lastVisit 
      ? Math.floor((today.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (daysSinceLastVisit > 30) {
      score += 30;
      reasons.push(`Not visited in ${daysSinceLastVisit} days`);
    } else if (daysSinceLastVisit > 14) {
      score += 20;
      reasons.push(`Last visit ${daysSinceLastVisit} days ago`);
    } else if (daysSinceLastVisit > 7) {
      score += 10;
    }

    // Factor 2: Pending collections (0-25 points)
    const pendingAmount = Number(retailer.pending_amount) || 0;
    if (pendingAmount > 10000) {
      score += 25;
      reasons.push(`High pending: ₹${pendingAmount.toLocaleString()}`);
    } else if (pendingAmount > 5000) {
      score += 15;
      reasons.push(`Pending: ₹${pendingAmount.toLocaleString()}`);
    } else if (pendingAmount > 0) {
      score += 5;
    }

    // Factor 3: Potential level (0-20 points)
    const potential = retailer.potential?.toLowerCase() || 'medium';
    if (potential === 'high') {
      score += 20;
      reasons.push('High potential retailer');
    } else if (potential === 'medium') {
      score += 10;
    }

    // Factor 4: Order value and frequency (0-15 points)
    const retailerOrders = ordersByRetailer[retailer.id] || [];
    const avgOrderValue = retailerOrders.length > 0
      ? retailerOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount), 0) / retailerOrders.length
      : Number(retailer.order_value) || 0;

    if (avgOrderValue > 10000) {
      score += 15;
      reasons.push(`High value: ₹${Math.round(avgOrderValue).toLocaleString()} avg`);
    } else if (avgOrderValue > 5000) {
      score += 10;
    } else if (avgOrderValue > 1000) {
      score += 5;
    }

    // Factor 5: Priority flag (0-10 points)
    if (retailer.priority === 'high') {
      score += 10;
      if (!reasons.includes('High potential retailer')) {
        reasons.push('Marked as high priority');
      }
    }

    // Ensure at least one reason
    if (reasons.length === 0) {
      reasons.push('Regular visit schedule');
    }

    return {
      retailer_id: retailer.id,
      retailer_name: retailer.name,
      beat_id: retailer.beat_id,
      beat_name: retailer.beat_name || '',
      priority_score: Math.min(score, 100),
      reasons,
      days_since_last_visit: daysSinceLastVisit,
      pending_amount: pendingAmount,
      potential: retailer.potential || 'medium',
      avg_order_value: avgOrderValue,
    };
  });
}

// Generate optimized weekly plan respecting pre-scheduled beats
function generateWeeklyPlan(
  beats: any[],
  scoredRetailers: RetailerScore[],
  planningDays: { day: string; date: string }[],
  historicalPlans: any[],
  existingPlansByDate: { [date: string]: any }
): DayPlan[] {
  // Group retailers by beat
  const retailersByBeat: { [key: string]: RetailerScore[] } = {};
  scoredRetailers.forEach(retailer => {
    if (!retailersByBeat[retailer.beat_id]) {
      retailersByBeat[retailer.beat_id] = [];
    }
    retailersByBeat[retailer.beat_id].push(retailer);
  });

  // Sort retailers within each beat by priority score
  Object.keys(retailersByBeat).forEach(beatId => {
    retailersByBeat[beatId].sort((a, b) => b.priority_score - a.priority_score);
  });

  // Analyze historical patterns for optimal day assignment
  const beatDayPreference: { [key: string]: { [day: string]: number } } = {};
  historicalPlans.forEach(plan => {
    const dayOfWeek = new Date(plan.plan_date).getDay();
    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek];
    if (!beatDayPreference[plan.beat_id]) {
      beatDayPreference[plan.beat_id] = {};
    }
    beatDayPreference[plan.beat_id][dayName] = (beatDayPreference[plan.beat_id][dayName] || 0) + 1;
  });

  // Score beats for prioritization
  const beatScores = beats.map(beat => {
    const beatRetailers = retailersByBeat[beat.beat_id] || [];
    const totalScore = beatRetailers.reduce((sum, r) => sum + r.priority_score, 0);
    const totalPending = beatRetailers.reduce((sum, r) => sum + r.pending_amount, 0);
    const totalValue = beatRetailers.reduce((sum, r) => sum + r.avg_order_value, 0);
    const avgDaysSinceVisit = beatRetailers.length > 0 
      ? beatRetailers.reduce((sum, r) => sum + r.days_since_last_visit, 0) / beatRetailers.length
      : 0;
    
    return {
      ...beat,
      retailerCount: beatRetailers.length,
      totalScore,
      totalPending,
      totalValue,
      avgScore: beatRetailers.length > 0 ? totalScore / beatRetailers.length : 0,
      avgDaysSinceVisit,
    };
  }).sort((a, b) => b.avgScore - a.avgScore);

  // Assign beats to days (fills every day; cycles beats if beats < days)
  const weeklyPlan: DayPlan[] = [];
  let usedBeats = new Set<string>();
  let lastAssignedBeatId: string | null = null;

  const evaluateBeatForDay = (beat: any, dayName: string) => {
    let score = beat.avgScore;
    const dayPrefs = beatDayPreference[beat.beat_id];
    let hasHistoricalMatch = false;

    if (dayPrefs && dayPrefs[dayName]) {
      score += dayPrefs[dayName] * 5; // Bonus for historical pattern
      hasHistoricalMatch = true;
    }

    return { score, hasHistoricalMatch };
  };

  const pickBestBeat = (dayName: string, predicate: (b: any) => boolean) => {
    let best: any = null;
    let bestScore = -Infinity;

    for (const beat of beatScores) {
      if (beat.retailerCount === 0) continue;
      if (!predicate(beat)) continue;

      const { score, hasHistoricalMatch } = evaluateBeatForDay(beat, dayName);
      if (score > bestScore) {
        bestScore = score;
        best = { ...beat, hasHistoricalMatch };
      }
    }

    return best;
  };

  planningDays.forEach(({ day, date }) => {
    // Check if there's a pre-scheduled beat for this date
    const prescheduled = existingPlansByDate[date];
    if (prescheduled) {
      const beatRetailers = retailersByBeat[prescheduled.beat_id] || [];
      const topRetailers = beatRetailers.slice(0, 15);

      weeklyPlan.push({
        day,
        date,
        beat_id: prescheduled.beat_id,
        beat_name: prescheduled.beat_name,
        retailers: topRetailers,
        estimated_value: topRetailers.reduce((sum, r) => sum + r.avg_order_value, 0),
        is_prescheduled: true,
        rationale: `Pre-scheduled beat - This beat was manually planned and preserved.`,
      });

      // Keep consecutive-day de-duplication working even across prescheduled days
      lastAssignedBeatId = prescheduled.beat_id;
      return;
    }

    // Pick the best beat; prefer variety, but never leave days blank.
    let bestBeat =
      pickBestBeat(day, (b) => !usedBeats.has(b.beat_id) && b.beat_id !== lastAssignedBeatId) ||
      pickBestBeat(day, (b) => !usedBeats.has(b.beat_id));

    // If all beats are used, reset and cycle again.
    if (!bestBeat) {
      usedBeats = new Set<string>();
      bestBeat =
        pickBestBeat(day, (b) => b.beat_id !== lastAssignedBeatId) ||
        pickBestBeat(day, () => true);
    }

    if (bestBeat) {
      usedBeats.add(bestBeat.beat_id);
      lastAssignedBeatId = bestBeat.beat_id;

      const beatRetailers = retailersByBeat[bestBeat.beat_id] || [];
      const topRetailers = beatRetailers.slice(0, 15);

      // Build rationale
      const rationalePoints: string[] = [];

      if (bestBeat.hasHistoricalMatch) {
        rationalePoints.push(`Matches your historical pattern for ${day}s`);
      }

      if (bestBeat.avgDaysSinceVisit > 14) {
        rationalePoints.push(
          `Retailers need attention (avg ${Math.round(bestBeat.avgDaysSinceVisit)} days since last visit)`
        );
      }

      if (bestBeat.totalPending > 5000) {
        rationalePoints.push(`₹${Math.round(bestBeat.totalPending).toLocaleString()} in pending collections`);
      }

      const highPriorityCount = beatRetailers.filter((r) => r.priority_score > 70).length;
      if (highPriorityCount > 0) {
        rationalePoints.push(`${highPriorityCount} high-priority retailers`);
      }

      if (rationalePoints.length === 0) {
        rationalePoints.push('Best available beat based on overall scoring');
      }

      weeklyPlan.push({
        day,
        date,
        beat_id: bestBeat.beat_id,
        beat_name: bestBeat.beat_name,
        retailers: topRetailers,
        estimated_value: topRetailers.reduce((sum, r) => sum + r.avg_order_value, 0),
        is_prescheduled: false,
        rationale: rationalePoints.join(' • '),
      });
    } else {
      // No available beat for this day
      weeklyPlan.push({
        day,
        date,
        beat_id: '',
        beat_name: '',
        retailers: [],
        estimated_value: 0,
        is_prescheduled: false,
        rationale: 'No beats available for this day',
      });
    }
  });

  return weeklyPlan;
}
