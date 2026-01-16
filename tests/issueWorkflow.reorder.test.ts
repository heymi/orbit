import { describe, expect, it } from 'vitest';
import { computeReorderOrder } from '../services/issueWorkflow';

describe('computeReorderOrder', () => {
  it('places item before target with averaged order', () => {
    const list = [
      { id: 'a', customFields: { order: 1 } },
      { id: 'b', customFields: { order: 2 } },
      { id: 'c', customFields: { order: 3 } },
    ];
    const result = computeReorderOrder(list, 'c', 'b');
    expect(result).toEqual({ id: 'c', order: 1.5 });
  });

  it('places item at top when target is first', () => {
    const list = [
      { id: 'a', customFields: { order: 10 } },
      { id: 'b', customFields: { order: 20 } },
    ];
    const result = computeReorderOrder(list, 'b', 'a');
    expect(result).toEqual({ id: 'b', order: 9 });
  });

  it('places item at bottom when target is last', () => {
    const list = [
      { id: 'a', customFields: { order: 5 } },
      { id: 'b', customFields: { order: 6 } },
      { id: 'c', customFields: { order: 7 } },
    ];
    const result = computeReorderOrder(list, 'a', 'c');
    expect(result).toEqual({ id: 'a', order: 6.5 });
  });
});
