import { describe, expect, it } from 'vitest';
import { Status } from '../types';
import { resolvePipelineDrop, resolveTeamDrop } from '../services/issueWorkflow';

describe('issue workflow helpers', () => {
  const inboxId = 'team_inbox';
  const engId = 'team_eng';

  it('moves to inbox and resets to backlog', () => {
    const result = resolveTeamDrop(Status.InProgress, inboxId, inboxId, engId);
    expect(result).toEqual({ teamId: inboxId, status: Status.Backlog });
  });

  it('preserves status when moving to engineering', () => {
    const result = resolveTeamDrop(Status.InProgress, engId, inboxId, engId);
    expect(result).toEqual({ teamId: engId, status: Status.InProgress });
  });

  it('moves backlog to todo when entering engineering', () => {
    const result = resolveTeamDrop(Status.Backlog, engId, inboxId, engId);
    expect(result).toEqual({ teamId: engId, status: Status.Todo });
  });

  it('maps pipeline stages to correct status', () => {
    expect(resolvePipelineDrop('triage', inboxId, engId)).toEqual({
      teamId: inboxId,
      status: Status.Backlog,
    });
    expect(resolvePipelineDrop('building', inboxId, engId)).toEqual({
      teamId: engId,
      status: Status.Todo,
    });
    expect(resolvePipelineDrop('qa', inboxId, engId)).toEqual({
      status: Status.InQA,
    });
    expect(resolvePipelineDrop('live', inboxId, engId)).toEqual({
      status: Status.Done,
    });
  });
});
