import React from 'react';
import { useFeature } from '@/hooks/useFeature';
import { Skeleton } from '@/components/ui/skeleton';

interface FeatureGateProps {
  feature: string;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Conditionally render children based on whether a feature is enabled
 * for the current company.
 *
 * @example
 *   <FeatureGate feature="location_capture_order">
 *     <LocationSelector />
 *   </FeatureGate>
 */
export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  fallback = null,
  loadingFallback,
  children,
}) => {
  const { enabled, isLoading } = useFeature(feature);
  if (isLoading) return <>{loadingFallback ?? <Skeleton className="h-8 w-full" />}</>;
  return <>{enabled ? children : fallback}</>;
};
