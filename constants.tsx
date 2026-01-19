
import { Priority, Status, Team, User, Issue, Cycle, UserRole, Activity, Project } from './types';

// New Architecture Constants
export const REQUIREMENT_POOL_ID = 't_inbox'; // Formerly the requirement pool, now Business Inbox
export const ENGINEERING_ID = 't_eng';

export const USERS: User[] = [];

export const BEIJING_TIME_ZONE = 'Asia/Shanghai';

export const getBeijingNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: BEIJING_TIME_ZONE }));

const normalizeDate = (value: Date | string | number) => (value instanceof Date ? value : new Date(value));

export const formatBeijingDate = (
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
  locale?: string | string[],
) => normalizeDate(value).toLocaleDateString(locale, { timeZone: BEIJING_TIME_ZONE, ...options });

export const formatBeijingTime = (
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
  locale?: string | string[],
) => normalizeDate(value).toLocaleTimeString(locale, { timeZone: BEIJING_TIME_ZONE, ...options });

export const formatBeijingDateTime = (
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
  locale?: string | string[],
) => normalizeDate(value).toLocaleString(locale, { timeZone: BEIJING_TIME_ZONE, ...options });

// Dual Core Structure
export const TEAMS: Team[] = [
  { id: REQUIREMENT_POOL_ID, name: '业务收件箱', icon: 'Inbox' },
  { id: ENGINEERING_ID, name: '研发交付', icon: 'Zap' },
];

export const PROJECTS: Project[] = [];

export const CYCLES: Cycle[] = [];

export const INITIAL_ISSUES: Issue[] = [];
