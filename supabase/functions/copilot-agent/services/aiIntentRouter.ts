// Short-lived AI fallback for intent routing.
// Only runs when the existing regex classifier finds no match.
// Never throws: any failure/timeout resolves to "none".
import { MODEL, TOGETHER_URL } from "../config.ts";

export const KNOWN_INTENTS = [
  "leave",
  "attendance",
  "beats",
  "collections",
  "visits",
  "targets",
] as const;

export type RoutedIntent = (typeof KNOWN_INTENTS)[number];

export interface AiRouteResult {
  intent: RoutedIntent | null;
  raw: string;
  latencyMs: number;
}

const ROUTER_TIMEOUT_MS = 3000;

const SYSTEM_PROMPT = [
  "You classify a field-sales app user's message into exactly one intent label.",
  'Reply with strict JSON only, exactly: {"intent": "<label>"} — no prose, no markdown, no explanation.',
  'Allowed labels: "leave", "attendance", "beats", "collections", "visits", "targets", "none".',
  "Use \"none\" when the message does not clearly match any label.",
  "Examples:",
  'leave — "hw many days leave i have left", "kitni chutti bachi hai"',
  'attendance — "did i mark present today", "my punch in records this week"',
  'beats — "summarise my last three beats", "recent beat routes covered"',
  'collections — "how much money is still to be collected", "pending outstanding from retailers"',
  'visits — "plan my visits for today", "which shops should i prioritise now"',
  'targets — "am i close to my monthly goal", "sales target achievement"',
  'none — "hello", "who won the match", "tell me a joke"',
].join("\n");

export async function routeIntentWithAi(
  apiKey: string,
  message: string,
): Promise<AiRouteResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTER_TIMEOUT_MS);
  let raw = "";
  try {
    const response = await fetch(TOGETHER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        temperature: 0,
        max_tokens: 20,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
      }),
    });
    if (!response.ok) {
      raw = `http_${response.status}`;
      return { intent: null, raw, latencyMs: Date.now() - startedAt };
    }
    const payload = await response.json();
    raw = String(payload?.choices?.[0]?.message?.content ?? "").trim();
    return { intent: parseIntent(raw), raw, latencyMs: Date.now() - startedAt };
  } catch (error) {
    raw = error instanceof Error ? `error:${error.name}` : "error";
    return { intent: null, raw, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

function parseIntent(raw: string): RoutedIntent | null {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const value = parsed?.intent;
    if (typeof value !== "string") return null;
    const normalized = value.trim().toLowerCase();
    return (KNOWN_INTENTS as readonly string[]).includes(normalized)
      ? (normalized as RoutedIntent)
      : null;
  } catch {
    return null;
  }
}
