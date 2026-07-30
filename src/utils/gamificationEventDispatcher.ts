import { supabase } from "@/integrations/supabase/client";

/**
 * Generic, data-driven gamification dispatcher.
 *
 * NOTHING about triggers, points, conditions, caps or eligibility lives here.
 * All of that is configured in `gamification_games` / `gamification_actions`
 * and evaluated server-side by the `gam_award_event` Postgres function.
 *
 * Call this after a domain event happens and pass the raw facts of the event
 * as `context` so admin-configured conditions can be evaluated against them.
 */
export interface GamEventOptions {
  /** e.g. 'retailer' | 'order' | 'visit' */
  referenceType?: string;
  /** Row id of the thing that caused the event — used for idempotency */
  referenceId?: string | null;
  retailerId?: string | null;
  /** Facts of the event, keyed by the condition field names shown in the admin UI */
  context?: Record<string, any>;
  /** Override the acting user (defaults to the signed-in user) */
  userId?: string | null;
}

export interface GamAwardRow {
  action_id: string;
  action_name: string;
  points: number;
  awarded: boolean;
  reason: string | null;
}

const dispatchPointsEarnedEvent = () => {
  if (typeof window === "undefined") return;
  const todayDate = new Date().toISOString().split("T")[0];
  window.dispatchEvent(new CustomEvent("pointsEarned", { detail: { date: todayDate } }));
};

export async function awardGamificationEvent(
  triggerType: string,
  opts: GamEventOptions = {}
): Promise<GamAwardRow[]> {
  try {
    let userId = opts.userId ?? null;
    if (!userId) {
      const { data: auth } = await supabase.auth.getUser();
      userId = auth?.user?.id ?? null;
    }
    if (!userId) return [];

    const { data, error } = await supabase.rpc("gam_award_event" as any, {
      p_user_id: userId,
      p_trigger_type: triggerType,
      p_reference_type: opts.referenceType ?? null,
      p_reference_id: opts.referenceId ?? null,
      p_retailer_id: opts.retailerId ?? null,
      p_context: (opts.context ?? {}) as any,
      p_dry_run: null,
    });

    if (error) {
      console.warn("[gamification] gam_award_event failed:", error.message);
      return [];
    }

    const rows = (data ?? []) as GamAwardRow[];
    if (rows.some((r) => r.awarded)) dispatchPointsEarnedEvent();
    if (rows.length) {
      console.log(`[gamification] ${triggerType} →`, rows.map((r) => `${r.action_name}: ${r.reason}`).join(", "));
    }
    return rows;
  } catch (e: any) {
    console.warn("[gamification] dispatcher error:", e?.message || e);
    return [];
  }
}

/** Convenience wrapper for the "new retailer added" trigger. */
export function awardRetailerCreated(retailer: {
  id: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  source?: string | null;
}) {
  const hasGps = !!retailer.latitude && !!retailer.longitude;
  return awardGamificationEvent("retailer_created", {
    referenceType: "retailer",
    referenceId: retailer.id,
    retailerId: retailer.id,
    context: { has_gps: hasGps, source: retailer.source ?? null },
  });
}

/** Convenience wrapper for the "retailer verified" trigger. */
export function awardRetailerVerified(retailerId: string, verificationScore?: number | null) {
  return awardGamificationEvent("retailer_verified", {
    referenceType: "retailer",
    referenceId: retailerId,
    retailerId,
    context: { verification_score: verificationScore ?? null },
  });
}

/**
 * Deterministic UUID derived from arbitrary strings.
 * Used as `reference_id` for events that have no natural row id (e.g. "20 visits
 * completed today"), so the engine's built-in idempotency check still prevents
 * double-awarding without any client-side "already awarded?" logic.
 */
export function stableEventId(...parts: (string | number | null | undefined)[]): string {
  const input = parts.map((p) => String(p ?? "")).join("|");
  const hash = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  const hex = hash(0x811c9dc5) + hash(0x01000193) + hash(0xdeadbeef) + hash(0x9e3779b9);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "5" + hex.slice(13, 16),
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}
