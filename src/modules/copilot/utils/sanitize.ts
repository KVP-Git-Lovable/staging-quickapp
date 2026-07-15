export const MAX_INPUT_CHARS = 4000;

export function sanitizeInput(raw: string): string {
  return raw.replace(/\u0000/g, "").trim().slice(0, MAX_INPUT_CHARS);
}

export function greetingForNow(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
