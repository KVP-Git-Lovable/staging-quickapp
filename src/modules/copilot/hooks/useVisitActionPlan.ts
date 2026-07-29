import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useVisitActionPlan() {
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("You are signed out. Please log in again.");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-visit-actions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
          signal: controller.signal,
        },
      );

      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      if (body?.empty) {
        setPlan(null);
        setError("No visits are planned for today.");
        return;
      }
      setPlan(String(body?.plan ?? "").trim() || null);
    } catch (err) {
      setError(
        controller.signal.aborted
          ? "The action plan took too long to prepare. Please try again."
          : err instanceof Error
            ? err.message
            : "Could not build the action plan.",
      );
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  return { plan, loading, error, generate };
}
