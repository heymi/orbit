import { Status } from '../types';

export interface TeamDropUpdate {
  teamId: string;
  status: Status;
}

export interface PipelineDropUpdate {
  teamId?: string;
  status: Status;
}

export const resolveTeamDrop = (
  currentStatus: Status,
  targetTeamId: string,
  inboxTeamId: string,
  engineeringTeamId: string
): TeamDropUpdate => {
  if (targetTeamId === inboxTeamId) {
    return { teamId: targetTeamId, status: Status.Backlog };
  }
  if (targetTeamId === engineeringTeamId) {
    const nextStatus = currentStatus === Status.Backlog ? Status.Todo : currentStatus;
    return { teamId: targetTeamId, status: nextStatus };
  }
  return { teamId: targetTeamId, status: currentStatus };
};

export const resolvePipelineDrop = (
  stage: 'triage' | 'building' | 'qa' | 'live',
  inboxTeamId: string,
  engineeringTeamId: string
): PipelineDropUpdate => {
  if (stage === 'triage') {
    return { teamId: inboxTeamId, status: Status.Backlog };
  }
  if (stage === 'building') {
    return { teamId: engineeringTeamId, status: Status.Todo };
  }
  if (stage === 'qa') {
    return { status: Status.InQA };
  }
  return { status: Status.Done };
};

export interface OrderableIssue {
  id: string;
  customFields?: Record<string, unknown>;
}

export const computeReorderOrder = (
  list: OrderableIssue[],
  sourceId: string,
  targetId: string
) => {
  const withOrder = list.map((item, index) => {
    const raw = item.customFields?.order;
    const parsed = typeof raw === 'string' ? Number(raw) : NaN;
    const order = typeof raw === 'number' ? raw : Number.isFinite(parsed) ? parsed : index;
    return { id: item.id, order };
  });

  const sourceIndex = withOrder.findIndex(item => item.id === sourceId);
  const targetIndex = withOrder.findIndex(item => item.id === targetId);
  if (sourceIndex === -1 || targetIndex === -1 || sourceId === targetId) return null;

  const [moved] = withOrder.splice(sourceIndex, 1);
  const insertIndex = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
  const prev = withOrder[insertIndex - 1];
  const next = withOrder[insertIndex];

  let order: number;
  if (prev && next) {
    order = (prev.order + next.order) / 2;
  } else if (next && !prev) {
    order = next.order - 1;
  } else if (prev && !next) {
    order = prev.order + 1;
  } else {
    order = moved.order;
  }

  return { id: moved.id, order };
};
