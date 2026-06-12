import { useProductUnits } from '@/hooks/useProductUnits';

interface Props {
  productId: string;
  /** Legacy unit string used when no product_uom_mapping exists. */
  fallback?: string | null;
  /** Optional explicit code from a snapshot (line item already records the chosen UOM). */
  snapshotCode?: string | null;
  className?: string;
}

/**
 * Resolves a friendly UOM label for a product line.
 *
 * Resolution order:
 *   1. snapshotCode (the UOM stored on the line itself, if any)
 *   2. base UOM name from product_uom_mapping
 *   3. legacy `fallback` string (e.g. the order's free-text `unit`)
 */
export default function UomLabel({ productId, fallback, snapshotCode, className }: Props) {
  const { data, isLoading } = useProductUnits(productId);

  if (snapshotCode) {
    return <span className={className}>{snapshotCode}</span>;
  }
  if (isLoading) {
    return <span className={className}>…</span>;
  }
  const base = (data || []).find((u) => u.isBase);
  const label = base?.code || fallback || '';
  if (!label) return null;
  return <span className={className}>{label}</span>;
}
