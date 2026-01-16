export type RealtimePayload<T> = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new?: T;
  old?: T;
};

export const applyRealtimeChange = <T extends { id: string }>(
  list: T[],
  payload: RealtimePayload<T>
) => {
  if (payload.eventType === 'INSERT' && payload.new) {
    return [payload.new, ...list];
  }
  if (payload.eventType === 'UPDATE' && payload.new) {
    return list.map(item => (item.id === payload.new!.id ? payload.new! : item));
  }
  if (payload.eventType === 'DELETE' && payload.old) {
    return list.filter(item => item.id !== payload.old!.id);
  }
  return list;
};
