import { UserRole } from '../types';

export const resolveActivityUserId = (userId?: string | null) => {
  return userId || 'unknown';
};

export const canExecuteQaAction = (role?: string | null) => {
  return role === UserRole.QA;
};
