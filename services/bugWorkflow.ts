import { UserRole } from '../types';

export const canCompleteBug = (isBug: boolean, role?: string | null) => {
  if (!isBug) return true;
  return role === UserRole.QA;
};

export const withCloseReason = (customFields: Record<string, unknown>, reason: string) => {
  return { ...customFields, closeReason: reason };
};

export const incrementReopenCount = (customFields: Record<string, unknown>) => {
  const current = typeof customFields.reopenCount === 'number' ? customFields.reopenCount : 0;
  return { ...customFields, reopenCount: current + 1 };
};
