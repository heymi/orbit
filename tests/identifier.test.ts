import { describe, expect, it } from 'vitest';
import { buildIdentifier } from '../services/identifier';

describe('buildIdentifier', () => {
  it('builds a normalized task identifier', () => {
    const result = buildIdentifier('Fix Login Flow', new Set());
    expect(result).toBe('task-fix-login-flow');
  });

  it('deduplicates by suffix', () => {
    const existing = new Set(['task-a', 'task-a-2']);
    const result = buildIdentifier('a', existing);
    expect(result).toBe('task-a-3');
  });
});
