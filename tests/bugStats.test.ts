import { describe, expect, it } from 'vitest';
import { buildBugStats } from '../services/bugStats';
import { Issue, Priority, Status } from '../types';

const makeIssue = (id: string, status: Status, bug = false, reopenCount = 0): Issue => ({
  id,
  identifier: id,
  title: id,
  description: '',
  status,
  priority: Priority.NoPriority,
  assigneeId: null,
  teamId: 't',
  projectId: null,
  cycleId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  labels: bug ? ['Bug'] : [],
  subtasks: [],
  customFields: bug ? { reopenCount } : {},
  activities: [],
});

describe('buildBugStats', () => {
  it('computes bug stats', () => {
    const issues = [
      makeIssue('1', Status.InProgress, true),
      makeIssue('2', Status.Done, true),
      makeIssue('3', Status.Canceled, true, 1),
      makeIssue('4', Status.Todo, false),
    ];
    const stats = buildBugStats(issues);
    expect(stats.total).toBe(3);
    expect(stats.fixed).toBe(1);
    expect(stats.open).toBe(1);
    expect(stats.reopened).toBe(1);
  });
});
