import { describe, expect, it } from 'vitest';
import { UserRole } from '../types';
import { canCompleteBug, incrementReopenCount, withCloseReason } from '../services/bugWorkflow';

describe('bug workflow helpers', () => {
  it('requires QA role to complete bug', () => {
    expect(canCompleteBug(true, UserRole.QA)).toBe(true);
    expect(canCompleteBug(true, UserRole.Development)).toBe(false);
    expect(canCompleteBug(false, UserRole.Development)).toBe(true);
  });

  it('adds close reason', () => {
    const result = withCloseReason({ a: 1 }, 'duplicate');
    expect(result.closeReason).toBe('duplicate');
  });

  it('increments reopen count', () => {
    const first = incrementReopenCount({});
    expect(first.reopenCount).toBe(1);
    const second = incrementReopenCount({ reopenCount: 2 });
    expect(second.reopenCount).toBe(3);
  });
});
