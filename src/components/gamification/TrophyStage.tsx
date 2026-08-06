import trophy3d from "@/assets/gamification-trophy-3d.png";
import { cn } from "@/lib/utils";

interface TrophyStageProps {
  className?: string;
  /** Hide the podium disc (useful in tight inline spots). */
  podium?: boolean;
}

const SPARKLES = [
  { top: "8%", left: "16%", size: 10, delay: "0s" },
  { top: "14%", left: "78%", size: 8, delay: ".6s" },
  { top: "30%", left: "6%", size: 12, delay: "1.1s" },
  { top: "26%", left: "88%", size: 9, delay: ".3s" },
  { top: "52%", left: "10%", size: 14, delay: "1.4s" },
  { top: "58%", left: "86%", size: 12, delay: ".9s" },
  { top: "72%", left: "20%", size: 9, delay: "1.7s" },
  { top: "68%", left: "76%", size: 10, delay: ".2s" },
];

const CONFETTI = [
  { top: "6%", left: "34%", color: "hsl(45 95% 60%)", delay: "0s", rot: "18deg" },
  { top: "12%", left: "62%", color: "hsl(0 85% 62%)", delay: ".8s", rot: "-24deg" },
  { top: "22%", left: "24%", color: "hsl(265 90% 72%)", delay: "1.5s", rot: "40deg" },
  { top: "44%", left: "84%", color: "hsl(205 90% 62%)", delay: ".4s", rot: "-12deg" },
  { top: "62%", left: "14%", color: "hsl(45 95% 60%)", delay: "1.2s", rot: "30deg" },
  { top: "74%", left: "66%", color: "hsl(0 85% 62%)", delay: "1.9s", rot: "-36deg" },
];

/**
 * Animated champion-trophy stage: rotating light rays, twinkling stars,
 * drifting confetti and a glowing podium ring behind the 3D cup.
 */
export function TrophyStage({ className, podium = true }: TrophyStageProps) {
  return (
    <div className={cn("relative aspect-square", className)} aria-hidden={false}>
      {/* radial glow */}
      <div
        className="absolute inset-[-14%] rounded-full animate-glow-pulse"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, hsl(268 100% 82% / .55) 0%, hsl(268 90% 62% / .22) 38%, transparent 68%)",
        }}
      />
      {/* rotating light rays */}
      <div
        className="absolute inset-[-10%] animate-ray-spin"
        style={{
          background:
            "conic-gradient(from 0deg, hsl(0 0% 100% / .28) 0deg 6deg, transparent 6deg 26deg, hsl(0 0% 100% / .18) 26deg 30deg, transparent 30deg 52deg, hsl(0 0% 100% / .24) 52deg 57deg, transparent 57deg 84deg, hsl(0 0% 100% / .16) 84deg 88deg, transparent 88deg 120deg)",
          maskImage: "radial-gradient(circle at 50% 45%, #000 12%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle at 50% 45%, #000 12%, transparent 70%)",
        }}
      />

      {/* sparkle stars */}
      {SPARKLES.map((s, i) => (
        <span
          key={`sp-${i}`}
          className="absolute animate-sparkle-twinkle"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            animationDelay: s.delay,
            background: "hsl(45 100% 66%)",
            clipPath:
              "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
            filter: "drop-shadow(0 0 4px hsl(45 100% 70% / .9))",
          }}
        />
      ))}

      {/* confetti ribbons */}
      {CONFETTI.map((c, i) => (
        <span
          key={`cf-${i}`}
          className="absolute rounded-[2px] animate-confetti-drift"
          style={{
            top: c.top,
            left: c.left,
            width: 7,
            height: 12,
            background: c.color,
            transform: `rotate(${c.rot})`,
            animationDelay: c.delay,
          }}
        />
      ))}

      {/* podium disc */}
      {podium && (
        <>
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-[4%] w-[74%] h-[13%] rounded-[50%]"
            style={{
              background: "radial-gradient(ellipse at 50% 50%, hsl(268 80% 62% / .85), hsl(268 70% 42% / .25) 70%, transparent)",
            }}
          />
          <div
            className="absolute left-1/2 -translate-x-1/2 bottom-[5%] w-[70%] h-[11%] rounded-[50%] animate-ring-pulse"
            style={{ border: "2px solid hsl(280 100% 82% / .85)", boxShadow: "0 0 18px hsl(280 100% 78% / .7)" }}
          />
        </>
      )}

      {/* the cup */}
      <img
        src={trophy3d}
        alt="Champion trophy"
        width={1024}
        height={1024}
        loading="lazy"
        className="relative z-10 w-[82%] h-auto mx-auto mt-[6%] select-none pointer-events-none animate-trophy-float drop-shadow-[0_18px_30px_rgba(0,0,0,.38)]"
      />
    </div>
  );
}
