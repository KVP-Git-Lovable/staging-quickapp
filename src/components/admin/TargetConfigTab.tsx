import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useFYTargetPlans, type PlanStatus } from '@/hooks/useFYTargetPlans';
import { useMetricDefinitions, usePlanEnabledMetrics, useSavePlanMetrics, useCreateMetricDefinition, useDeleteMetricDefinition, type TargetMetricDefinition } from '@/hooks/useTargetMetrics';
import { toast } from 'sonner';
import { Loader2, Lock, Unlock, Target, Settings, Package, IndianRupee, Footprints, ChevronDown, ChevronUp, Divide, Users, Calendar, Plus, FileText, CheckCircle2, Archive, Store, X, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { type PeriodType } from './target-config/PeriodTypeSelector';
import { generateInitialPeriods, type PeriodTarget } from './target-config/PeriodBreakdownGrid';
import { useTargetPeriods } from '@/hooks/useTargetPeriods';
import { generateInitialMonthlyTargets } from './target-config/AnnualMonthlyBreakdown';
import { useParameterDefinitions, useDeleteParameterDefinition } from '@/hooks/useTargetParameters';
import { CreateParameterDialog } from './CreateParameterDialog';

// Icon map for dynamic rendering
const ICON_MAP: Record<string, React.ElementType> = {
  'package': Package,
  'indian-rupee': IndianRupee,
  'footprints': Footprints,
  'store': Store,
  'target': Target,
  'users': Users,
  'calendar': Calendar,
};

// Color map for metric cards
const COLOR_MAP: Record<string, { bg: string; border: string; text: string; darkBg: string; darkBorder: string; darkText: string }> = {
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', darkBg: 'dark:bg-blue-950/20', darkBorder: 'dark:border-blue-900/40', darkText: 'dark:text-blue-300' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', darkBg: 'dark:bg-emerald-950/20', darkBorder: 'dark:border-emerald-900/40', darkText: 'dark:text-emerald-300' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700', darkBg: 'dark:bg-violet-950/20', darkBorder: 'dark:border-violet-900/40', darkText: 'dark:text-violet-300' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', darkBg: 'dark:bg-amber-950/20', darkBorder: 'dark:border-amber-900/40', darkText: 'dark:text-amber-300' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700', darkBg: 'dark:bg-rose-950/20', darkBorder: 'dark:border-rose-900/40', darkText: 'dark:text-rose-300' },
  cyan: { bg: 'bg-cyan-50', border: 'border-cyan-200', text: 'text-cyan-700', darkBg: 'dark:bg-cyan-950/20', darkBorder: 'dark:border-cyan-900/40', darkText: 'dark:text-cyan-300' },
  pink: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-700', darkBg: 'dark:bg-pink-950/20', darkBorder: 'dark:border-pink-900/40', darkText: 'dark:text-pink-300' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700', darkBg: 'dark:bg-indigo-950/20', darkBorder: 'dark:border-indigo-900/40', darkText: 'dark:text-indigo-300' },
};

const AVAILABLE_COLORS = Object.keys(COLOR_MAP);
const AVAILABLE_ICONS = Object.keys(ICON_MAP);

// Types for breakdown data - now dynamic
interface BreakdownItem {
  id: string;
  name: string;
  metrics: Record<string, number>; // keyed by metric_id
  categoryId?: string;
  categoryName?: string;
}

const FY_MONTHS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
];

const PARAM_TAB_MAP: Record<string, { key: string; label: string; icon: string }> = {
  product: { key: 'product', label: 'Products', icon: '📦' },
  retailer: { key: 'retailer', label: 'Retailers', icon: '🏪' },
  beat: { key: 'beat', label: 'Beats', icon: '📍' },
  distributor: { key: 'distributor', label: 'Distributors', icon: '🚛' },
  territory: { key: 'territory', label: 'Territories', icon: '🗺️' },
  monthly: { key: 'monthly', label: 'Monthly', icon: '📅' },
};

interface TargetConfig {
  id?: string;
  fy_year: number;
  target_plan_name: string;
  enable_quantity: boolean;
  enable_revenue: boolean;
  enable_visits: boolean;
  enable_retailer_activation: boolean;
  quantity_unit: string;
  enabled_parameters: {
    product: boolean;
    retailer: boolean;
    beat: boolean;
    distributor: boolean;
    territory: boolean;
    monthly: boolean;
  };
  total_quantity_target: number;
  total_revenue_target: number;
  total_visits_target: number;
  total_retailer_activation_target: number;
  is_locked: boolean;
  setup_completed: boolean;
  target_period_type: PeriodType;
  target_start_month: number;
  target_end_month: number;
  plan_status: PlanStatus;
}

const FY_MONTH_OPTIONS = FY_MONTHS.map((name, i) => ({ value: i + 1, label: name }));

interface TargetConfigTabProps {
  fyYear: number;
  onLockedAndAssign?: () => void;
  selectedPlanId?: string;
  onPlanChange?: (planId: string) => void;
}

const QUANTITY_UNITS = ['Kg', 'Units', 'Liters', 'Pcs', 'Boxes', 'Tonnes', 'Cartons'];
const CURRENCY_OPTIONS = ['₹ (INR)', '$ (USD)', '€ (EUR)', '£ (GBP)'];

const DEFAULT_CONFIG: Omit<TargetConfig, 'fy_year'> = {
  target_plan_name: 'FY Sales Plan',
  enable_quantity: true,
  enable_revenue: true,
  enable_visits: false,
  enable_retailer_activation: false,
  quantity_unit: 'Kg',
  enabled_parameters: {
    product: true,
    retailer: true,
    beat: true,
    distributor: true,
    territory: true,
    monthly: true,
  },
  total_quantity_target: 0,
  total_revenue_target: 0,
  total_visits_target: 0,
  total_retailer_activation_target: 0,
  is_locked: false,
  setup_completed: false,
  target_period_type: 'annual',
  target_start_month: 1,
  target_end_month: 12,
  plan_status: 'draft',
};

const STATUS_CONFIG: Record<PlanStatus, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  draft: { label: 'Draft', icon: FileText, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  active: { label: 'Active', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bgColor: 'bg-emerald-100 dark:bg-emerald-900/30' },
  closed: { label: 'Closed', icon: Archive, color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
};

export function TargetConfigTab({ fyYear, onLockedAndAssign, selectedPlanId, onPlanChange }: TargetConfigTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [config, setConfig] = useState<TargetConfig>({
    fy_year: fyYear,
    ...DEFAULT_CONFIG,
  });
  const [periodTargets, setPeriodTargets] = useState<PeriodTarget[]>([]);
  const [annualMonthlyTargets, setAnnualMonthlyTargets] = useState(generateInitialMonthlyTargets());
  const [showAnnualMonthlyBreakdown, setShowAnnualMonthlyBreakdown] = useState(false);

  // Dynamic metrics state
  const [enabledMetricIds, setEnabledMetricIds] = useState<Set<string>>(new Set());
  const [metricTargets, setMetricTargets] = useState<Record<string, number>>({});
  const [showCreateMetricDialog, setShowCreateMetricDialog] = useState(false);

  // Breakdown state
  const [activeParamTab, setActiveParamTab] = useState<string>('');
  const [breakdownData, setBreakdownData] = useState<Record<string, BreakdownItem[]>>({});
  const [equalDivide, setEqualDivide] = useState<Record<string, boolean>>({});

  // Fetch metric definitions
  const { data: metricDefinitions = [], isLoading: metricsDefLoading } = useMetricDefinitions();

  // Fetch parameter definitions from DB
  const { data: parameterDefinitions = [] } = useParameterDefinitions();
  const deleteParamMutation = useDeleteParameterDefinition();
  const [showCreateParamDialog, setShowCreateParamDialog] = useState(false);

  // Fetch plan-enabled metrics (use stable reference to avoid effect loops)
  const { data: planEnabledMetricsData } = usePlanEnabledMetrics(config.id);
  const planEnabledMetrics = planEnabledMetricsData ?? EMPTY_PLAN_METRICS;

  // Save plan metrics mutation
  const savePlanMetricsMutation = useSavePlanMetrics();

  // Fetch all plans for this FY year
  const { data: plans = [], isLoading: plansLoading } = useFYTargetPlans(fyYear);

  // Fetch existing config for the selected plan
  const { data: existingConfig, isLoading } = useQuery({
    queryKey: ['fy-target-config', fyYear, selectedPlanId],
    queryFn: async () => {
      if (selectedPlanId) {
        const { data, error } = await supabase
          .from('fy_target_config')
          .select('*')
          .eq('id', selectedPlanId)
          .maybeSingle();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase
        .from('fy_target_config')
        .select('*')
        .eq('fy_year', fyYear)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Use the target periods hook
  const { periods: savedPeriods, savePeriods, isSaving, calculateRollups, applyEqualDistribution } = useTargetPeriods({
    fyConfigId: config.id,
  });

  // Update local state when data loads
  useEffect(() => {
    if (existingConfig) {
      const enabledParams = (existingConfig.enabled_parameters as TargetConfig['enabled_parameters']) ?? DEFAULT_CONFIG.enabled_parameters;
      const periodType = (existingConfig.target_period_type as PeriodType) ?? 'annual';
      setConfig({
        id: existingConfig.id,
        fy_year: existingConfig.fy_year,
        target_plan_name: existingConfig.target_plan_name ?? 'FY Sales Plan',
        enable_quantity: existingConfig.enable_quantity ?? true,
        enable_revenue: existingConfig.enable_revenue ?? true,
        enable_visits: existingConfig.enable_visits ?? false,
        enable_retailer_activation: (existingConfig as any).enable_retailer_activation ?? false,
        quantity_unit: existingConfig.quantity_unit ?? 'Kg',
        enabled_parameters: enabledParams,
        total_quantity_target: existingConfig.total_quantity_target ?? 0,
        total_revenue_target: existingConfig.total_revenue_target ?? 0,
        total_visits_target: existingConfig.total_visits_target ?? 0,
        total_retailer_activation_target: (existingConfig as any).total_retailer_activation_target ?? 0,
        is_locked: existingConfig.is_locked ?? false,
        setup_completed: existingConfig.setup_completed ?? false,
        target_period_type: periodType,
        target_start_month: (existingConfig as any).target_start_month ?? 1,
        target_end_month: (existingConfig as any).target_end_month ?? 12,
        plan_status: ((existingConfig as any).plan_status as PlanStatus) ?? 'draft',
      });
    } else {
      setConfig({
        fy_year: fyYear,
        ...DEFAULT_CONFIG,
      });
    }
  }, [existingConfig, fyYear]);

  // Sync plan-enabled metrics to local state
  useEffect(() => {
    if (planEnabledMetrics.length > 0) {
      const ids = new Set(planEnabledMetrics.map(m => m.metric_id));
      setEnabledMetricIds(ids);
      const targets: Record<string, number> = {};
      planEnabledMetrics.forEach(m => { targets[m.metric_id] = m.total_target; });
      setMetricTargets(targets);
    } else if (metricDefinitions.length > 0 && !config.id) {
      // For new plans, auto-enable system metrics based on legacy config
      const ids = new Set<string>();
      const targets: Record<string, number> = {};
      metricDefinitions.forEach(m => {
        if (m.name === 'Quantity' && config.enable_quantity) { ids.add(m.id); targets[m.id] = config.total_quantity_target; }
        if (m.name === 'Revenue' && config.enable_revenue) { ids.add(m.id); targets[m.id] = config.total_revenue_target; }
        if (m.name === 'Productive Visits' && config.enable_visits) { ids.add(m.id); targets[m.id] = config.total_visits_target; }
        if (m.name === 'Retailer Activation' && config.enable_retailer_activation) { ids.add(m.id); targets[m.id] = config.total_retailer_activation_target; }
      });
      if (ids.size > 0) {
        setEnabledMetricIds(ids);
        setMetricTargets(targets);
      }
    }
  }, [planEnabledMetrics, metricDefinitions, config.id]);

  // Load saved periods when they're fetched
  useEffect(() => {
    if (savedPeriods.length > 0) {
      setPeriodTargets(savedPeriods);
    } else if (config.target_period_type !== 'annual') {
      setPeriodTargets(generateInitialPeriods(config.target_period_type));
    }
  }, [savedPeriods, config.target_period_type]);

  // Active metric definitions (enabled ones)
  const activeMetrics = useMemo(() =>
    metricDefinitions.filter(m => enabledMetricIds.has(m.id)),
    [metricDefinitions, enabledMetricIds]
  );

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (configData: TargetConfig) => {
      const isLocked = configData.plan_status === 'active' || configData.plan_status === 'closed';
      
      // Sync legacy fields from dynamic metrics, falling back to config values if no metrics enabled
      const legacyFields = syncLegacyFromMetrics(metricDefinitions, enabledMetricIds, metricTargets, configData);

      if (configData.id) {
        const { error } = await supabase
          .from('fy_target_config')
          .update({
            target_plan_name: configData.target_plan_name,
            enable_quantity: legacyFields.enable_quantity,
            enable_revenue: legacyFields.enable_revenue,
            enable_visits: legacyFields.enable_visits,
            enable_retailer_activation: legacyFields.enable_retailer_activation,
            quantity_unit: configData.quantity_unit,
            enabled_parameters: configData.enabled_parameters,
            total_quantity_target: legacyFields.total_quantity_target,
            total_revenue_target: legacyFields.total_revenue_target,
            total_visits_target: legacyFields.total_visits_target,
            total_retailer_activation_target: legacyFields.total_retailer_activation_target,
            is_locked: isLocked,
            setup_completed: configData.setup_completed,
            target_period_type: configData.target_period_type,
            target_start_month: configData.target_start_month,
            target_end_month: configData.target_end_month,
            plan_status: configData.plan_status,
          })
          .eq('id', configData.id);
        if (error) throw error;

        // Save dynamic metrics
        await savePlanMetricsMutation.mutateAsync({
          fyConfigId: configData.id,
          metrics: Array.from(enabledMetricIds).map(metricId => ({
            metric_id: metricId,
            total_target: metricTargets[metricId] ?? 0,
          })),
        });

        // Save period targets if not annual
        if (configData.target_period_type !== 'annual' && periodTargets.length > 0) {
          await savePeriods({
            configId: configData.id,
            periodType: configData.target_period_type,
            periods: periodTargets,
          });
        }
      } else {
        const { data, error } = await supabase
          .from('fy_target_config')
          .insert({
            fy_year: configData.fy_year,
            target_plan_name: configData.target_plan_name,
            enable_quantity: legacyFields.enable_quantity,
            enable_revenue: legacyFields.enable_revenue,
            enable_visits: legacyFields.enable_visits,
            enable_retailer_activation: legacyFields.enable_retailer_activation,
            quantity_unit: configData.quantity_unit,
            enabled_parameters: configData.enabled_parameters,
            total_quantity_target: legacyFields.total_quantity_target,
            total_revenue_target: legacyFields.total_revenue_target,
            total_visits_target: legacyFields.total_visits_target,
            total_retailer_activation_target: legacyFields.total_retailer_activation_target,
            is_locked: isLocked,
            setup_completed: configData.setup_completed,
            target_period_type: configData.target_period_type,
            target_start_month: configData.target_start_month,
            target_end_month: configData.target_end_month,
            created_by: user?.id,
            plan_status: configData.plan_status,
          })
          .select()
          .single();
        if (error) throw error;
        if (data) {
          setConfig(prev => ({ ...prev, id: data.id }));
          onPlanChange?.(data.id);

          // Save dynamic metrics
          await savePlanMetricsMutation.mutateAsync({
            fyConfigId: data.id,
            metrics: Array.from(enabledMetricIds).map(metricId => ({
              metric_id: metricId,
              total_target: metricTargets[metricId] ?? 0,
            })),
          });

          if (configData.target_period_type !== 'annual' && periodTargets.length > 0) {
            await savePeriods({
              configId: data.id,
              periodType: configData.target_period_type,
              periods: periodTargets,
            });
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fy-target-config'] });
      queryClient.invalidateQueries({ queryKey: ['fy-target-plans'] });
      queryClient.invalidateQueries({ queryKey: ['fy-period-targets'] });
    },
    onError: (error: Error) => {
      toast.error('Failed to save configuration: ' + error.message);
    },
  });

  // Helper: sync legacy columns from dynamic metric state
  // Falls back to configData values if no dynamic metrics are enabled
  function syncLegacyFromMetrics(
    defs: TargetMetricDefinition[],
    enabled: Set<string>,
    targets: Record<string, number>,
    configData?: TargetConfig
  ) {
    let enable_quantity = false, enable_revenue = false, enable_visits = false, enable_retailer_activation = false;
    let total_quantity_target = 0, total_revenue_target = 0, total_visits_target = 0, total_retailer_activation_target = 0;
    let anyMatched = false;
    defs.forEach(m => {
      if (!enabled.has(m.id)) return;
      const t = targets[m.id] ?? 0;
      if (m.name === 'Quantity') { enable_quantity = true; total_quantity_target = t; anyMatched = true; }
      if (m.name === 'Revenue') { enable_revenue = true; total_revenue_target = t; anyMatched = true; }
      if (m.name === 'Productive Visits') { enable_visits = true; total_visits_target = t; anyMatched = true; }
      if (m.name === 'Retailer Activation') { enable_retailer_activation = true; total_retailer_activation_target = t; anyMatched = true; }
    });
    // If no dynamic metrics matched, preserve existing config values
    if (!anyMatched && configData) {
      return {
        enable_quantity: configData.enable_quantity,
        enable_revenue: configData.enable_revenue,
        enable_visits: configData.enable_visits,
        enable_retailer_activation: configData.enable_retailer_activation,
        total_quantity_target: configData.total_quantity_target,
        total_revenue_target: configData.total_revenue_target,
        total_visits_target: configData.total_visits_target,
        total_retailer_activation_target: configData.total_retailer_activation_target,
      };
    }
    return { enable_quantity, enable_revenue, enable_visits, enable_retailer_activation, total_quantity_target, total_revenue_target, total_visits_target, total_retailer_activation_target };
  }

  const handleToggleMetric = (metricId: string) => {
    setEnabledMetricIds(prev => {
      const next = new Set(prev);
      if (next.has(metricId)) {
        next.delete(metricId);
      } else {
        next.add(metricId);
      }
      return next;
    });
  };

  const handleMetricTargetChange = (metricId: string, value: number) => {
    setMetricTargets(prev => ({ ...prev, [metricId]: value }));
  };

  const handleParameterChange = (param: keyof TargetConfig['enabled_parameters'], checked: boolean) => {
    setConfig(prev => ({
      ...prev,
      enabled_parameters: {
        ...prev.enabled_parameters,
        [param]: checked,
      },
    }));
  };

  const handlePeriodTypeChange = (periodType: PeriodType) => {
    setConfig(prev => ({ ...prev, target_period_type: periodType }));
    if (periodType !== 'annual') {
      const newPeriods = generateInitialPeriods(periodType);
      setPeriodTargets(newPeriods);
    } else {
      setPeriodTargets([]);
    }
  };

  const handlePeriodChange = (periodNumber: number, field: 'quantityTarget' | 'revenueTarget' | 'visitsTarget', value: number) => {
    setPeriodTargets(prev => 
      prev.map(p => 
        p.periodNumber === periodNumber 
          ? { ...p, [field]: value }
          : p
      )
    );
    if (config.target_period_type !== 'annual') {
      const updatedPeriods = periodTargets.map(p =>
        p.periodNumber === periodNumber ? { ...p, [field]: value } : p
      );
      const totals = calculateRollups(updatedPeriods, config.target_period_type);
      setConfig(prev => ({
        ...prev,
        total_quantity_target: totals.quantity,
        total_revenue_target: totals.revenue,
        total_visits_target: totals.visits,
      }));
    }
  };

  const handleEqualDistribution = () => {
    const distributed = applyEqualDistribution(
      config.target_period_type,
      config.total_quantity_target,
      config.total_revenue_target,
      config.total_visits_target
    );
    setPeriodTargets(distributed);
    toast.success('Targets distributed equally across periods');
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-IN').format(num);
  };

  const parseNumber = (value: string) => {
    const cleaned = value.replace(/,/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const handleSave = async () => {
    await saveMutation.mutateAsync(config);
    toast.success('Configuration saved');
  };

  const handleStatusChange = async (newStatus: PlanStatus) => {
    const updatedConfig = { ...config, plan_status: newStatus, setup_completed: newStatus !== 'draft' };
    await saveMutation.mutateAsync(updatedConfig);
    const statusLabels: Record<PlanStatus, string> = {
      draft: 'Plan moved to Draft',
      active: 'Plan activated! You can now allocate targets.',
      closed: 'Plan closed.',
    };
    toast.success(statusLabels[newStatus]);
    if (newStatus === 'active') {
      onLockedAndAssign?.();
    }
  };

  const handleCreateNewPlan = async () => {
    const newConfig: TargetConfig = {
      fy_year: fyYear,
      ...DEFAULT_CONFIG,
      target_plan_name: `Plan ${plans.length + 1}`,
    };
    setConfig(newConfig);
    // Reset dynamic metrics for new plan
    setEnabledMetricIds(new Set());
    setMetricTargets({});
  };

  const hasAtLeastOneBasis = enabledMetricIds.size > 0;
  const hasAtLeastOneParameter = Object.values(config.enabled_parameters).some(v => v);
  const hasValidTargets = Array.from(enabledMetricIds).every(id => (metricTargets[id] ?? 0) > 0);
  const canActivate = hasAtLeastOneBasis && hasAtLeastOneParameter && hasValidTargets;
  const isReadOnly = config.plan_status === 'closed';

  if (isLoading || metricsDefLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Closed view - show read-only summary with reopen option
  if (isReadOnly) {
    const statusInfo = STATUS_CONFIG[config.plan_status];
    const StatusIcon = statusInfo.icon;
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                {config.target_plan_name}
              </CardTitle>
              <CardDescription>
                FY {fyYear - 1}-{String(fyYear).slice(-2)} Target Configuration
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`gap-1 ${statusInfo.color}`}>
                <StatusIcon className="h-3 w-3" />
                {statusInfo.label}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => handleStatusChange('draft')} disabled={saveMutation.isPending}>
                <Unlock className="h-4 w-4 mr-1" />
                Reopen as Draft
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Target Summary - dynamic */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {activeMetrics.map(metric => {
              const colors = COLOR_MAP[metric.color] || COLOR_MAP.blue;
              return (
                <div key={metric.id} className={`p-4 ${colors.bg} ${colors.darkBg} rounded-lg border ${colors.border} ${colors.darkBorder}`}>
                  <p className="text-sm text-muted-foreground">{metric.name}</p>
                  <p className="text-2xl font-bold">
                    {metric.unit === '₹' ? '₹' : ''}{formatNumber(metricTargets[metric.id] ?? 0)}
                    {metric.unit && metric.unit !== '₹' ? ` ${metric.unit}` : ''}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Enabled Parameters */}
          <div>
            <Label className="text-sm font-medium text-muted-foreground">Enabled Parameters</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {Object.entries({
                product: 'Product-wise',
                retailer: 'Retailer-wise',
                beat: 'Beat-wise',
                distributor: 'Distributor-wise',
                territory: 'Territory-wise',
                monthly: 'Month-wise',
              }).filter(([key]) => config.enabled_parameters[key as keyof typeof config.enabled_parameters]).map(([key, label]) => (
                <Badge key={key} variant="secondary">{label}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Edit view
  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-4">
        {/* Plan Selector */}
        {plans.length > 0 && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">Plan:</span>
            <div className="flex gap-1.5 flex-wrap">
              {plans.map(plan => {
                const isSelected = plan.id === config.id;
                const planStatusInfo = STATUS_CONFIG[plan.plan_status as PlanStatus] || STATUS_CONFIG.draft;
                const PlanStatusIcon = planStatusInfo.icon;
                return (
                  <Button
                    key={plan.id}
                    variant={isSelected ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => onPlanChange?.(plan.id)}
                  >
                    <PlanStatusIcon className="h-3 w-3" />
                    {plan.target_plan_name || 'Untitled Plan'}
                  </Button>
                );
              })}
            </div>
            <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={handleCreateNewPlan}>
              <Plus className="h-3 w-3" />
              New Plan
            </Button>
          </div>
        )}

        {/* Status Badge + Controls */}
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Settings className="h-5 w-5 text-primary" />
            {config.id ? 'Edit' : 'Create'} Target for FY {fyYear - 1}-{String(fyYear).slice(-2)}
          </CardTitle>
          {config.id && (
            <div className="flex items-center gap-2">
              {(() => {
                const statusInfo = STATUS_CONFIG[config.plan_status];
                const StatusIcon = statusInfo.icon;
                return (
                  <Badge variant="outline" className={`gap-1 ${statusInfo.color} ${statusInfo.bgColor}`}>
                    <StatusIcon className="h-3 w-3" />
                    {statusInfo.label}
                  </Badge>
                );
              })()}
            </div>
          )}
        </div>
        <CardDescription>
          Define target metrics, parameters, and company-wide goals
          {config.plan_status === 'active' && (
            <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
              ⚠ Changes will affect allocated targets
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Step 1: Target Plan Name */}
        <div className="space-y-2">
          <Label htmlFor="plan_name" className="text-sm font-semibold text-foreground">Plan Name</Label>
          <Input
            id="plan_name"
            value={config.target_plan_name}
            onChange={(e) => setConfig(prev => ({ ...prev, target_plan_name: e.target.value }))}
            placeholder="e.g., FY 25-26 Sales Plan"
            className="max-w-md"
          />
        </div>

        <Separator />

        {/* Step 2: Target Metrics - Dynamic */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-foreground">Target Metrics</Label>
              <p className="text-xs text-muted-foreground mt-1">Select which metrics to track</p>
            </div>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setShowCreateMetricDialog(true)}>
              <Plus className="h-3 w-3" />
              Custom Metric
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {metricDefinitions.map(metric => {
              const isEnabled = enabledMetricIds.has(metric.id);
              const IconComp = ICON_MAP[metric.icon] || Target;
              const colors = COLOR_MAP[metric.color] || COLOR_MAP.blue;
              return (
                <div
                  key={metric.id}
                  onClick={() => handleToggleMetric(metric.id)}
                  className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    isEnabled
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                      isEnabled ? `${colors.bg} ${colors.text} ${colors.darkBg} ${colors.darkText}` : 'bg-muted text-muted-foreground'
                    }`}>
                      <IconComp className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{metric.name}</p>
                      <p className="text-xs text-muted-foreground">{metric.unit || 'count'}</p>
                    </div>
                  </div>
                  {isEnabled && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {!metric.is_system && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Will be handled by delete mutation
                      }}
                      className="absolute bottom-2 right-2 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete custom metric"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quantity unit selector for Quantity metric */}
          {activeMetrics.some(m => m.name === 'Quantity') && (
            <div className="flex flex-wrap gap-4 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Quantity Unit</Label>
                <Select
                  value={config.quantity_unit}
                  onValueChange={(v) => setConfig(prev => ({ ...prev, quantity_unit: v }))}
                >
                  <SelectTrigger className="w-36 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUANTITY_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>{unit}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {activeMetrics.some(m => m.name === 'Revenue') && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Currency</Label>
                  <Select value="₹ (INR)" onValueChange={() => {}}>
                    <SelectTrigger className="w-36 h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Step 3: Target Parameters */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-semibold text-foreground">Target Parameters</Label>
              <p className="text-xs text-muted-foreground mt-1">Select the breakdowns for target allocation</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreateParamDialog(true)}
              className="flex items-center gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Custom Parameter
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {parameterDefinitions.map((param) => {
              const isChecked = !!(config.enabled_parameters as Record<string, boolean>)?.[param.parameter_key];
              return (
                <div
                  key={param.parameter_key}
                  className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all relative group ${
                    isChecked
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-muted-foreground/40'
                  }`}
                >
                  <div
                    className="flex items-center gap-2.5 flex-1"
                    onClick={() => handleParameterChange(param.parameter_key as keyof typeof config.enabled_parameters, !isChecked)}
                  >
                    <span className="text-base">{param.icon}</span>
                    <span className="font-medium text-sm text-foreground">{param.name}</span>
                    {isChecked && (
                      <div className="ml-auto w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {!param.is_system && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete parameter "${param.name}"?`)) {
                          deleteParamMutation.mutate(param.id);
                        }
                      }}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Create Parameter Dialog */}
        <CreateParameterDialog open={showCreateParamDialog} onOpenChange={setShowCreateParamDialog} />

        <Separator />

        {/* Step 3.5: Target Duration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <div>
              <Label className="text-sm font-semibold text-foreground">Target Duration</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Select the months for which targets apply</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Start Month</Label>
              <Select
                value={String(config.target_start_month)}
                onValueChange={(v) => {
                  const val = parseInt(v);
                  setConfig(prev => ({
                    ...prev,
                    target_start_month: val,
                    target_end_month: prev.target_end_month < val ? val : prev.target_end_month,
                  }));
                }}
              >
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FY_MONTH_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">End Month</Label>
              <Select
                value={String(config.target_end_month)}
                onValueChange={(v) => setConfig(prev => ({ ...prev, target_end_month: parseInt(v) }))}
              >
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FY_MONTH_OPTIONS.filter(m => m.value >= config.target_start_month).map((m) => (
                    <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Step 4: FY Overview - Dynamic */}
        {hasAtLeastOneBasis && (
          <>
            <Separator />
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold text-foreground">FY {fyYear - 1}-{String(fyYear).slice(-2)} Overview</Label>
                <p className="text-xs text-muted-foreground mt-1">Set total targets for each enabled metric</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {activeMetrics.map(metric => {
                  const colors = COLOR_MAP[metric.color] || COLOR_MAP.blue;
                  const displayUnit = metric.name === 'Quantity' ? config.quantity_unit : metric.unit;
                  return (
                    <div key={metric.id} className={`rounded-xl border ${colors.border} ${colors.bg} ${colors.darkBg} ${colors.darkBorder} p-4 flex items-center justify-between gap-4`}>
                      <Label className={`text-sm font-medium ${colors.text} ${colors.darkText} whitespace-nowrap`}>
                        {metric.name}{displayUnit ? ` (${displayUnit})` : ''}
                      </Label>
                      <Input
                        type="text"
                        value={(metricTargets[metric.id] ?? 0) > 0 ? formatNumber(metricTargets[metric.id] ?? 0) : ''}
                        onChange={(e) => handleMetricTargetChange(metric.id, Math.round(parseNumber(e.target.value)))}
                        placeholder="0"
                        className="w-32 text-right font-semibold bg-background"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Step 5: Parameter Breakdown */}
        {hasAtLeastOneParameter && hasAtLeastOneBasis && (
          <>
            <Separator />
            <ParameterBreakdownSection
              config={config}
              activeMetrics={activeMetrics}
              metricTargets={metricTargets}
              breakdownData={breakdownData}
              setBreakdownData={setBreakdownData}
              equalDivide={equalDivide}
              setEqualDivide={setEqualDivide}
              activeParamTab={activeParamTab}
              setActiveParamTab={setActiveParamTab}
              formatNumber={formatNumber}
              parseNumber={parseNumber}
              quantityUnit={config.quantity_unit}
            />
          </>
        )}

        <Separator />

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {config.plan_status === 'draft' ? 'Save Draft' : 'Save Changes'}
          </Button>
          
          <div className="flex items-center gap-2">
            {config.plan_status === 'draft' && (
              <Button 
                onClick={() => handleStatusChange('active')} 
                disabled={!canActivate || saveMutation.isPending}
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Activate & Assign
              </Button>
            )}
            {config.plan_status === 'active' && (
              <>
                <Button variant="outline" size="sm" onClick={() => handleStatusChange('draft')} disabled={saveMutation.isPending}>
                  Back to Draft
                </Button>
                <Button variant="destructive" size="sm" onClick={() => handleStatusChange('closed')} disabled={saveMutation.isPending} className="gap-1">
                  <Archive className="h-4 w-4" />
                  Close Plan
                </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>

      {/* Create Custom Metric Dialog */}
      <CreateMetricDialog
        open={showCreateMetricDialog}
        onOpenChange={setShowCreateMetricDialog}
      />
    </Card>
  );
}

// === Create Metric Dialog ===
function CreateMetricDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [color, setColor] = useState('blue');
  const [icon, setIcon] = useState('target');
  const createMutation = useCreateMetricDefinition();

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Metric name is required');
      return;
    }
    await createMutation.mutateAsync({ name: name.trim(), unit: unit.trim(), icon, color });
    toast.success(`Metric "${name}" created`);
    setName('');
    setUnit('');
    setColor('blue');
    setIcon('target');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Custom Metric</DialogTitle>
          <DialogDescription>Define a new target metric for your plans</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="metric_name">Metric Name</Label>
            <Input id="metric_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Demo Calls" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="metric_unit">Unit (optional)</Label>
            <Input id="metric_unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g., calls, SKUs, count" />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_COLORS.map(c => {
                const colors = COLOR_MAP[c];
                return (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full ${colors.bg} border-2 transition-all ${
                      color === c ? 'border-foreground scale-110' : `${colors.border} hover:scale-105`
                    }`}
                    title={c}
                  />
                );
              })}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_ICONS.map(ic => {
                const IconComp = ICON_MAP[ic];
                return (
                  <button
                    key={ic}
                    onClick={() => setIcon(ic)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-all ${
                      icon === ic ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-muted-foreground/40 text-muted-foreground'
                    }`}
                    title={ic}
                  >
                    <IconComp className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate} disabled={createMutation.isPending || !name.trim()}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create Metric
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// === Product Category Groups Component - Dynamic ===
function ProductCategoryGroups({
  items,
  activeMetrics,
  formatNumber,
  parseNumber,
  handleItemChange,
  quantityUnit,
}: {
  items: BreakdownItem[];
  activeMetrics: TargetMetricDefinition[];
  formatNumber: (n: number) => string;
  parseNumber: (v: string) => number;
  handleItemChange: (paramKey: string, itemId: string, metricId: string, value: number) => void;
  quantityUnit: string;
}) {
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const map: Record<string, { name: string; items: BreakdownItem[] }> = {};
    items.forEach(item => {
      const catKey = item.categoryId || 'uncategorized';
      const catName = item.categoryName || 'Uncategorized';
      if (!map[catKey]) map[catKey] = { name: catName, items: [] };
      map[catKey].items.push(item);
    });
    return Object.entries(map).sort((a, b) => a[1].name.localeCompare(b[1].name));
  }, [items]);

  const toggleCategory = (catKey: string) => {
    setOpenCategories(prev => ({ ...prev, [catKey]: !prev[catKey] }));
  };

  const getCategoryTotal = (catItems: BreakdownItem[], metricId: string) =>
    catItems.reduce((sum, item) => sum + (item.metrics[metricId] ?? 0), 0);

  const gridCols = `1.5fr ${activeMetrics.map(() => '1fr').join(' ')}`;

  return (
    <div className="space-y-2">
      {grouped.map(([catKey, { name: catName, items: catItems }]) => {
        const isOpen = openCategories[catKey] ?? false;
        return (
          <div key={catKey} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleCategory(catKey)}
              className="w-full grid gap-2 items-center p-2.5 bg-muted/50 hover:bg-muted transition-colors"
              style={{ gridTemplateColumns: gridCols }}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground text-left">
                {isOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                {catName}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{catItems.length}</Badge>
              </span>
              {activeMetrics.map(metric => (
                <span key={metric.id} className="text-xs font-medium text-muted-foreground">
                  {metric.unit === '₹' ? '₹' : ''}{formatNumber(getCategoryTotal(catItems, metric.id))}
                </span>
              ))}
            </button>
            {isOpen && (
              <div className="divide-y">
                {catItems.map(item => (
                  <div
                    key={item.id}
                    className="grid gap-2 items-center p-2 pl-8 bg-card hover:bg-accent/30 transition-colors"
                    style={{ gridTemplateColumns: gridCols }}
                  >
                    <span className="text-sm text-foreground truncate">{item.name}</span>
                    {activeMetrics.map(metric => (
                      <Input
                        key={metric.id}
                        type="text"
                        className="h-8 text-sm"
                        value={(item.metrics[metric.id] ?? 0) > 0 ? formatNumber(item.metrics[metric.id] ?? 0) : ''}
                        onChange={(e) => handleItemChange('product', item.id, metric.id, parseNumber(e.target.value))}
                        placeholder="0"
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// === Parameter Breakdown Section Component - Dynamic ===
interface ParameterBreakdownProps {
  config: TargetConfig;
  activeMetrics: TargetMetricDefinition[];
  metricTargets: Record<string, number>;
  breakdownData: Record<string, BreakdownItem[]>;
  setBreakdownData: React.Dispatch<React.SetStateAction<Record<string, BreakdownItem[]>>>;
  equalDivide: Record<string, boolean>;
  setEqualDivide: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  activeParamTab: string;
  setActiveParamTab: (tab: string) => void;
  formatNumber: (n: number) => string;
  parseNumber: (v: string) => number;
  quantityUnit: string;
}

function ParameterBreakdownSection({
  config,
  activeMetrics,
  metricTargets,
  breakdownData,
  setBreakdownData,
  equalDivide,
  setEqualDivide,
  activeParamTab,
  setActiveParamTab,
  formatNumber,
  parseNumber,
  quantityUnit,
}: ParameterBreakdownProps) {
  const enabledParams = useMemo(() => 
    Object.entries(config.enabled_parameters)
      .filter(([, v]) => v)
      .map(([k]) => k),
    [config.enabled_parameters]
  );

  useEffect(() => {
    if (enabledParams.length > 0 && (!activeParamTab || !enabledParams.includes(activeParamTab))) {
      setActiveParamTab(enabledParams[0]);
    }
  }, [enabledParams, activeParamTab, setActiveParamTab]);

  // Fetch data for each enabled parameter
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: ['products-breakdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, category_id, product_categories(id, name)')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: config.enabled_parameters.product,
  });

  const { data: distributors, isLoading: distributorsLoading } = useQuery({
    queryKey: ['distributors-breakdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('distributors')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: config.enabled_parameters.distributor,
  });

  const { data: territories, isLoading: territoriesLoading } = useQuery({
    queryKey: ['territories-breakdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('territories')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: config.enabled_parameters.territory,
  });

  const { data: beats, isLoading: beatsLoading } = useQuery({
    queryKey: ['beats-breakdown'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beats')
        .select('id, beat_name')
        .order('beat_name');
      if (error) throw error;
      return (data ?? []).map(b => ({ id: b.id, name: b.beat_name }));
    },
    enabled: config.enabled_parameters.beat,
  });

  // Initialize breakdown data when source data loads
  useEffect(() => {
    const newData: Record<string, BreakdownItem[]> = { ...breakdownData };
    const emptyMetrics: Record<string, number> = {};
    activeMetrics.forEach(m => { emptyMetrics[m.id] = 0; });

    if (config.enabled_parameters.product && products && !newData.product) {
      newData.product = products.map(p => {
        const cat = p.product_categories as any;
        return { id: p.id, name: p.name, metrics: { ...emptyMetrics }, categoryId: cat?.id, categoryName: cat?.name ?? 'Uncategorized' };
      });
    }
    if (config.enabled_parameters.distributor && distributors && !newData.distributor) {
      newData.distributor = distributors.map(d => ({ id: d.id, name: d.name, metrics: { ...emptyMetrics } }));
    }
    if (config.enabled_parameters.territory && territories && !newData.territory) {
      newData.territory = territories.map(t => ({ id: t.id, name: t.name, metrics: { ...emptyMetrics } }));
    }
    if (config.enabled_parameters.beat && beats && !newData.beat) {
      newData.beat = beats.map(b => ({ id: b.id, name: b.name, metrics: { ...emptyMetrics } }));
    }
    if (config.enabled_parameters.monthly && !newData.monthly) {
      const activeMonths = FY_MONTHS
        .map((m, i) => ({ name: m, index: i }))
        .filter((_, i) => (i + 1) >= config.target_start_month && (i + 1) <= config.target_end_month);
      newData.monthly = activeMonths.map(m => ({ id: `month-${m.index}`, name: m.name, metrics: { ...emptyMetrics } }));
    }
    if (config.enabled_parameters.retailer && !newData.retailer) {
      newData.retailer = [];
    }

    setBreakdownData(newData);
  }, [products, distributors, territories, beats, config.enabled_parameters, config.target_start_month, config.target_end_month, activeMetrics]);

  const handleItemChange = (paramKey: string, itemId: string, metricId: string, value: number) => {
    setBreakdownData(prev => ({
      ...prev,
      [paramKey]: (prev[paramKey] ?? []).map(item =>
        item.id === itemId ? { ...item, metrics: { ...item.metrics, [metricId]: value } } : item
      ),
    }));
  };

  const handleEqualDivide = (paramKey: string) => {
    const items = breakdownData[paramKey];
    if (!items || items.length === 0) return;

    const count = items.length;
    const newItems = items.map(item => {
      const newMetrics = { ...item.metrics };
      activeMetrics.forEach(m => {
        newMetrics[m.id] = Math.round((metricTargets[m.id] ?? 0) / count);
      });
      return { ...item, metrics: newMetrics };
    });

    setBreakdownData(prev => ({ ...prev, [paramKey]: newItems }));
    setEqualDivide(prev => ({ ...prev, [paramKey]: true }));
    toast.success('Targets divided equally');
  };

  const getTotal = (paramKey: string, metricId: string) => {
    return (breakdownData[paramKey] ?? []).reduce((sum, item) => sum + (item.metrics[metricId] ?? 0), 0);
  };

  const isLoadingParam = (paramKey: string) => {
    switch (paramKey) {
      case 'product': return productsLoading;
      case 'distributor': return distributorsLoading;
      case 'territory': return territoriesLoading;
      case 'beat': return beatsLoading;
      default: return false;
    }
  };

  if (enabledParams.length === 0) return null;

  const gridCols = `1.5fr ${activeMetrics.map(() => '1fr').join(' ')}`;

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-semibold text-foreground">Parameter Breakdown</Label>
        <p className="text-xs text-muted-foreground mt-1">Allocate targets across selected parameters</p>
      </div>

      <Tabs value={activeParamTab} onValueChange={setActiveParamTab}>
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {enabledParams.map(key => {
            const info = PARAM_TAB_MAP[key];
            if (!info) return null;
            return (
              <TabsTrigger key={key} value={key} className="flex items-center gap-1.5 text-xs px-3 py-1.5">
                <span>{info.icon}</span>
                <span>{info.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {enabledParams.map(paramKey => {
          const items = breakdownData[paramKey] ?? [];
          const info = PARAM_TAB_MAP[paramKey];
          if (!info) return null;

          return (
            <TabsContent key={paramKey} value={paramKey} className="mt-4 space-y-3">
              {paramKey === 'retailer' ? (
                <div className="p-6 text-center text-sm text-muted-foreground border rounded-lg bg-muted/30">
                  Retailer-wise breakdown is managed at the individual user level during hierarchy allocation.
                </div>
              ) : isLoadingParam(paramKey) ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : items.length === 0 ? (
                <div className="p-6 text-center text-sm text-muted-foreground border rounded-lg bg-muted/30">
                  No {info.label.toLowerCase()} found. Add them in their respective management section first.
                </div>
              ) : (
                <>
                  {/* Equal divide toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {items.length} {info.label.toLowerCase()} found
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-8"
                      onClick={() => handleEqualDivide(paramKey)}
                    >
                      <Divide className="h-3 w-3" />
                      Equally Divide
                    </Button>
                  </div>

                  {/* Header */}
                  <div className="grid gap-2" style={{ gridTemplateColumns: gridCols }}>
                    <div className="text-xs font-medium text-muted-foreground px-2">{info.label}</div>
                    {activeMetrics.map(metric => {
                      const displayUnit = metric.name === 'Quantity' ? quantityUnit : metric.unit;
                      return (
                        <div key={metric.id} className="text-xs font-medium text-muted-foreground px-2">
                          {metric.name}{displayUnit ? ` (${displayUnit})` : ''}
                        </div>
                      );
                    })}
                  </div>

                  {/* Items - grouped by category for products */}
                  <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                    {paramKey === 'product' ? (
                      <ProductCategoryGroups
                        items={items}
                        activeMetrics={activeMetrics}
                        formatNumber={formatNumber}
                        parseNumber={parseNumber}
                        handleItemChange={handleItemChange}
                        quantityUnit={quantityUnit}
                      />
                    ) : (
                      items.map(item => (
                        <div
                          key={item.id}
                          className="grid gap-2 items-center p-2 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                          style={{ gridTemplateColumns: gridCols }}
                        >
                          <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
                          {activeMetrics.map(metric => (
                            <Input
                              key={metric.id}
                              type="text"
                              className="h-8 text-sm"
                              value={(item.metrics[metric.id] ?? 0) > 0 ? formatNumber(item.metrics[metric.id] ?? 0) : ''}
                              onChange={(e) => handleItemChange(paramKey, item.id, metric.id, parseNumber(e.target.value))}
                              placeholder="0"
                            />
                          ))}
                        </div>
                      ))
                    )}
                  </div>

                  {/* Total footer */}
                  <div
                    className="grid gap-2 items-center p-2 rounded-lg bg-primary/5 border border-primary/20 font-semibold"
                    style={{ gridTemplateColumns: gridCols }}
                  >
                    <span className="text-sm text-foreground">Total</span>
                    {activeMetrics.map(metric => (
                      <span key={metric.id} className="text-sm text-foreground">
                        {metric.unit === '₹' ? '₹' : ''}{formatNumber(getTotal(paramKey, metric.id))}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
