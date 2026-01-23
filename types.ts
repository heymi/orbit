
export enum Priority {
  NoPriority = '无优先级',
  Low = '低',
  Medium = '中',
  High = '高',
  Urgent = '紧急',
}

export enum Status {
  Backlog = '待办',
  Todo = '准备做',
  InProgress = '进行中',
  CodeMerged = '代码已合并', // Was InReview
  InQA = '测试中',
  Done = '已完成',
  Canceled = '已取消',
  Closed = '已关闭',
}

export enum UserRole {
  Development = '研发工程师',
  Product = '产品经理',
  QA = '测试专员',
  Design = '设计师',
  Marketing = '市场专员',
  Other = '其他成员'
}

export enum PermissionRole {
  Admin = 'admin',
  Member = 'member',
}

export type ThemePreference = 'light' | 'dark' | 'system';
export type LayoutPreference = 'board' | 'list';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: UserRole | string; // Use enum primarily
  permissionRole?: PermissionRole | string;
  themePreference?: ThemePreference | null;
  layoutPreference?: LayoutPreference | null;
}

export interface InviteResult {
  mode: 'invited' | 'added';
  inviteLink?: string;
}

export interface Team {
  id: string;
  name: string;
  icon: string; // Emoji or icon name
}

export interface Cycle {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  description?: string;
  isReleased?: boolean; // New field: Has this cycle been deployed to production?
  goals?: string[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  icon: string; // Emoji character
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Activity {
  id: string;
  type: 'create' | 'update' | 'comment';
  userId: string;
  field?: string; // e.g., 'Status', 'Assignee'
  oldValue?: string;
  newValue?: string;
  timestamp: Date;
}

export interface Issue {
  id: string;
  identifier: string; // e.g., ENG-123
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assigneeId: string | null;
  previousAssigneeId?: string | null; // Tracks the developer when handed over to QA
  teamId: string;
  projectId?: string | null; // New: Issue belongs to a Project
  cycleId: string | null; // Associated cycle
  createdAt: Date;
  updatedAt: Date;
  labels: string[];
  subtasks: Subtask[];
  customFields: Record<string, unknown>; // e.g. { "Client": "Acme", "englishSlug": "login-flow" }
  activities: Activity[];
}

export interface ViewState {
  type: 'all' | 'my' | 'team' | 'cycle' | 'cycles' | 'members' | 'project' | 'pipeline' | 'bug' | 'chat'; 
  teamId?: string;
  cycleId?: string;
  projectId?: string;
  pipelineStage?: 'triage' | 'building' | 'qa' | 'live';
  channelId?: string;
}

export type SortOption = 'priority' | 'status' | 'created' | 'manual';
export type GroupOption = 'status' | 'priority' | 'project' | 'none';

// New type for the Draft Preview in Note Mode
export interface DraftIssue extends Omit<Issue, 'id' | 'identifier' | 'createdAt' | 'updatedAt' | 'activities'> {
  tempId: string; // For local list management
}

// ============ Chat Types ============

export interface ChatChannel {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description?: string;
  createdBy?: string;
  createdAt: Date;
  kind: 'channel' | 'dm';
  dmPeerId?: string;
}

export interface ChatMessage {
  id: string;
  orgId: string;
  channelId: string;
  userId: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatRead {
  channelId: string;
  userId: string;
  lastReadAt: Date;
  updatedAt: Date;
}

export interface ChatDm {
  channelId: string;
  orgId: string;
  userA: string;
  userB: string;
  dmKey: string;
  createdAt: Date;
}
