import { GroupOption, SortOption, ViewState } from '../types';

export const getDefaultsForView = (view: ViewState['type']): { sortBy?: SortOption; groupBy?: GroupOption } => {
  if (view === 'bug') {
    return { sortBy: 'priority', groupBy: 'status' };
  }
  return {};
};
