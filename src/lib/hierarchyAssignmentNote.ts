/**
 * A browser-local note of what a Hierarchy Save last wrote for a plan.
 *
 * Exists so the Targets tab's "Decide later" readout can show what's actually
 * been assigned through Hierarchy for *this* plan, without querying
 * `user_business_plans` — that table has no idea which plan a row belongs to,
 * so a query by year alone pulls in whatever else has ever been saved for
 * that year. This is deliberately not that: it's this browser's own memory
 * of the plan it last saved, written at the exact moment Hierarchy's Save
 * succeeds, read back as-is. Nothing here touches the database.
 */

export interface HierarchyAssignmentNote {
  quantity: number;
  revenue: number;
  visits: number;
  /** How many people this save touched with a real (non-zero) target. */
  assignedCount: number;
  savedAt: string;
}

const keyFor = (planId: string) => `kvp:hierarchy-assignment:${planId}`;

export function writeHierarchyAssignmentNote(planId: string, note: Omit<HierarchyAssignmentNote, 'savedAt'>): void {
  try {
    window.localStorage.setItem(keyFor(planId), JSON.stringify({ ...note, savedAt: new Date().toISOString() }));
  } catch {
    // Storage disabled or full — the note is a convenience, not a requirement.
  }
}

export function readHierarchyAssignmentNote(planId: string | undefined): HierarchyAssignmentNote | null {
  if (!planId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(planId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      quantity: Number(parsed.quantity) || 0,
      revenue: Number(parsed.revenue) || 0,
      visits: Number(parsed.visits) || 0,
      assignedCount: Number(parsed.assignedCount) || 0,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
}
