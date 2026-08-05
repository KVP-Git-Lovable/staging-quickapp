import trophyAsset from "@/assets/gamification-trophy.png.asset.json";
import { cn } from "@/lib/utils";

interface TrophyMarkProps {
  className?: string;
  /** Adds the soft floating animation used on hero bands. */
  float?: boolean;
  alt?: string;
}

/**
 * Shared 3D champion-cup mark. Single source of truth so every gamification
 * surface (admin hero, leaderboard, badges, celebrations) uses the same trophy.
 */
export function TrophyMark({ className, float = false, alt = "Champion trophy" }: TrophyMarkProps) {
  return (
    <img
      src={trophyAsset.url}
      alt={alt}
      width={480}
      height={480}
      loading="lazy"
      className={cn(
        "select-none pointer-events-none drop-shadow-[0_14px_28px_rgba(0,0,0,.32)]",
        float && "animate-trophy-float",
        className,
      )}
    />
  );
}
