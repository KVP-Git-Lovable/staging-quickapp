import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, Download, Share2, Copy } from 'lucide-react';
import html2canvas from 'html2canvas';
import { useCompanyData } from '@/hooks/useCompanyData';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useToast } from '@/hooks/use-toast';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { Notification } from '@/hooks/useNotifications';

interface Top3Entry {
  rank: number;
  user_id?: string;
  full_name: string | null;
  profile_picture_url: string | null;
  total_points: number;
  period_label?: string;
}

interface BannerNotification extends Notification {
  metadata?: { top3?: Top3Entry[]; period_label?: string; period_type?: string } | null;
}

interface PreviewData {
  top3: Array<{ rank: number; full_name: string; profile_picture_url: string; total_points: number }>;
  period_label: string;
  period_type: 'weekly' | 'monthly';
}

interface Props {
  notification?: BannerNotification;
  onDismiss?: () => void;
  isPreview?: boolean;
  previewData?: PreviewData;
  onClosePreview?: () => void;
}

const initials = (name: string | null) => {
  if (!name) return '?';
  return (
    name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?'
  );
};

const rankBadgeColor = (rank: number) => {
  if (rank === 1) return '#F5C518';
  if (rank === 2) return '#C0C0C0';
  return '#CD7F32';
};

const Avatar = ({
  url,
  name,
  size,
  border,
}: {
  url: string | null;
  name: string | null;
  size: number;
  border?: string;
}) => {
  const signedUrl = useSignedUrl(url);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: 'rgba(83,74,183,0.2)',
        color: '#534AB7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.38,
        border: border ?? 'none',
        flexShrink: 0,
      }}
    >
      {signedUrl ? (
        <img src={signedUrl} alt={name ?? ''} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
};

const PodiumPerson = ({
  entry,
  isFirst,
}: {
  entry: Top3Entry | undefined;
  isFirst?: boolean;
}) => {
  if (!entry) return <div style={{ width: 80 }} />;
  const avatarSize = isFirst ? 64 : 52;
  const podiumHeight = entry.rank === 1 ? 52 : entry.rank === 2 ? 36 : 24;
  const podiumOpacity = entry.rank === 1 ? 0.85 : entry.rank === 2 ? 0.55 : 0.35;
  const badge = rankBadgeColor(entry.rank);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 88 }}>
      {isFirst && <div style={{ fontSize: 22, lineHeight: 1, marginBottom: 4 }}>👑</div>}
      <div style={{ position: 'relative' }}>
        <Avatar
          url={entry.profile_picture_url}
          name={entry.full_name}
          size={avatarSize}
          border={isFirst ? '3px solid #F5C518' : undefined}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -2,
            right: -2,
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: badge,
            color: '#1a0e3a',
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #1a0e3a',
          }}
        >
          {entry.rank}
        </div>
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          fontWeight: isFirst ? 600 : 500,
          color: isFirst ? '#fff' : 'rgba(255,255,255,0.75)',
          textAlign: 'center',
          maxWidth: 88,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.full_name ?? 'Unknown'}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: isFirst ? '#F5C518' : 'rgba(255,255,255,0.6)',
          marginTop: 2,
        }}
      >
        {Number(entry.total_points).toLocaleString()} pts
      </div>
      <div
        style={{
          marginTop: 6,
          width: 64,
          height: podiumHeight,
          background: `rgba(83,74,183,${podiumOpacity})`,
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
        }}
      />
    </div>
  );
};

export function LeaderboardBanner({ notification, onDismiss, isPreview, previewData, onClosePreview }: Props) {
  const navigate = useNavigate();
  const { company, headerLogo } = useCompanyData();
  const { toast } = useToast();
  const captureRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const meta = (isPreview ? null : notification?.metadata) ?? {};
  const top3: Top3Entry[] = isPreview
    ? (previewData?.top3 ?? []) as Top3Entry[]
    : (Array.isArray((meta as any).top3) ? (meta as any).top3 : []);
  const periodLabel = isPreview
    ? (previewData?.period_label ?? '')
    : ((meta as any).period_label ?? top3[0]?.period_label ?? '');
  const periodTypeRaw = isPreview ? previewData?.period_type : (meta as any).period_type;
  const isWeekly = (periodTypeRaw ?? '').toLowerCase() === 'weekly';
  const hasTies = new Set(top3.map(t => t.rank)).size < top3.length;
  const logoUrl = headerLogo ?? company?.logo_url ?? null;

  const captureBlob = async (): Promise<Blob | null> => {
    if (!captureRef.current) return null;
    const canvas = await html2canvas(captureRef.current, {
      backgroundColor: '#ffffff',
      useCORS: true,
      scale: 2,
    });
    return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'));
  };

  const handleDownload = async () => {
    try {
      setBusy(true);
      const blob = await captureBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `top-performers-${periodLabel || 'leaderboard'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      toast({ title: 'Download failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const handleShareWhatsApp = async () => {
    setShareOpen(false);
    try {
      setBusy(true);
      const blob = await captureBlob();
      if (blob && navigator.canShare && navigator.canShare({ files: [new File([blob], 'top-performers.png', { type: 'image/png' })] })) {
        const file = new File([blob], 'top-performers.png', { type: 'image/png' });
        await navigator.share({
          files: [file],
          title: 'Top performers',
          text: "Check out this week's top performers!",
        });
      } else {
        window.open(
          `https://wa.me/?text=${encodeURIComponent("Check out this week's top performers!")}`,
          '_blank'
        );
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const handleCopyImage = async () => {
    setShareOpen(false);
    try {
      setBusy(true);
      const blob = await captureBlob();
      if (!blob) return;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast({ title: 'Copied!', description: 'Image copied to clipboard.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Copy failed', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const outlineBtn: React.CSSProperties = {
    padding: '10px 12px',
    background: '#fff',
    color: '#534AB7',
    border: '1px solid #534AB7',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  };

  const CardWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    isPreview ? (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(83,74,183,0.15)',
            color: '#534AB7',
            fontSize: 11,
            fontWeight: 600,
            padding: '4px 12px',
            borderRadius: 999,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Preview
        </div>
        {children}
      </div>
    ) : (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(15,10,30,0.82)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
      >
        {children}
      </div>
    );

  return (
    <CardWrapper>
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        {/* Capture area: header + details */}
        <div ref={captureRef}>
          {/* Header */}
          <div style={{ background: '#1a0e3a', padding: '20px 20px 24px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1rem',
                gap: 12,
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={company?.name ?? 'Company logo'}
                  crossOrigin="anonymous"
                  style={{ maxHeight: 32, maxWidth: 100, objectFit: 'contain' }}
                />
              ) : (
                <div />
              )}
              {periodLabel && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <div
                    style={{
                      background: 'rgba(83,74,183,0.35)',
                      color: '#d8d2ff',
                      fontSize: 11,
                      fontWeight: 500,
                      padding: '4px 12px',
                      borderRadius: 999,
                    }}
                  >
                    {periodLabel}
                  </div>
                  {hasTies && (
                    <div
                      style={{
                        background: 'rgba(245,197,24,0.18)',
                        color: '#F5C518',
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '3px 10px',
                        borderRadius: 999,
                        letterSpacing: 0.3,
                      }}
                    >
                      🤝 Tied
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 700,
                }}
              >
                <Trophy size={20} color="#F5C518" />
                Top performers this {isWeekly ? 'week' : 'month'}
              </div>
              <div style={{ color: 'rgba(216,210,255,0.7)', fontSize: 12, marginTop: 4 }}>
                Congratulations to our star salespeople
              </div>

              {/* Podium */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: 12,
                  marginTop: 24,
                }}
              >
                <PodiumPerson entry={top3.find(t => t.rank === 2)} />
                <PodiumPerson entry={top3.find(t => t.rank === 1)} isFirst />
                <PodiumPerson entry={top3.find(t => t.rank === 3)} />
              </div>
            </div>
          </div>

          {/* Details */}
          <div style={{ padding: '1.25rem 1.5rem' }}>
            {top3.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#888', fontSize: 13, padding: '8px 0' }}>
                No leaderboard data available.
              </div>
            ) : (
              top3.map((t, idx) => (
                <div
                  key={`${t.user_id ?? t.full_name}-${t.rank}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: idx < top3.length - 1 ? '1px solid #eee' : 'none',
                  }}
                >
                  <Avatar url={t.profile_picture_url} name={t.full_name} size={36} />
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: '#1a0e3a' }}>
                    {t.full_name ?? 'Unknown'}
                  </div>
                  <div style={{ color: '#534AB7', fontSize: 14, fontWeight: 600 }}>
                    {Number(t.total_points).toLocaleString()} pts
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer (excluded from capture) */}
        {isPreview ? (
          <div
            style={{
              display: 'flex',
              padding: '10px 12px',
              borderTop: '1px solid #eee',
            }}
          >
            <button
              onClick={onClosePreview}
              style={{ ...outlineBtn, flex: 1, padding: '10px 12px', fontSize: 14 }}
            >
              Close preview
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'nowrap',
              alignItems: 'center',
              gap: 6,
              padding: '10px 12px',
              borderTop: '1px solid #eee',
            }}
          >
            <button
              onClick={handleDownload}
              disabled={busy}
              aria-label="Download"
              title="Download"
              style={{ ...outlineBtn, padding: 8, flex: '0 0 auto', width: 36, height: 36 }}
            >
              <Download size={16} />
            </button>

            <Popover open={shareOpen} onOpenChange={setShareOpen}>
              <PopoverTrigger asChild>
                <button
                  disabled={busy}
                  aria-label="Share"
                  title="Share"
                  style={{ ...outlineBtn, padding: 8, flex: '0 0 auto', width: 36, height: 36 }}
                >
                  <Share2 size={16} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <button
                  onClick={handleShareWhatsApp}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    borderRadius: 6,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Share2 size={14} /> Share on WhatsApp
                </button>
                <button
                  onClick={handleCopyImage}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    borderRadius: 6,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Copy size={14} /> Copy image
                </button>
              </PopoverContent>
            </Popover>

            <button
              onClick={onDismiss}
              style={{ ...outlineBtn, flex: '1 1 0', padding: '8px 10px', fontSize: 13 }}
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                navigate('/leaderboard');
                onDismiss?.();
              }}
              style={{
                flex: '2 1 0',
                padding: '8px 12px',
                background: '#534AB7',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              View leaderboard
            </button>
          </div>
        )}
      </div>
    </CardWrapper>
  );
}
