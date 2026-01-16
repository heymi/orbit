
import { Priority, Status, Team, User, Issue, Cycle, UserRole, Activity, Project } from './types';

// New Architecture Constants
export const REQUIREMENT_POOL_ID = 't_inbox'; // Formerly the requirement pool, now Business Inbox
export const ENGINEERING_ID = 't_eng';

export const USERS: User[] = [];

// Dual Core Structure
export const TEAMS: Team[] = [
  { id: REQUIREMENT_POOL_ID, name: '业务收件箱', icon: 'Inbox' },
  { id: ENGINEERING_ID, name: '研发交付', icon: 'Zap' },
];

export const PROJECTS: Project[] = [];

export const CYCLES: Cycle[] = [];

export const INITIAL_ISSUES: Issue[] = [];
