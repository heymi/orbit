import { Issue } from '../types';

export const applyBugLabel = (labels: string[]) => {
  const hasBug = labels.includes('Bug');
  return hasBug ? labels : ['Bug', ...labels];
};

export const isBugIssue = (issue: Issue) => {
  return issue.labels.includes('Bug');
};
