import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

interface Props {
  userName?: string | null;
  variant?: "full" | "compact";
}

export function WelcomeHeader({ userName, variant = "full" }: Props) {
  const first = (userName?.split(" ")[0] || "there").trim();
  const [lang, setLang] = useState<"en" | "hi">("en");

  useEffect(() => {
    const id = setInterval(() => setLang((l) => (l === "en" ? "hi" : "en")), 3000);
    return () => clearInterval(id);
  }, []);

  const message = lang === "en"
    ? `Hi ${first}! I am your QuickApp Copilot`
    : `नमस्ते ${first}! मैं आपका QuickApp Copilot हूँ`;

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 shadow-sm shadow-blue-500/30 ring-2 ring-blue-500/15">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <p
          key={lang}
          className="text-sm font-medium text-foreground animate-in fade-in duration-500"
        >
          {message}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-500 shadow-lg shadow-blue-500/30 ring-4 ring-blue-500/15">
        <Bot className="h-10 w-10 text-white" />
      </div>
      <p
        key={lang}
        className="mt-5 text-xl sm:text-2xl font-semibold text-foreground animate-in fade-in duration-500"
      >
        {message}
      </p>
    </div>
  );
}
