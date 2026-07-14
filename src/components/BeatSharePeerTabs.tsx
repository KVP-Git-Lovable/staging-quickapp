import { cn } from '@/lib/utils';
import { useBeatSharePeers, type BeatSharePeer } from '@/hooks/useBeatSharePeers';

interface BeatSharePeerTabsProps {
  /** Currently selected peer user id, or null for "Mine". */
  selectedPeerId: string | null;
  onChange: (peer: BeatSharePeer | null) => void;
  className?: string;
  variant?: 'default' | 'onDark';
}

/**
 * Named per-peer tabs that replace the generic "Mine | Team" toggle.
 *
 * Renders one tab per user we actively share a beat with. When there are no
 * peers, only "Mine" is shown (no empty "Team" fallback). Selecting a peer
 * must scope downstream queries to that peer's user_id AND the shared beat_ids
 * (see peer.beatIds). This makes the view truly symmetric regardless of
 * reporting hierarchy.
 */
export function BeatSharePeerTabs({
  selectedPeerId,
  onChange,
  className,
  variant = 'onDark',
}: BeatSharePeerTabsProps) {
  const { data: peers = [], isLoading } = useBeatSharePeers();

  const onDark = variant === 'onDark';
  const base =
    'px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-medium whitespace-nowrap transition-colors border';
  const activeCls = onDark
    ? 'bg-primary-foreground text-primary border-primary-foreground'
    : 'bg-primary text-primary-foreground border-primary';
  const idleCls = onDark
    ? 'bg-primary-foreground/10 text-primary-foreground border-primary-foreground/30 hover:bg-primary-foreground/20'
    : 'bg-muted text-foreground border-border hover:bg-muted/70';

  // No peers → only "Mine". Keep the pill visible for a consistent header.
  if (!isLoading && peers.length === 0) {
    return (
      <div className={cn('flex items-center gap-1.5', className)}>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(base, activeCls)}
          aria-pressed
        >
          Mine
        </button>
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1.5 flex-wrap', className)}>
      <button
        type="button"
        onClick={() => onChange(null)}
        className={cn(base, selectedPeerId === null ? activeCls : idleCls)}
        aria-pressed={selectedPeerId === null}
      >
        Mine
      </button>
      {peers.map((p) => {
        const isActive = selectedPeerId === p.userId;
        const label = p.name.split(' ')[0] || p.name;
        return (
          <button
            key={p.userId}
            type="button"
            onClick={() => onChange(p)}
            className={cn(base, isActive ? activeCls : idleCls)}
            aria-pressed={isActive}
            title={`${p.name} · ${p.beatNames.join(', ')}`}
          >
            {label}
            <span className="ml-1 opacity-70">· {p.beatIds.length}</span>
          </button>
        );
      })}
    </div>
  );
}
