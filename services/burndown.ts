import { Cycle, Issue, Status } from '../types';

export interface BurndownPoint {
  date: Date;
  remaining: number;
  ideal: number;
}

const msPerDay = 24 * 60 * 60 * 1000;

const startOfDay = (date: Date) => {
  const beijingDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return new Date(Date.UTC(beijingDate.getUTCFullYear(), beijingDate.getUTCMonth(), beijingDate.getUTCDate()));
};

export const buildBurndownSeries = (cycle: Cycle, issues: Issue[]): BurndownPoint[] => {
  const start = startOfDay(cycle.startDate);
  const end = startOfDay(cycle.endDate);
  if (end.getTime() < start.getTime()) return [];

  const cycleIssues = issues.filter(issue => issue.cycleId === cycle.id);
  const total = cycleIssues.length;
  const days = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  if (days <= 0) return [];

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(start.getTime() + index * msPerDay);
    const remaining = cycleIssues.filter(issue => {
      if (issue.createdAt.getTime() > day.getTime()) return false;
      const isDone = issue.status === Status.Done || issue.status === Status.Closed;
      if (!isDone) return true;
      const doneDay = startOfDay(issue.updatedAt);
      return doneDay.getTime() > day.getTime();
    }).length;
    const ideal = total === 0 ? 0 : Math.max(0, total - (total * index) / (days - 1 || 1));
    return { date: day, remaining, ideal };
  });
};
