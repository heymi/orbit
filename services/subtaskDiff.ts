import { Subtask } from '../types';

export const diffSubtasks = (existingIds: string[], desired: Subtask[] = []) => {
  const desiredList = desired || [];
  const desiredIds = new Set(desiredList.map(s => s.id).filter(Boolean));
  const toDelete = existingIds.filter(id => !desiredIds.has(id));
  const toUpsert = desiredList.filter(s => Boolean(s.id));
  const toInsert = desiredList.filter(s => !s.id);
  return { toDelete, toUpsert, toInsert };
};
