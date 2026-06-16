import { useFeature } from '@/hooks/useFeature';

/**
 * useProcessRequirement — read a process-level requirement (e.g. visit_check_in_mandatory)
 * through the unified feature management system.
 *
 * This is the recommended replacement for one-off policy hooks. It honors the full
 * resolution order: global → user → role → company → default → dependencies.
 *
 * @example
 *   const { required } = useProcessRequirement('visit_check_in_mandatory');
 *   if (required) { ... }
 */
export function useProcessRequirement(featureKey: string) {
  const { enabled, isLoading, blockedBy, error } = useFeature(featureKey);
  return {
    required: enabled,
    isLoading,
    blockedBy,
    error,
  };
}
