import { supabase } from "@/integrations/supabase/client";
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

// Helper to dispatch points earned event for instant UI updates
const dispatchPointsEarnedEvent = () => {
  const todayDate = new Date().toISOString().split('T')[0];
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('pointsEarned', { 
      detail: { date: todayDate } 
    }));
    console.log('[Gamification] Dispatched pointsEarned event for date:', todayDate);
  }
};

interface OrderContext {
  userId: string;
  retailerId: string;
  orderValue: number;
  orderItems: { product_id: string; quantity: number }[];
  isFirstOrder?: boolean;
}

interface VisitContext {
  userId: string;
  retailerId: string;
  hasOrder: boolean;
}

export async function awardPointsForOrder(context: OrderContext) {
  const { userId, retailerId, orderValue, orderItems, isFirstOrder } = context;
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const todayDateOnly = today.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Fetch user's territories
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("territories_covered, work_location")
    .eq("id", userId)
    .single();

  const userTerritories = userProfile?.territories_covered || [];
  const userLocation = userProfile?.work_location;

  // Fetch active games - use date-only comparison for proper date filtering
  const { data: activeGames } = await supabase
    .from("gamification_games")
    .select("*")
    .eq("is_active", true)
    .lte("start_date", todayDateOnly)
    .gte("end_date", todayDateOnly);

  if (!activeGames || activeGames.length === 0) return;

  // Filter games applicable to user's territory
  const applicableGames = activeGames.filter((game: any) => 
    game.is_all_territories || 
    (game.territories && game.territories.some((t: string) => 
      userTerritories.includes(t) || t === userLocation
    ))
  );

  // Fetch actions for applicable games
  const gameIds = applicableGames.map(g => g.id);
  const { data: actions } = await supabase
    .from("gamification_actions")
    .select("*")
    .in("game_id", gameIds)
    .eq("is_enabled", true);

  if (!actions || actions.length === 0) return;

  for (const action of actions) {
    const game = applicableGames.find(g => g.id === action.game_id);
    if (!game) continue;

      let shouldAward = false;
      let pointsToAward = action.points;
      let metadata: any = { order_value: orderValue, retailer_id: retailerId };

      switch (action.action_type) {
        case "first_order_new_retailer":
          if (isFirstOrder) {
            // Check if max activities limit reached
            if (action.max_awardable_activities) {
              const { count } = await supabase
                .from("gamification_points")
                .select("*", { count: "exact", head: true })
                .eq("user_id", userId)
                .eq("action_id", action.id)
                .eq("game_id", game.id);

              if (count !== null && count < action.max_awardable_activities) {
                shouldAward = true;
              }
            } else {
              shouldAward = true;
            }
          }
          break;

        case "daily_target":
          // Get user's assigned target from user_business_plans
          const dailyTargetType = action.target_type || "quantity";
          
          // Calculate FY year (April-March fiscal year)
          const todayMonth = today.getMonth();
          const todayYear = today.getFullYear();
          const fyYearCalc = todayMonth < 3 ? todayYear : todayYear + 1;
          
          // Get FY month number (April = 1, March = 12)
          const FY_MONTH_MAP: Record<number, number> = { 0: 10, 1: 11, 2: 12, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9 };
          const fyMonthNum = FY_MONTH_MAP[todayMonth];
          
          // Fetch user's business plan
          const { data: userPlanData } = await supabase
            .from("user_business_plans")
            .select("id, quantity_target, revenue_target, quantity_unit")
            .eq("user_id", userId)
            .eq("year", fyYearCalc)
            .single();
          
          if (!userPlanData) {
            console.log(`No business plan found for user ${userId} in FY ${fyYearCalc}`);
            break;
          }
          
          // Fetch monthly target breakdown
          const { data: monthlyData } = await supabase
            .from("user_business_plan_months")
            .select("quantity_target, revenue_target, working_days")
            .eq("business_plan_id", userPlanData.id)
            .eq("month_number", fyMonthNum)
            .single();
          
          // Calculate daily target (monthly target / working days)
          const workingDays = monthlyData?.working_days || 26;
          let dailyTargetValue = 0;
          let actualDayValue = 0;
          
          if (dailyTargetType === "revenue") {
            const monthlyRevTarget = monthlyData?.revenue_target || (userPlanData.revenue_target || 0) / 12;
            dailyTargetValue = monthlyRevTarget / workingDays;
            
            // Get today's actual revenue
            const { data: todayOrdersRev } = await supabase
              .from("orders")
              .select("total_amount")
              .eq("user_id", userId)
              .gte("created_at", todayStart.toISOString())
              .lte("created_at", todayEnd.toISOString());
            
            actualDayValue = todayOrdersRev?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;
            metadata.target_type = "revenue";
            metadata.daily_target = dailyTargetValue;
            metadata.actual_achieved = actualDayValue;
          } else if (dailyTargetType === "visits") {
            // For visits, use a default of 5 visits per day if no specific target
            // (visits_target doesn't exist in the schema, so we use a sensible default)
            dailyTargetValue = 5; // Default daily visit target
            
            // Get today's actual productive visits
            const { count: visitCnt } = await supabase
              .from("visits")
              .select("*", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("status", "productive")
              .gte("planned_date", todayDateOnly)
              .lte("planned_date", todayDateOnly);
            
            actualDayValue = visitCnt || 0;
            metadata.target_type = "visits";
            metadata.daily_target = dailyTargetValue;
            metadata.actual_achieved = actualDayValue;
          } else {
            // Default: quantity
            const monthlyQtyTarget = monthlyData?.quantity_target || (userPlanData.quantity_target || 0) / 12;
            dailyTargetValue = monthlyQtyTarget / workingDays;
            
            // Get today's actual quantity from orders
            const { data: todayOrderItems } = await supabase
              .from("orders")
              .select("order_items!order_items_order_id_fkey(quantity, unit)")
              .eq("user_id", userId)
              .gte("created_at", todayStart.toISOString())
              .lte("created_at", todayEnd.toISOString());
            
            // Sum quantities and convert to KG
            const totalQtyGrams = todayOrderItems?.reduce((sum, order) => {
              const orderQty = (order.order_items as any[])?.reduce(
                (itemSum, item) => {
                  const qty = Number(item.quantity) || 0;
                  const itemUnit = (item.unit || '').toLowerCase();
                  if (itemUnit === 'kg' || itemUnit === 'kgs') {
                    return itemSum + (qty * 1000);
                  }
                  return itemSum + qty;
                }, 0
              ) || 0;
              return sum + orderQty;
            }, 0) || 0;
            
            actualDayValue = totalQtyGrams / 1000; // Convert to KG
            metadata.target_type = "quantity";
            metadata.daily_target = dailyTargetValue;
            metadata.actual_achieved = actualDayValue;
          }
          
          // Check if user met the daily target
          if (dailyTargetValue > 0 && actualDayValue >= dailyTargetValue) {
            // Check if already awarded today
            const { count: alreadyAwardedToday } = await supabase
              .from("gamification_points")
              .select("*", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("action_id", action.id)
              .eq("game_id", game.id)
              .gte("earned_at", todayStart.toISOString())
              .lte("earned_at", todayEnd.toISOString());
            
            if (alreadyAwardedToday === 0) {
              shouldAward = true;
              metadata.percentage_achieved = Math.round((actualDayValue / dailyTargetValue) * 100);
            }
          }
          break;

        case "focused_product_sales":
          // Check if order contains focused products
          const focusedProducts = action.focused_products || [];
          const hasFocusedProduct = orderItems.some(item => 
            focusedProducts.includes(item.product_id)
          );

          if (hasFocusedProduct && action.max_daily_awards) {
            // Check daily limit
            const { count } = await supabase
              .from("gamification_points")
              .select("*", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("action_id", action.id)
              .eq("game_id", game.id)
              .gte("earned_at", todayStart.toISOString())
              .lte("earned_at", todayEnd.toISOString());

            if (count !== null && count < action.max_daily_awards) {
              shouldAward = true;
              metadata.focused_products = orderItems
                .filter(i => focusedProducts.includes(i.product_id))
                .map(i => i.product_id);
            }
          } else if (hasFocusedProduct) {
            shouldAward = true;
          }
          break;

        case "productive_visit":
          // Award points for productive visit (visit with order)
          if (action.max_daily_awards) {
            const { count } = await supabase
              .from("gamification_points")
              .select("*", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("action_id", action.id)
              .eq("game_id", game.id)
              .gte("earned_at", todayStart.toISOString())
              .lte("earned_at", todayEnd.toISOString());

            if (count !== null && count < action.max_daily_awards) {
              shouldAward = true;
            }
          } else {
            shouldAward = true;
          }
          break;

        case "consecutive_orders":
          // Check sequence tracking
          const { data: sequence } = await supabase
            .from("gamification_retailer_sequences")
            .select("consecutive_orders")
            .eq("user_id", userId)
            .eq("retailer_id", retailerId)
            .single();

          const consecutiveCount = (sequence?.consecutive_orders || 0) + 1;
          const requiredCount = action.consecutive_orders_required || 3;

          if (consecutiveCount >= requiredCount) {
            shouldAward = true;
            metadata.consecutive_count = consecutiveCount;
          }
          break;

        case "monthly_growth":
          // Calculate month-over-month growth
          const growthMonthStart = startOfMonth(today);
          const { data: growthMonthOrders } = await supabase
            .from("orders")
            .select("total_amount")
            .eq("user_id", userId)
            .gte("created_at", growthMonthStart.toISOString());

          const growthMonthTotal = growthMonthOrders?.reduce((sum, o) => sum + (o.total_amount || 0), 0) || 0;

          // Compare with previous month (simplified - would need proper implementation)
          const minGrowth = action.min_growth_percentage || 10;
          // For now, award if total > 0 (needs proper previous month comparison)
          if (growthMonthTotal > 0) {
            const { count } = await supabase
              .from("gamification_points")
              .select("*", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("action_id", action.id)
              .eq("game_id", game.id)
              .gte("earned_at", growthMonthStart.toISOString());

            if (count === 0) {
              shouldAward = true;
              metadata.current_month_total = growthMonthTotal;
            }
          }
          break;
      }

    // Award points if conditions met
    if (shouldAward) {
      const { error } = await supabase.from("gamification_points").insert({
        user_id: userId,
        game_id: game.id,
        action_id: action.id,
        points: pointsToAward,
        reference_type: "order",
        reference_id: retailerId,
        metadata,
      });

      if (!error) {
        console.log(`Awarded ${pointsToAward} points for ${action.action_name}`);
        dispatchPointsEarnedEvent();
      }
    }
  }
}

export async function updateRetailerSequence(userId: string, retailerId: string) {
  const today = new Date().toISOString().split('T')[0];
  
  const { data: existing } = await supabase
    .from("gamification_retailer_sequences")
    .select("*")
    .eq("user_id", userId)
    .eq("retailer_id", retailerId)
    .single();

  if (existing) {
    const lastOrderDate = existing.last_order_date ? existing.last_order_date.split('T')[0] : null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    let newCount = 1;
    if (lastOrderDate === yesterdayStr) {
      // Consecutive day
      newCount = (existing.consecutive_orders || 0) + 1;
    } else if (lastOrderDate === today) {
      // Already ordered today
      newCount = existing.consecutive_orders || 1;
    }

    await supabase
      .from("gamification_retailer_sequences")
      .update({
        consecutive_orders: newCount,
        last_order_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabase.from("gamification_retailer_sequences").insert({
      user_id: userId,
      retailer_id: retailerId,
      consecutive_orders: 1,
      last_order_date: new Date().toISOString(),
    });
  }
}

export async function awardPointsForVisitCompletion(context: VisitContext) {
  const { userId, retailerId, hasOrder } = context;
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const todayDateOnly = today.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Fetch user's territories
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("territories_covered, work_location")
    .eq("id", userId)
    .single();

  const userTerritories = userProfile?.territories_covered || [];
  const userLocation = userProfile?.work_location;

  // Fetch active games - use date-only comparison for proper date filtering
  const { data: activeGames } = await supabase
    .from("gamification_games")
    .select("*")
    .eq("is_active", true)
    .lte("start_date", todayDateOnly)
    .gte("end_date", todayDateOnly);

  if (!activeGames || activeGames.length === 0) return;

  // Filter games applicable to user's territory
  const applicableGames = activeGames.filter((game: any) => 
    game.is_all_territories || 
    (game.territories && game.territories.some((t: string) => 
      userTerritories.includes(t) || t === userLocation
    ))
  );

  // Fetch actions for applicable games
  const gameIds = applicableGames.map(g => g.id);
  const { data: actions } = await supabase
    .from("gamification_actions")
    .select("*")
    .in("game_id", gameIds)
    .eq("is_enabled", true)
    .eq("action_type", "productive_visit");

  if (!actions || actions.length === 0) return;

  for (const action of actions) {
    const game = applicableGames.find(g => g.id === action.game_id);
    if (!game) continue;

    // Award points for productive visit (only if has order)
    if (hasOrder && action.max_daily_awards) {
      const { count } = await supabase
        .from("gamification_points")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("action_id", action.id)
        .eq("game_id", game.id)
        .gte("earned_at", todayStart.toISOString())
        .lte("earned_at", todayEnd.toISOString());

      if (count !== null && count < action.max_daily_awards) {
        await supabase.from("gamification_points").insert({
          user_id: userId,
          game_id: game.id,
          action_id: action.id,
          points: action.points,
          reference_type: "visit",
          reference_id: retailerId,
          metadata: { retailer_id: retailerId, has_order: hasOrder },
        });
        console.log(`Awarded ${action.points} points for productive visit`);
        dispatchPointsEarnedEvent();
      }
    } else if (hasOrder) {
      await supabase.from("gamification_points").insert({
        user_id: userId,
        game_id: game.id,
        action_id: action.id,
        points: action.points,
        reference_type: "visit",
        reference_id: retailerId,
        metadata: { retailer_id: retailerId, has_order: hasOrder },
      });
      console.log(`Awarded ${action.points} points for productive visit`);
      dispatchPointsEarnedEvent();
    }
  }
}

export async function awardPointsForCompetitionData(userId: string, retailerId: string) {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const todayDateOnly = today.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Fetch user's territories
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("territories_covered, work_location")
    .eq("id", userId)
    .single();

  const userTerritories = userProfile?.territories_covered || [];
  const userLocation = userProfile?.work_location;

  // Fetch active games - use date-only comparison for proper date filtering
  const { data: activeGames } = await supabase
    .from("gamification_games")
    .select("*")
    .eq("is_active", true)
    .lte("start_date", todayDateOnly)
    .gte("end_date", todayDateOnly);

  if (!activeGames || activeGames.length === 0) {
    console.log('No active games found for competition data points');
    return;
  }

  // Filter games applicable to user's territory
  const applicableGames = activeGames.filter((game: any) => 
    game.is_all_territories || 
    (game.territories && game.territories.some((t: string) => 
      userTerritories.includes(t) || t === userLocation
    ))
  );

  if (applicableGames.length === 0) {
    console.log('No applicable games for user territory for competition data');
    return;
  }

  // Fetch actions for applicable games - check for both 'competition_data' and 'competition_insight' action types
  const gameIds = applicableGames.map(g => g.id);
  const { data: actions } = await supabase
    .from("gamification_actions")
    .select("*")
    .in("game_id", gameIds)
    .eq("is_enabled", true)
    .in("action_type", ["competition_data", "competition_insight"]);

  if (!actions || actions.length === 0) {
    console.log('No competition_data/competition_insight actions found');
    return;
  }

  for (const action of actions) {
    const game = applicableGames.find(g => g.id === action.game_id);
    if (!game) continue;

    // Check if already awarded today for this retailer
    const { count } = await supabase
      .from("gamification_points")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action_id", action.id)
      .eq("game_id", game.id)
      .eq("reference_id", retailerId)
      .gte("earned_at", todayStart.toISOString())
      .lte("earned_at", todayEnd.toISOString());

    if (count === 0) {
      const { error } = await supabase.from("gamification_points").insert({
        user_id: userId,
        game_id: game.id,
        action_id: action.id,
        points: action.points,
        reference_type: "competition",
        reference_id: retailerId,
        metadata: { retailer_id: retailerId },
      });
      
      if (!error) {
        console.log(`Awarded ${action.points} points for competition data capture`);
        dispatchPointsEarnedEvent();
      } else {
        console.error('Error awarding competition data points:', error);
      }
    } else {
      console.log('Competition data points already awarded today for this retailer');
    }
  }
}

export async function awardPointsForRetailerFeedback(userId: string, retailerId: string) {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const todayDateOnly = today.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Fetch user's territories
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("territories_covered, work_location")
    .eq("id", userId)
    .single();

  const userTerritories = userProfile?.territories_covered || [];
  const userLocation = userProfile?.work_location;

  // Fetch active games - use date-only comparison for proper date filtering
  const { data: activeGames } = await supabase
    .from("gamification_games")
    .select("*")
    .eq("is_active", true)
    .lte("start_date", todayDateOnly)
    .gte("end_date", todayDateOnly);

  if (!activeGames || activeGames.length === 0) {
    console.log('No active games found for retailer feedback points');
    return;
  }

  // Filter games applicable to user's territory
  const applicableGames = activeGames.filter((game: any) => 
    game.is_all_territories || 
    (game.territories && game.territories.some((t: string) => 
      userTerritories.includes(t) || t === userLocation
    ))
  );

  if (applicableGames.length === 0) {
    console.log('No applicable games for user territory for retailer feedback');
    return;
  }

  // Fetch actions for applicable games
  const gameIds = applicableGames.map(g => g.id);
  const { data: actions } = await supabase
    .from("gamification_actions")
    .select("*")
    .in("game_id", gameIds)
    .eq("is_enabled", true)
    .eq("action_type", "retailer_feedback");

  if (!actions || actions.length === 0) {
    console.log('No retailer_feedback actions found');
    return;
  }

  for (const action of actions) {
    const game = applicableGames.find(g => g.id === action.game_id);
    if (!game) continue;

    // Check if already awarded today for this retailer
    const { count } = await supabase
      .from("gamification_points")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action_id", action.id)
      .eq("game_id", game.id)
      .eq("reference_id", retailerId)
      .gte("earned_at", todayStart.toISOString())
      .lte("earned_at", todayEnd.toISOString());

    if (count === 0) {
      const { error } = await supabase.from("gamification_points").insert({
        user_id: userId,
        game_id: game.id,
        action_id: action.id,
        points: action.points,
        reference_type: "feedback",
        reference_id: retailerId,
        metadata: { retailer_id: retailerId },
      });
      
      if (!error) {
        console.log(`Awarded ${action.points} points for retailer feedback`);
        dispatchPointsEarnedEvent();
      } else {
        console.error('Error awarding retailer feedback points:', error);
      }
    } else {
      console.log('Retailer feedback points already awarded today for this retailer');
    }
  }
}

export async function awardPointsForBrandingRequest(userId: string, retailerId: string) {
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const todayDateOnly = today.toISOString().split('T')[0]; // YYYY-MM-DD format

  // Fetch user's territories
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("territories_covered, work_location")
    .eq("id", userId)
    .single();

  const userTerritories = userProfile?.territories_covered || [];
  const userLocation = userProfile?.work_location;

  // Fetch active games - use date-only comparison for proper date filtering
  const { data: activeGames } = await supabase
    .from("gamification_games")
    .select("*")
    .eq("is_active", true)
    .lte("start_date", todayDateOnly)
    .gte("end_date", todayDateOnly);

  if (!activeGames || activeGames.length === 0) {
    console.log('No active games found for branding request points');
    return;
  }

  // Filter games applicable to user's territory
  const applicableGames = activeGames.filter((game: any) => 
    game.is_all_territories || 
    (game.territories && game.territories.some((t: string) => 
      userTerritories.includes(t) || t === userLocation
    ))
  );

  if (applicableGames.length === 0) {
    console.log('No applicable games for user territory for branding request');
    return;
  }

  // Fetch actions for applicable games
  const gameIds = applicableGames.map(g => g.id);
  const { data: actions } = await supabase
    .from("gamification_actions")
    .select("*")
    .in("game_id", gameIds)
    .eq("is_enabled", true)
    .eq("action_type", "branding_request");

  if (!actions || actions.length === 0) {
    console.log('No branding_request actions found');
    return;
  }

  for (const action of actions) {
    const game = applicableGames.find(g => g.id === action.game_id);
    if (!game) continue;

    // Check if already awarded today for this retailer
    const { count } = await supabase
      .from("gamification_points")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("action_id", action.id)
      .eq("game_id", game.id)
      .eq("reference_id", retailerId)
      .gte("earned_at", todayStart.toISOString())
      .lte("earned_at", todayEnd.toISOString());

    if (count === 0) {
      const { error } = await supabase.from("gamification_points").insert({
        user_id: userId,
        game_id: game.id,
        action_id: action.id,
        points: action.points,
        reference_type: "branding",
        reference_id: retailerId,
        metadata: { retailer_id: retailerId },
      });
      
      if (!error) {
        console.log(`Awarded ${action.points} points for branding request`);
        dispatchPointsEarnedEvent();
      } else {
        console.error('Error awarding branding request points:', error);
      }
    } else {
      console.log('Branding request points already awarded today for this retailer');
    }
  }
}

/**
 * Award points for reaching total visits threshold in a day
 * Counts both productive AND unproductive visits
 * Awards once per day when threshold (default 50) is reached
 */
export async function awardPointsForTotalVisits(userId: string, visitDate: string) {
  const today = new Date(visitDate);
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);
  const todayDateOnly = visitDate;

  // Count completed visits for the day (both productive and unproductive)
  const { count: completedVisits } = await supabase
    .from("visits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("planned_date", todayDateOnly)
    .in("status", ["productive", "unproductive"]);

  if (!completedVisits) {
    console.log('[awardPointsForTotalVisits] No completed visits found');
    return;
  }

  console.log(`[awardPointsForTotalVisits] User has ${completedVisits} completed visits on ${todayDateOnly}`);

  // Fetch user's territories
  const { data: userProfile } = await supabase
    .from("profiles")
    .select("territories_covered, work_location")
    .eq("id", userId)
    .single();

  const userTerritories = userProfile?.territories_covered || [];
  const userLocation = userProfile?.work_location;

  // Fetch active games - use date-only comparison for proper date filtering
  const { data: activeGames } = await supabase
    .from("gamification_games")
    .select("*")
    .eq("is_active", true)
    .lte("start_date", todayDateOnly)
    .gte("end_date", todayDateOnly);

  if (!activeGames || activeGames.length === 0) {
    console.log('[awardPointsForTotalVisits] No active games found for this date');
    return;
  }

  // Filter games applicable to user's territory
  const applicableGames = activeGames.filter((game: any) => 
    game.is_all_territories || 
    (game.territories && game.territories.some((t: string) => 
      userTerritories.includes(t) || t === userLocation
    ))
  );

  if (applicableGames.length === 0) {
    console.log('[awardPointsForTotalVisits] No applicable games for user territory');
    return;
  }

  // Fetch total_visits actions
  const gameIds = applicableGames.map(g => g.id);
  const { data: actions } = await supabase
    .from("gamification_actions")
    .select("*")
    .in("game_id", gameIds)
    .eq("is_enabled", true)
    .eq("action_type", "total_visits");

  if (!actions || actions.length === 0) {
    console.log('[awardPointsForTotalVisits] No total_visits actions configured');
    return;
  }

  for (const action of actions) {
    const game = applicableGames.find(g => g.id === action.game_id);
    if (!game) continue;

    // Get threshold from metadata (default: 50)
    const metadata = action.metadata as { daily_visit_target?: number } | null;
    const threshold = metadata?.daily_visit_target || 50;

    console.log(`[awardPointsForTotalVisits] Checking threshold: ${completedVisits} >= ${threshold}`);

    // Check if threshold met
    if (completedVisits >= threshold) {
      // Check if already awarded today for this action
      const { count: alreadyAwarded } = await supabase
        .from("gamification_points")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("action_id", action.id)
        .eq("game_id", game.id)
        .gte("earned_at", todayStart.toISOString())
        .lte("earned_at", todayEnd.toISOString());

      if (alreadyAwarded === 0) {
        const { error } = await supabase.from("gamification_points").insert({
          user_id: userId,
          game_id: game.id,
          action_id: action.id,
          points: action.points,
          reference_type: "total_visits",
          reference_id: todayDateOnly,
          metadata: { 
            completed_visits: completedVisits,
            threshold: threshold,
            visit_date: todayDateOnly
          },
        });

        if (!error) {
          console.log(`✅ Awarded ${action.points} points for total visits (${completedVisits}/${threshold})`);
          dispatchPointsEarnedEvent();
        } else {
          console.error('[awardPointsForTotalVisits] Error awarding points:', error);
        }
      } else {
        console.log('[awardPointsForTotalVisits] Points already awarded today for this action');
      }
    }
  }
}
