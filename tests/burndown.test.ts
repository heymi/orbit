import { describe, expect, it } from 'vitest';
import { buildBurndownSeries } from '../services/burndown';
import { Cycle, Issue, Priority, Status } from '../types';

const makeIssue = (id: string, status: Status, createdAt: Date, updatedAt: Date, cycleId: string): Issue => ({
  id,
  identifier: id,
  title: id,
  description: '',
  status,
  priority: Priority.NoPriority,
  assigneeId: null,
  teamId: 't',
  projectId: null,
  cycleId,
  createdAt,
  updatedAt,
  labels: [],
  subtasks: [],
  customFields: {},
  activities: [],
});

describe('buildBurndownSeries', () => {
  it('builds remaining and ideal series', () => {
    const cycle: Cycle = {
      id: 'c1',
      name: 'Sprint 1',
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-03'),
      goals: [],
    };
    const issues = [
      makeIssue('1', Status.Done, new Date('2024-01-01'), new Date('2024-01-02'), 'c1'),
      makeIssue('2', Status.InProgress, new Date('2024-01-01'), new Date('2024-01-03'), 'c1'),
    ];
    const series = buildBurndownSeries(cycle, issues);
    expect(series).toHaveLength(3);
    expect(series[0].remaining).toBe(2);
    expect(series[1].remaining).toBe(1);
    expect(series[2].remaining).toBe(1);
    expect(series[0].ideal).toBeCloseTo(2);
    expect(series[2].ideal).toBeCloseTo(0);
  });
});
