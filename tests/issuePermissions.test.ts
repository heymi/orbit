import { describe, expect, it } from 'vitest';
import { UserRole } from '../types';
import { canExecuteQaAction, resolveActivityUserId } from '../services/issuePermissions';

describe('issue permissions helpers', () => {
  it('resolves activity user id with fallback', () => {
    expect(resolveActivityUserId('u123')).toBe('u123');
    expect(resolveActivityUserId()).toBe('unknown');
    expect(resolveActivityUserId(null)).toBe('unknown');
  });

  it('allows QA role to execute QA actions', () => {
    expect(canExecuteQaAction(UserRole.QA)).toBe(true);
    expect(canExecuteQaAction(UserRole.Development)).toBe(false);
    expect(canExecuteQaAction()).toBe(false);
  });
});
