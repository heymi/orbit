import { describe, expect, it } from 'vitest';
import { diffSubtasks } from '../services/subtaskDiff';
import { Subtask } from '../types';

describe('diffSubtasks', () => {
  it('detects deletions and upserts', () => {
    const existing = ['s1', 's2', 's3'];
    const desired: Subtask[] = [
      { id: 's1', title: 'A', completed: false },
      { id: 's3', title: 'C', completed: true },
    ];
    const result = diffSubtasks(existing, desired);
    expect(result.toDelete).toEqual(['s2']);
    expect(result.toUpsert.map(s => s.id)).toEqual(['s1', 's3']);
    expect(result.toInsert).toEqual([]);
  });

  it('detects inserts without ids', () => {
    const existing: string[] = [];
    const desired: Subtask[] = [
      { id: '', title: 'New', completed: false },
      { id: 's1', title: 'Existing', completed: true },
    ];
    const result = diffSubtasks(existing, desired);
    expect(result.toInsert).toHaveLength(1);
    expect(result.toUpsert).toHaveLength(1);
  });
});
