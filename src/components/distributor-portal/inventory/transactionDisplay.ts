export type InventoryTransactionDisplayInput = {
  transaction_type?: string | null;
  reference_type?: string | null;
  batch_number?: string | null;
};

export const inventoryTransactionTypeLabels: Record<string, string> = {
  GRN: 'GRN',
  GRN_INWARD: 'GRN Inward',
  OPENING_STOCK: 'Opening Stock',
  RESERVE: 'Reserve Stock',
  RELEASE: 'Release Stock',
  MARK_DAMAGED: 'Mark Damaged',
  MARK_EXPIRED: 'Mark Expired',
  DISPATCH: 'Dispatch',
  OUTWARD: 'Outward',
  ADJUSTMENT: 'Adjustment',
  inward: 'Inward',
  LEGACY_ENTRY: 'Legacy Entry',
};

export const inventoryMovementTargets: Record<string, { label: string; color: string }> = {
  GRN: { label: 'Available', color: 'bg-green-500' },
  GRN_INWARD: { label: 'Available', color: 'bg-green-500' },
  OPENING_STOCK: { label: 'Available', color: 'bg-green-500' },
  RESERVE: { label: 'Reserved', color: 'bg-amber-500' },
  RELEASE: { label: 'Available', color: 'bg-green-500' },
  MARK_DAMAGED: { label: 'Damaged', color: 'bg-red-500' },
  MARK_EXPIRED: { label: 'Expired', color: 'bg-slate-400' },
  DISPATCH: { label: 'Dispatched', color: 'bg-purple-500' },
  OUTWARD: { label: 'Outward', color: 'bg-purple-500' },
  ADJUSTMENT: { label: 'Adjusted', color: 'bg-yellow-500' },
  inward: { label: 'Available', color: 'bg-green-500' },
  LEGACY_ENTRY: { label: 'Inventory', color: 'bg-slate-400' },
};

export const isNegativeInventoryTransaction = (type?: string | null) =>
  !!type && ['OUTWARD', 'DISPATCH', 'MARK_DAMAGED', 'MARK_EXPIRED', 'RESERVE'].includes(type);

export const resolveInventoryTransactionType = (txn: InventoryTransactionDisplayInput) => {
  const explicitType = txn.transaction_type || txn.reference_type || null;
  if (explicitType) return explicitType;

  if (txn.batch_number) {
    return 'OPENING_STOCK';
  }

  return 'LEGACY_ENTRY';
};

export const getInventoryTransactionTypeLabel = (type?: string | null) => {
  if (!type) return inventoryTransactionTypeLabels.LEGACY_ENTRY;
  return inventoryTransactionTypeLabels[type] || type.replace(/_/g, ' ');
};

export const getInventoryMovementTarget = (type?: string | null) => {
  if (!type) return inventoryMovementTargets.LEGACY_ENTRY;
  return inventoryMovementTargets[type] || inventoryMovementTargets.LEGACY_ENTRY;
};
