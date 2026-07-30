import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { BookOpen, Lock } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { useFeatureContext } from '@/context/FeatureContext';

const FEATURE_KEY = 'price_books_enabled';

/**
 * Second surface for the SAME `feature_flags` row as Feature Management.
 * One source of truth (feature_key = 'price_books_enabled'), two places to toggle.
 */
export function PriceBookFeatureToggle() {
  const qc = useQueryClient();
  const { hasAdminAccess } = useAdminAccess();
  const { refresh } = useFeatureContext();

  const { data: flag, isLoading } = useQuery({
    queryKey: ['feature-flag', FEATURE_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_flags')
        .select('id, is_enabled, feature_name')
        .eq('feature_key', FEATURE_KEY)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (isEnabled: boolean) => {
      if (!flag?.id) throw new Error('Feature flag not found');
      const { error } = await supabase
        .from('feature_flags')
        .update({ is_enabled: isEnabled })
        .eq('id', flag.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['feature-flag', FEATURE_KEY] });
      qc.invalidateQueries({ queryKey: ['feature-flags'] });
      await refresh();
      toast.success('Price book pricing updated');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not update this setting'),
  });

  if (isLoading || !flag) return null;

  const on = !!flag.is_enabled;

  return (
    <Card className="mb-6 border-primary/30">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <BookOpen className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Label htmlFor="price-books-enabled" className="text-base font-semibold">
                  Use Price Books for Order Entry
                </Label>
                <Badge variant={on ? 'default' : 'secondary'}>{on ? 'On' : 'Off'}</Badge>
                {!hasAdminAccess && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" /> Read-only
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                When on, order lines are priced from the retailer's price book instead of the product's
                default price. Products not in a price book keep using their default price.
              </p>
            </div>
          </div>
          <Switch
            id="price-books-enabled"
            checked={on}
            disabled={!hasAdminAccess || toggle.isPending}
            onCheckedChange={(checked) => toggle.mutate(checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export default PriceBookFeatureToggle;
