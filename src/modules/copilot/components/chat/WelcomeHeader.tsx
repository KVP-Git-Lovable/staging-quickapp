import { greetingForNow } from "../../utils/sanitize";

export function WelcomeHeader({ userName }: { userName?: string | null }) {
  const first = (userName?.split(" ")[0] || "there").trim();
  return (
    <div className="text-center">
      <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight bg-gradient-to-br from-primary to-primary/60 bg-clip-text text-transparent">
        {greetingForNow()}, {first}
      </h1>
      <p className="mt-2 text-muted-foreground text-base">
        How can I help you today?
      </p>
    </div>
  );
}
