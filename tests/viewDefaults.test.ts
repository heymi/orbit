import { describe, expect, it } from 'vitest';
import { getDefaultsForView } from '../services/viewDefaults';

describe('getDefaultsForView', () => {
  it('returns bug defaults', () => {
    const defaults = getDefaultsForView('bug');
    expect(defaults.sortBy).toBe('priority');
    expect(defaults.groupBy).toBe('status');
  });

  it('returns empty defaults for other views', () => {
    expect(getDefaultsForView('my')).toEqual({});
  });
});
