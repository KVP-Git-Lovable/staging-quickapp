import { ReactNode, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

export type SectionTone = 'blue' | 'violet' | 'emerald' | 'amber' | 'rose' | 'sky';

const toneStyles: Record<SectionTone, { chip: string; glow: string }> = {
  blue: {
    chip: 'bg-gradient-to-br from-blue-500 to-indigo-500 text-white shadow-blue-500/30',
    glow: 'from-blue-50 to-transparent dark:from-blue-950/30',
  },
  violet: {
    chip: 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-violet-500/30',
    glow: 'from-violet-50 to-transparent dark:from-violet-950/30',
  },
  emerald: {
    chip: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-emerald-500/30',
    glow: 'from-emerald-50 to-transparent dark:from-emerald-950/30',
  },
  amber: {
    chip: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-amber-500/30',
    glow: 'from-amber-50 to-transparent dark:from-amber-950/30',
  },
  rose: {
    chip: 'bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-rose-500/30',
    glow: 'from-rose-50 to-transparent dark:from-rose-950/30',
  },
  sky: {
    chip: 'bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-sky-500/30',
    glow: 'from-sky-50 to-transparent dark:from-sky-950/30',
  },
};

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: SectionTone;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** Card whose body is hidden until the user clicks the header arrow. */
export function CollapsibleSection({
  title,
  description,
  icon,
  tone = 'blue',
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const styles = toneStyles[tone];

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="w-full text-left">
            <CardHeader
              className={cn(
                'pb-4 bg-gradient-to-r transition-colors',
                open ? styles.glow : 'from-transparent to-transparent hover:bg-muted/40',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {icon && (
                    <div
                      className={cn(
                        'h-10 w-10 shrink-0 rounded-xl flex items-center justify-center shadow-lg',
                        styles.chip,
                      )}
                    >
                      {icon}
                    </div>
                  )}
                  <div className="min-w-0">
                    <CardTitle className="text-[15px] leading-tight">{title}</CardTitle>
                    {description && (
                      <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
                    )}
                  </div>
                </div>
                <div className="h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center">
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      open && 'rotate-180',
                    )}
                  />
                </div>
              </div>
            </CardHeader>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
