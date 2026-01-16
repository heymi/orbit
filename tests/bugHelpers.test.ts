import { describe, expect, it } from 'vitest';
import { applyBugLabel, isBugIssue } from '../services/bugHelpers';
import { Issue, Priority, Status } from '../types';

const baseIssue: Issue = {
  id: '1',
  identifier: 'task-1',
  title: 'Test',
  description: '',
  status: Status.Backlog,
  priority: Priority.NoPriority,
  assigneeId: null,
  teamId: 't1',
  projectId: null,
  cycleId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  labels: [],
  subtasks: [],
  customFields: {},
  activities: [],
};

describe('bug helpers', () => {
  it('adds Bug label if missing', () => {
    expect(applyBugLabel(['UI'])).toEqual(['Bug', 'UI']);
  });

  it('detects bug issues', () => {
    expect(isBugIssue({ ...baseIssue, labels: ['Bug'] })).toBe(true);
    expect(isBugIssue(baseIssue)).toBe(false);
  });
});
