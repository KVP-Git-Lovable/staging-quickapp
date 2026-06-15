import { useFeatureContext, EffectiveFeature } from '@/context/FeatureContext';

/**
 * useFeature - check if a feature is enabled for the current company.
 *
 * @example
 *   const { enabled, blockedBy, isLoading } = useFeature('same_day_delivery');
 */
export function useFeature(featureKey: string) {
  const { features, isLoading, error } = useFeatureContext();
  const f = features.get(featureKey);
  return {
    enabled: f?.enabled ?? false,
    blockedBy: f?.blocked_by ?? [],
    feature: f as EffectiveFeature | undefined,
    isLoading,
    error,
  };
}

/**
 * useFeatureDependencies - check if a feature is blocked by missing prerequisites.
 */
export function useFeatureDependencies(featureKey: string) {
  const { features } = useFeatureContext();
  const f = features.get(featureKey);
  const blockedBy = f?.blocked_by ?? [];
  return {
    enabled: f?.enabled ?? false,
    blockedBy,
    canEnable: blockedBy.length === 0,
  };
}

export function useAllFeatures() {
  const { features, isLoading, refresh } = useFeatureContext();
  return { features: Array.from(features.values()), isLoading, refresh };
}
