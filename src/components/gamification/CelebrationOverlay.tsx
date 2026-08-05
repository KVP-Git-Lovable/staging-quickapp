import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { TrophyMark } from "./TrophyMark";

const CONFETTI_COLORS = ["#f59e0b", "#fbbf24", "#8b5cf6", "#5A2DD8", "#14b8a6", "#3b82f6", "#ffffff"];
const EMOJIS = ["🎉", "🏆", "⭐", "🥇", "✨", "🎊", "💫"];

interface CelebrationOverlayProps {
  open: boolean;
  title?: string;
  subtitle?: string;
  onDone?: () => void;
  /** Auto dismiss delay in ms. */
  duration?: number;
}

/**
 * Full-screen victory celebration: CSS confetti burst, floating emojis and the
 * shared trophy popping in. Purely presentational — no deps, no functional side
 * effects. Render it and flip `open` when a milestone/reward is unlocked.
 */
export function CelebrationOverlay({
  open,
  title = "Milestone unlocked!",
  subtitle,
  onDone,
  duration = 4200,
}: CelebrationOverlayProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    const t = setTimeout(() => {
      setMounted(false);
      onDone?.();
    }, duration);
    return () => clearTimeout(t);
  }, [open, duration, onDone]);

  const confetti = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.4,
        dur: 2.6 + Math.random() * 2,
        size: 6 + Math.random() * 8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rot: Math.random() * 360,
        round: Math.random() > 0.6,
      })),
    [],
  );

  const emojis = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        left: 6 + Math.random() * 88,
        delay: Math.random() * 1.8,
        dur: 3 + Math.random() * 1.8,
        char: EMOJIS[i % EMOJIS.length],
        size: 18 + Math.random() * 16,
      })),
    [],
  );

  if (!open || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden">
      {/* soft glow wash */}
      <div
        className="absolute inset-0 animate-fade-in"
        style={{ background: "radial-gradient(circle at 50% 38%, rgba(90,45,216,.28) 0%, rgba(0,0,0,0) 62%)" }}
      />

      {/* confetti */}
      {confetti.map((c) => (
        <span
          key={c.id}
          className="absolute top-[-8%] animate-confetti-fall"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.round ? c.size : c.size * 1.8,
            background: c.color,
            borderRadius: c.round ? "9999px" : "2px",
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.dur}s`,
            transform: `rotate(${c.rot}deg)`,
          }}
        />
      ))}

      {/* floating emojis */}
      {emojis.map((e) => (
        <span
          key={e.id}
          className="absolute bottom-[6%] animate-emoji-rise"
          style={{
            left: `${e.left}%`,
            fontSize: e.size,
            animationDelay: `${e.delay}s`,
            animationDuration: `${e.dur}s`,
          }}
        >
          {e.char}
        </span>
      ))}

      {/* trophy + message */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
        <TrophyMark className="w-[132px] sm:w-[168px] h-auto animate-trophy-pop" float />
        <div
          className="rounded-[18px] px-5 py-3 backdrop-blur-md animate-scale-in"
          style={{
            background: "linear-gradient(135deg,rgba(28,36,64,.92) 0%,rgba(90,45,216,.92) 100%)",
            border: "1px solid rgba(255,255,255,.18)",
          }}
        >
          <p className="font-pixel text-[12px] sm:text-[15px] leading-none text-white"
            style={{ textShadow: "2px 2px 0 rgba(124,58,237,.75)" }}>
            {title}
          </p>
          {subtitle && <p className="text-[11.5px] mt-2 text-white/80">{subtitle}</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
