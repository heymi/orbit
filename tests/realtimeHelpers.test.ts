import { describe, expect, it } from 'vitest';
import { applyRealtimeChange } from '../services/realtimeHelpers';

type Item = { id: string; name: string };

describe('applyRealtimeChange', () => {
  it('handles insert', () => {
    const list: Item[] = [{ id: '1', name: 'A' }];
    const result = applyRealtimeChange(list, { eventType: 'INSERT', new: { id: '2', name: 'B' } });
    expect(result[0].id).toBe('2');
  });

  it('handles update', () => {
    const list: Item[] = [{ id: '1', name: 'A' }];
    const result = applyRealtimeChange(list, { eventType: 'UPDATE', new: { id: '1', name: 'A2' } });
    expect(result[0].name).toBe('A2');
  });

  it('handles delete', () => {
    const list: Item[] = [{ id: '1', name: 'A' }];
    const result = applyRealtimeChange(list, { eventType: 'DELETE', old: { id: '1', name: 'A' } });
    expect(result).toHaveLength(0);
  });
});
