import { Issue, Status } from '../types';
import { isBugIssue } from './bugHelpers';

export const buildBugStats = (issues: Issue[]) => {
  const bugs = issues.filter(isBugIssue);
  const total = bugs.length;
  const fixed = bugs.filter(i => i.status === Status.Done || i.status === Status.Closed).length;
  const open = bugs.filter(i => i.status !== Status.Done && i.status !== Status.Closed && i.status !== Status.Canceled).length;
  const reopened = bugs.filter(i => (i.customFields?.reopenCount as number | undefined) && (i.customFields?.reopenCount as number) > 0).length;
  const reopenRate = total > 0 ? Math.round((reopened / total) * 100) : 0;
  const severityCounts = bugs.reduce<Record<string, number>>((acc, bug) => {
    const sev = (bug.customFields?.severity as string | undefined) || 'S2';
    acc[sev] = (acc[sev] || 0) + 1;
    return acc;
  }, {});
  return { total, fixed, open, reopened, reopenRate, severityCounts };
};
