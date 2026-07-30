import { supabase } from "@/integrations/supabase/client";
import { awardGamificationEvent, stableEventId } from "@/utils/gamificationEventDispatcher";

/**
 * Gamification award entry points.
 *
 * These are thin adapters ONLY. No trigger names, points, conditions, caps,
 * eligibility or thresholds are hardcoded here — every rule lives in
 * `gamification_games` / `gamification_actions` and is evaluated server-side by
 * the `gam_award_event` Postgres function. Each function below simply reports
 * the raw facts of a domain event so admin-configured conditions can match.
 */

interface OrderContext {
  userId: string;
  retailerId: string;
  orderValue: number;
  orderItems: { product_id: string; quantity: number }[];
  isFirstOrder?: boolean;
  /** 'cash' | 'upi' | 'cheque' | 'credit' … used by condition rules */
  paymentMode?: string;
  /** Order row id — used by the engine for idempotency */
  orderId?: string | null;
}

interface VisitContext {
  userId: string;
  retailerId: string;
  hasOrder: boolean;
  visitId?: string | null;
}

const today = () => new Date().toISOString().split("T")[0];

/** Facts about the order, dispatched to every order-related trigger. */
export async function awardPointsForOrder(context: OrderContext) {
  const { userId, retailerId, orderValue, orderItems, isFirstOrder, paymentMode, orderId } = context;
  if (!userId || !retailerId) return;

  const productIds = Array.from(new Set((orderItems || []).map((i) => i.product_id).filter(Boolean)));
  let focusedCount = 0;
  if (productIds.length) {
    const { count } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .in("id", productIds)
      .eq("is_focused", true);
    focusedCount = count ?? 0;
  }

  // Consecutive-order count for this retailer (maintained by updateRetailerSequence)
  const { data: seq } = await supabase
    .from("gamification_retailer_sequences")
    .select("consecutive_orders")
    .eq("user_id", userId)
    .eq("retailer_id", retailerId)
    .maybeSingle();

  const totalQuantity = (orderItems || []).reduce((s, i) => s + Number(i.quantity || 0), 0);
  const reference = orderId ?? stableEventId(userId, retailerId, "order", today(), orderValue);

  const facts = {
    order_value: Number(orderValue || 0),
    payment_mode: paymentMode ?? null,
    item_count: productIds.length,
    total_quantity: totalQuantity,
    is_first_order: !!isFirstOrder,
    focused_product_count: focusedCount,
    has_focused_product: focusedCount > 0,
    consecutive_orders: Number(seq?.consecutive_orders || 1),
    retailer_id: retailerId,
  };

  const base = { referenceType: "order", referenceId: reference, retailerId, userId, context: facts };

  await awardGamificationEvent("order_placed", base);
  await awardGamificationEvent("order_frequency", base);
  if (focusedCount > 0) {
    await awardGamificationEvent("focused_product_sales", base);
    await awardGamificationEvent("new_product_introduction", base);
  }
  if (isFirstOrder) {
    await awardGamificationEvent("first_order_new_retailer", base);
  }
}

/** Keeps the consecutive-order counter up to date (data only, no award logic). */
export async function updateRetailerSequence(userId: string, retailerId: string) {
  const todayStr = today();

  const { data: existing } = await supabase
    .from("gamification_retailer_sequences")
    .select("*")
    .eq("user_id", userId)
    .eq("retailer_id", retailerId)
    .maybeSingle();

  if (existing) {
    const lastOrderDate = existing.last_order_date ? existing.last_order_date.split("T")[0] : null;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    let newCount = 1;
    if (lastOrderDate === yesterdayStr) {
      newCount = (existing.consecutive_orders || 0) + 1;
    } else if (lastOrderDate === todayStr) {
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
  const { userId, retailerId, hasOrder, visitId } = context;
  if (!userId || !retailerId) return;
  await awardGamificationEvent("productive_visit", {
    referenceType: "visit",
    referenceId: visitId ?? stableEventId(userId, retailerId, "visit", today()),
    retailerId,
    userId,
    context: { has_order: !!hasOrder, retailer_id: retailerId },
  });
}

export async function awardPointsForCompetitionData(userId: string, retailerId: string) {
  await awardGamificationEvent("competition_insight", {
    referenceType: "competition_data",
    referenceId: stableEventId(userId, retailerId, "competition_insight", today()),
    retailerId,
    userId,
    context: { retailer_id: retailerId },
  });
}

export async function awardPointsForRetailerFeedback(userId: string, retailerId: string) {
  await awardGamificationEvent("retailer_feedback", {
    referenceType: "retailer_feedback",
    referenceId: stableEventId(userId, retailerId, "retailer_feedback", today()),
    retailerId,
    userId,
    context: { retailer_id: retailerId },
  });
}

export async function awardPointsForBrandingRequest(userId: string, retailerId: string) {
  await awardGamificationEvent("branding_request", {
    referenceType: "branding_request",
    referenceId: stableEventId(userId, retailerId, "branding_request", today()),
    retailerId,
    userId,
    context: { retailer_id: retailerId },
  });
}

/**
 * Daily visit-count milestone. The threshold itself is a condition on the
 * activity (e.g. visit_count >= 20) — we only report the count.
 */
export async function awardPointsForTotalVisits(userId: string, visitDate: string) {
  if (!userId || !visitDate) return;
  const { count: completedVisits } = await supabase
    .from("visits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("planned_date", visitDate)
    .in("status", ["productive", "unproductive"]);

  if (!completedVisits) return;

  const { count: productiveVisits } = await supabase
    .from("visits")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("planned_date", visitDate)
    .eq("status", "productive");

  await awardGamificationEvent("total_visits", {
    referenceType: "visit_day",
    referenceId: stableEventId(userId, "total_visits", visitDate),
    userId,
    context: {
      visit_count: Number(completedVisits || 0),
      productive_visit_count: Number(productiveVisits || 0),
      visit_date: visitDate,
    },
  });
}

/** Approved (non-LOP-agnostic) leave days taken by a user in a given month. */
async function getLeaveDaysThisMonth(userId: string, ref: Date): Promise<number> {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("leave_applications")
    .select("days_requested, start_date, end_date, status")
    .eq("user_id", userId)
    .in("status", ["approved", "pending"])
    .lte("start_date", iso(end))
    .gte("end_date", iso(start));

  if (error || !data) return 0;
  return data.reduce((sum, row: any) => sum + Number(row.days_requested || 1), 0);
}

/** Attendance check-in event (trigger + thresholds configured in admin). */
export async function awardPointsForAttendance(params: {
  userId: string;
  attendanceId?: string | null;
  checkInTime?: string | Date | null;
  streakDays?: number | null;
}) {
  const { userId, attendanceId, checkInTime, streakDays } = params;
  if (!userId) return;
  const d = checkInTime ? new Date(checkInTime) : new Date();
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const leaveDays = await getLeaveDaysThisMonth(userId, d);

  const facts = {
    check_in_hour: d.getHours() + d.getMinutes() / 60,
    streak_days: streakDays ?? null,
    leave_days_this_month: leaveDays,
    no_leave_this_month: leaveDays === 0,
    is_month_end: d.getDate() === monthEnd.getDate(),
    month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
  };
  const ref = attendanceId ?? stableEventId(userId, "attendance", today());
  await awardGamificationEvent("attendance_on_time", {
    referenceType: "attendance",
    referenceId: ref,
    userId,
    context: facts,
  });
  await awardGamificationEvent("attendance_streak", {
    referenceType: "attendance",
    referenceId: stableEventId(userId, "attendance_streak", today()),
    userId,
    context: facts,
  });
}

