import { useState } from "react";
import { Target, Users, ChevronRight, TrendingUp, Sparkles, BarChart3, MapPin, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { useUserTargetProgress, TargetPeriod, TargetBasis } from "@/hooks/useUserTargetProgress";
import { Recommendation } from "@/hooks/useRecommendations";
import { RecommendationCard } from "@/components/RecommendationCard";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useCurrency } from "@/contexts/CurrencyContext";

interface InsightsPanelProps {
  userId: string | undefined;
  recommendations: Recommendation[];
  onGenerateRecommendations: () => void;
  onFeedback: (recId: string, feedbackType: 'like' | 'dislike' | 'implemented' | 'ignored') => void;
  recommendationsLoading?: boolean;
  beatId?: string;
  hasBeat?: boolean;
}

// Grouped period options
const PAST_PERIOD_OPTIONS: { value: TargetPeriod; label: string }[] = [
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_quarter', label: 'Last Quarter' },
];

const FUTURE_PERIOD_OPTIONS: { value: TargetPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_year', label: 'This FY' },
];

const BASIS_OPTIONS: { value: TargetBasis; label: string }[] = [
  { value: 'quantity', label: 'Qty' },
  { value: 'revenue', label: 'Rev' },
];

type ActivePanel = 'target' | 'priority' | null;

export const InsightsPanel = ({
  userId,
  recommendations,
  onGenerateRecommendations,
  onFeedback,
  recommendationsLoading,
  hasBeat = false,
}: InsightsPanelProps) => {
  const navigate = useNavigate();
  const { format, displayCurrency } = useCurrency();
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);
  const [targetPeriod, setTargetPeriod] = useState<TargetPeriod>('today');
  const [targetBasis, setTargetBasis] = useState<TargetBasis>('quantity');

  const { target, actual, progress, gap, unit, isLoading: targetLoading } = useUserTargetProgress(
    userId,
    targetPeriod,
    targetBasis
  );

  const formatCurrency = (amount: number) => {
    if (displayCurrency === 'INR') {
      if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
      if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
      return `₹${Math.round(amount)}`;
    }
    return format(amount);
  };

  const formatQuantity = (qty: number, unitLabel: string) => {
    // Quantity should always show the unit (Kg/Units), not "K" short-format
    return `${qty.toLocaleString('en-IN', { maximumFractionDigits: 1 })} ${unitLabel}`;
  };

  const formatValue = (value: number) => {
    if (targetBasis === 'revenue') return formatCurrency(value);
    return formatQuantity(value, unit);
  };

  const delta = actual - target; // +ve => overachieved, -ve => gap
  const absDelta = Math.abs(delta);

  const getDeltaLabel = () => {
    if (target <= 0) return 'Gap';
    if (delta > 0) return 'Overachieved';
    if (delta < 0) return 'Gap';
    return 'On Target';
  };

  const getDeltaValue = () => {
    if (targetLoading) return '...';
    if (target <= 0) return '—';
    if (delta === 0) return '✓';
    if (delta > 0) return `+${formatValue(absDelta)}`;
    return formatValue(absDelta);
  };

  const getDeltaColor = () => {
    if (delta > 0) return 'text-success';
    if (delta < 0) return 'text-destructive';
    return 'text-success';
  };

  const getProgressColor = () => {
    if (progress >= 100) return 'text-emerald-600 dark:text-emerald-400';
    if (progress >= 70) return 'text-amber-600 dark:text-amber-400';
    if (progress >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-rose-600 dark:text-rose-400';
  };

  const getProgressBgColor = () => {
    if (progress >= 100) return 'bg-emerald-500';
    if (progress >= 70) return 'bg-amber-500';
    if (progress >= 40) return 'bg-orange-500';
    return 'bg-rose-500';
  };

  const getProgressTrailColor = () => {
    if (progress >= 100) return 'bg-emerald-500/20';
    if (progress >= 70) return 'bg-amber-500/20';
    if (progress >= 40) return 'bg-orange-500/20';
    return 'bg-rose-500/20';
  };

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  return (
    <div className="space-y-2">
      {/* Compact Toggle Buttons */}
      <div className="flex gap-2">
        {/* Target Button */}
        <button
          onClick={() => togglePanel('target')}
          className={cn(
            "flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-200",
            "hover:shadow-md active:scale-[0.98]",
            activePanel === 'target' 
              ? "bg-gradient-to-br from-primary/15 to-primary/5 border-primary/30 shadow-sm" 
              : "bg-card/80 border-border/50 hover:border-primary/20 hover:bg-primary/5"
          )}
        >
          <div className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            activePanel === 'target' ? "bg-primary/20" : "bg-muted"
          )}>
            <Target className={cn("h-4 w-4", activePanel === 'target' ? "text-primary" : "text-muted-foreground")} />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Target</p>
            <div className="flex items-center gap-1.5">
              <span className={cn("text-sm font-bold tabular-nums", getProgressColor())}>
                {targetLoading ? '—' : `${progress}%`}
              </span>
              {!targetLoading && (
                <div className={cn("w-10 h-1.5 rounded-full overflow-hidden", getProgressTrailColor())}>
                  <div 
                    className={cn("h-full rounded-full transition-all duration-500", getProgressBgColor())}
                    style={{ width: `${Math.min(progress, 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>
          <ChevronRight className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
            activePanel === 'target' && "rotate-90"
          )} />
        </button>

        {/* Priority Button */}
        {hasBeat && (
          <button
            onClick={() => togglePanel('priority')}
            className={cn(
              "flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-all duration-200",
              "hover:shadow-md active:scale-[0.98]",
              activePanel === 'priority' 
                ? "bg-gradient-to-br from-amber-500/15 to-orange-500/5 border-amber-500/30 shadow-sm" 
                : "bg-card/80 border-border/50 hover:border-amber-500/20 hover:bg-amber-500/5"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
              activePanel === 'priority' ? "bg-amber-500/20" : "bg-muted"
            )}>
              <Flame className={cn("h-4 w-4", activePanel === 'priority' ? "text-amber-600" : "text-muted-foreground")} />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Priority</p>
              <div className="flex items-center gap-1">
                <span className="text-sm font-bold text-foreground">
                  {recommendations.length > 0 ? `${recommendations.length} retailers` : 'Get insights'}
                </span>
              </div>
            </div>
            <ChevronRight className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200 shrink-0",
              activePanel === 'priority' && "rotate-90"
            )} />
          </button>
        )}
      </div>

      {/* Expandable Content */}
      <AnimatePresence mode="wait">
        {activePanel === 'target' && (
          <motion.div
            key="target"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary/5 via-primary/3 to-transparent border border-primary/10 space-y-3">
              {/* Period & Basis Selectors */}
              <div className="flex gap-2">
                <Select value={targetPeriod} onValueChange={(v) => setTargetPeriod(v as TargetPeriod)}>
                  <SelectTrigger className="h-8 text-xs flex-1 bg-background/50">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">Current / Future</SelectLabel>
                      {FUTURE_PERIOD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">Past</SelectLabel>
                      {PAST_PERIOD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Select value={targetBasis} onValueChange={(v) => setTargetBasis(v as TargetBasis)}>
                  <SelectTrigger className="h-8 text-xs w-20 bg-background/50">
                    <SelectValue placeholder="Basis" />
                  </SelectTrigger>
                  <SelectContent>
                    {BASIS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-background/60 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-muted-foreground font-medium uppercase">Target</p>
                  <p className="text-sm font-bold text-foreground">
                    {targetLoading ? '...' : formatValue(target)}
                  </p>
                </div>
                <div className="bg-background/60 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-muted-foreground font-medium uppercase">Actual</p>
                  <p className={cn("text-sm font-bold", getProgressColor())}>
                    {targetLoading ? '...' : formatValue(actual)}
                  </p>
                </div>
                <div className="bg-background/60 rounded-lg p-2 text-center">
                  <p className="text-[9px] text-muted-foreground font-medium uppercase">{getDeltaLabel()}</p>
                  <p className={cn("text-sm font-bold", getDeltaColor())}>
                    {getDeltaValue()}
                  </p>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="relative h-8 flex items-center">
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                  <div className={cn("w-full h-2 rounded-full overflow-hidden", getProgressTrailColor())}>
                    <motion.div 
                      className={cn("h-full rounded-full", getProgressBgColor())}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(progress, 100)}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Marker */}
                <motion.div 
                  className="absolute z-10"
                  initial={{ left: '5%' }}
                  animate={{ left: `${Math.min(Math.max(progress, 5), 95)}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  style={{ transform: 'translateX(-50%)' }}
                >
                  <div className="flex flex-col items-center -mt-4">
                    <div className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold text-white shadow-lg", getProgressBgColor())}>
                      {targetLoading ? '...' : `${progress}%`}
                    </div>
                    <div className={cn("w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] border-transparent", 
                      progress >= 100 ? "border-t-emerald-500" : 
                      progress >= 70 ? "border-t-amber-500" : 
                      progress >= 40 ? "border-t-orange-500" : "border-t-rose-500"
                    )} />
                  </div>
                </motion.div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/target-advisor?period=${targetPeriod}`)}
                  className="flex-1 h-8 text-xs gap-1.5 bg-primary/10 hover:bg-primary/20"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Advisor
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate('/performance-dashboard')}
                  className="flex-1 h-8 text-xs gap-1.5 bg-background/50 hover:bg-background/80"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Performance
                </Button>
              </div>
            </div>
          </motion.div>
        )}

        {activePanel === 'priority' && hasBeat && (
          <motion.div
            key="priority"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/5 via-orange-500/3 to-transparent border border-amber-500/10 space-y-3">
              {recommendations.length === 0 ? (
                <div className="text-center py-4">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Users className="h-6 w-6 text-amber-600" />
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    AI-powered insights for which retailers to prioritize based on potential & last visit
                  </p>
                  <Button
                    size="sm"
                    onClick={onGenerateRecommendations}
                    disabled={recommendationsLoading}
                    className="h-8 text-xs gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {recommendationsLoading ? 'Analyzing...' : 'Get Priority List'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                    Top {recommendations.length} priority retailers
                  </p>
                  {recommendations.map((rec) => (
                    <RecommendationCard
                      key={rec.id}
                      recommendation={rec}
                      onFeedback={(feedbackType) => onFeedback(rec.id, feedbackType)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
