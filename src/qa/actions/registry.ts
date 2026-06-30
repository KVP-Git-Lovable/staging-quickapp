import { retailerActions } from './retailerActions';
import { visitActions } from './visitActions';
import { orderActions } from './orderActions';
import { attendanceActions } from './attendanceActions';
import { smokeActions } from './smokeActions';
import { offlineSyncActions } from './offlineSyncActions';
import { productVariantActions } from './productVariantActions';
import { pricingCoverageActions } from './pricingCoverageActions';
import type { QATestAction } from '@/qa/types';

export const allQAActions: QATestAction[] = [
  ...smokeActions,
  ...retailerActions,
  ...visitActions,
  ...orderActions,
  ...attendanceActions,
  ...offlineSyncActions,
  ...productVariantActions,
  ...pricingCoverageActions,
];


export const actionsByEntity = (): Record<string, QATestAction[]> => {
  const grouped: Record<string, QATestAction[]> = {};
  for (const action of allQAActions) {
    if (!grouped[action.entity]) grouped[action.entity] = [];
    grouped[action.entity].push(action);
  }
  return grouped;
};

export const getActionById = (id: string): QATestAction | undefined =>
  allQAActions.find((a) => a.id === id);
