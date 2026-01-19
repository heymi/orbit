import { isSupabaseConfigured, supabase } from './supabaseClient';
import { supabaseAdmin } from './supabaseAdmin';
import { Issue, User, Team, Cycle, Project, Activity, Subtask, Status, Priority, UserRole, PermissionRole, InviteResult, ThemePreference, LayoutPreference } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';
import { diffSubtasks } from './subtaskDiff';
import { getBeijingNow } from '../constants';

// ============ 组织类型 ============
export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
}

// ============ 数据库行类型 ============
interface DbOrganization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

interface DbIssue {
  id: string;
  org_id: string;
  identifier: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  previous_assignee_id: string | null;
  team_id: string;
  project_id: string | null;
  cycle_id: string | null;
  created_at: string;
  updated_at: string;
  labels: string[];
  custom_fields: Record<string, string>;
}

interface DbUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  role: string;
  theme_preference?: string | null;
  layout_preference?: string | null;
}

interface DbTeam {
  id: string;
  org_id: string;
  name: string;
  icon: string;
}

interface DbCycle {
  id: string;
  org_id: string;
  name: string;
  start_date: string;
  end_date: string;
  description: string | null;
  is_released: boolean;
  goals: string[] | null;
}

interface DbProject {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  icon: string;
}

interface DbSubtask {
  id: string;
  issue_id: string;
  title: string;
  completed: boolean;
}

interface DbActivity {
  id: string;
  issue_id: string;
  type: string;
  user_id: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  timestamp: string;
}

// ============ 转换函数 ============
const toOrganization = (row: DbOrganization): Organization => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  createdAt: new Date(row.created_at),
});

const toIssue = (row: DbIssue, subtasks: Subtask[] = [], activities: Activity[] = []): Issue => ({
  id: row.id,
  identifier: row.identifier,
  title: row.title,
  description: row.description || '',
  status: row.status as Status,
  priority: row.priority as Priority,
  assigneeId: row.assignee_id || null,
  previousAssigneeId: row.previous_assignee_id || null,
  teamId: row.team_id,
  projectId: row.project_id,
  cycleId: row.cycle_id,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
  labels: row.labels || [],
  customFields: row.custom_fields || {},
  subtasks,
  activities,
});

export const toIssueFromRow = (row: DbIssue, existing?: Issue): Issue => {
  return toIssue(row, existing?.subtasks || [], existing?.activities || []);
};


const toUser = (row: DbUser, permissionRole?: PermissionRole | string): User => ({
  id: row.id,
  name: row.name,
  email: row.email,
  avatarUrl: row.avatar_url,
  role: row.role as UserRole,
  permissionRole,
  themePreference: (row.theme_preference as ThemePreference) || null,
  layoutPreference: (row.layout_preference as LayoutPreference) || null,
});

const toTeam = (row: DbTeam): Team => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
});

const toCycle = (row: DbCycle): Cycle => ({
  id: row.id,
  name: row.name,
  startDate: new Date(row.start_date),
  endDate: new Date(row.end_date),
  description: row.description || undefined,
  isReleased: row.is_released,
  goals: row.goals || [],
});

const toProject = (row: DbProject): Project => ({
  id: row.id,
  name: row.name,
  description: row.description || undefined,
  icon: row.icon,
});

const toSubtask = (row: DbSubtask): Subtask => ({
  id: row.id,
  title: row.title,
  completed: row.completed,
});

const toActivity = (row: DbActivity): Activity => ({
  id: row.id,
  type: row.type as 'create' | 'update' | 'comment',
  userId: row.user_id,
  field: row.field || undefined,
  oldValue: row.old_value || undefined,
  newValue: row.new_value || undefined,
  timestamp: new Date(row.timestamp),
});

const toActivityRow = (activity: Activity, issueId: string): DbActivity => ({
  id: activity.id,
  issue_id: issueId,
  type: activity.type,
  user_id: activity.userId,
  field: activity.field || null,
  old_value: activity.oldValue || null,
  new_value: activity.newValue || null,
  timestamp: activity.timestamp instanceof Date ? activity.timestamp.toISOString() : new Date(activity.timestamp).toISOString(),
});


// ============ 当前组织上下文 ============
let currentOrgId: string | null = null;

export const setCurrentOrg = (orgId: string | null) => {
  currentOrgId = orgId;
};

export const getCurrentOrg = () => currentOrgId;

// ============ Organizations ============

export const fetchUserOrganizations = async (): Promise<Organization[]> => {
  const { data, error } = await supabase.from('organizations').select('*').order('name');
  if (error) throw error;
  return (data || []).map(toOrganization);
};

export const createOrganization = async (name: string, slug: string): Promise<Organization> => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase 未配置：请在 .env.local 中设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。');
  }

  const normalizeOrgSlug = (orgName: string, rawSlug: string) => {
    const sanitize = (value: string) =>
      value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const normalized = sanitize(rawSlug || '');
    if (normalized) return normalized;
    const fromName = sanitize(orgName || '');
    if (fromName) return fromName;
    const fallback =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().slice(0, 8)
        : Math.random().toString(36).slice(2, 10);
    return `org-${fallback}`;
  };
  const finalSlug = normalizeOrgSlug(name, slug);

  const withTimeout = async <T>(promise: PromiseLike<T>, label: string, timeoutMs = 15000) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} 超时，请检查网络或 Supabase 配置。`));
      }, timeoutMs);
    });
    try {
      return await Promise.race([Promise.resolve(promise), timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };

  console.log('Step 1: Getting user...');
  const { data: { user }, error: authError } = await withTimeout(
    supabase.auth.getUser(),
    '获取用户信息'
  );
  if (authError) {
    console.error('Auth error:', authError);
    throw authError;
  }
  if (!user) throw new Error('Not authenticated');
  console.log('User ID:', user.id);

  // 创建组织
  console.log('Step 2: Creating organization...');
  const { data: org, error: orgError } = await withTimeout(
    supabase
      .from('organizations')
      .insert({ name, slug: finalSlug })
      .select()
      .single(),
    '创建组织'
  );
  
  if (orgError) {
    console.error('Org creation error:', orgError);
    throw orgError;
  }
  console.log('Organization created:', org);

  // 将当前用户设为 owner
  console.log('Step 3: Adding user as owner...');
  const { error: memberError } = await withTimeout(
    supabase
      .from('org_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' }),
    '添加组织成员'
  );
  
  if (memberError) {
    console.error('Member creation error:', memberError);
    throw memberError;
  }
  console.log('User added as owner');

  // 创建默认团队
  console.log('Step 4: Creating default teams...');
  const { error: teamsError } = await withTimeout(
    supabase.from('teams').insert([
      { org_id: org.id, id: `${org.id}_inbox`, name: '业务收件箱', icon: 'Inbox' },
      { org_id: org.id, id: `${org.id}_eng`, name: '研发交付', icon: 'Zap' },
    ]),
    '创建默认团队'
  );
  
  if (teamsError) {
    console.error('Teams creation error:', teamsError);
    // 不抛出错误，团队创建失败不影响组织创建
  }
  console.log('Teams created');

  return toOrganization(org);
};

// ============ Users ============

export const fetchUsers = async (): Promise<User[]> => {
  if (!currentOrgId) return [];
  
  // 获取组织成员的用户信息
  const { data: members, error: membersError } = await supabase
    .from('org_members')
    .select('user_id, role')
    .eq('org_id', currentOrgId);
  if (membersError) throw membersError;

  const userIds = (members || []).map(m => m.user_id);
  if (userIds.length === 0) return [];

  const permissionMap = new Map(
    (members || []).map(member => {
      const normalized = member.role === 'owner' ? PermissionRole.Admin : member.role;
      return [member.user_id, normalized as PermissionRole];
    })
  );

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .in('id', userIds)
    .order('name');
  if (error) throw error;
  return (data || []).map(row => toUser(row, permissionMap.get(row.id)));
};

export const createUser = async (user: Omit<User, 'id'>): Promise<User> => {
  const { data, error } = await supabase.from('users').insert({
    name: user.name,
    email: user.email,
    avatar_url: user.avatarUrl,
    role: user.role,
  }).select().single();
  if (error) throw error;
  return toUser(data);
};

export const updateUser = async (user: User): Promise<User> => {
  const payload: Record<string, unknown> = {};
  if (user.name) payload.name = user.name;
  if (user.avatarUrl !== undefined) payload.avatar_url = user.avatarUrl;
  if (user.role) payload.role = user.role;

  if (Object.keys(payload).length === 0) {
    return user;
  }

  let { error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', user.id);

  if (error && supabaseAdmin) {
    const adminResult = await supabaseAdmin
      .from('users')
      .update(payload)
      .eq('id', user.id);

    error = adminResult.error;
  }

  if (error) throw error;
  return {
    ...user,
    name: typeof payload.name === 'string' ? payload.name : user.name,
    role: typeof payload.role === 'string' ? payload.role : user.role,
    avatarUrl: typeof payload.avatar_url === 'string' ? payload.avatar_url : user.avatarUrl,
  };
};

export const updateOrgMemberRole = async (userId: string, role: PermissionRole): Promise<void> => {
  if (!currentOrgId) throw new Error('No organization selected');
  let { error } = await supabase
    .from('org_members')
    .update({ role })
    .eq('org_id', currentOrgId)
    .eq('user_id', userId);

  if (error && supabaseAdmin) {
    const adminResult = await supabaseAdmin
      .from('org_members')
      .update({ role })
      .eq('org_id', currentOrgId)
      .eq('user_id', userId);

    error = adminResult.error;
  }

  if (error) throw error;
};

export const updateUserPreferences = async (
  userId: string,
  preferences: { themePreference: ThemePreference | null; layoutPreference: LayoutPreference | null }
): Promise<User> => {
  const { error } = await supabase
    .from('users')
    .update({
      theme_preference: preferences.themePreference,
      layout_preference: preferences.layoutPreference,
    })
    .eq('id', userId);

  if (error) throw error;
  return {
    id: userId,
    themePreference: preferences.themePreference,
    layoutPreference: preferences.layoutPreference,
  } as User;
};

export const inviteUserToOrg = async (email: string, role: PermissionRole = PermissionRole.Member): Promise<InviteResult> => {
  if (!currentOrgId) throw new Error('No organization selected');
  if (!supabaseAdmin) throw new Error('缺少 Supabase 服务端密钥，无法生成邀请链接');

  const { data: existingUser, error: userError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (userError) throw userError;

  if (existingUser?.id) {
    const { error } = await supabaseAdmin
      .from('org_members')
      .insert({ org_id: currentOrgId, user_id: existingUser.id, role });

    if (error && error.code !== '23505') {
      throw error;
    }

    return { mode: 'added' };
  }

  const redirectTo = typeof window === 'undefined'
    ? undefined
    : `${window.location.origin}/?invite_org=${currentOrgId}`;

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: {
      data: {
        invited_org_id: currentOrgId,
        invited_org_role: role,
      },
      redirectTo,
    },
  });

  if (error) throw error;

  const tokenHash = data?.properties?.hashed_token;
  const inviteLink = tokenHash && typeof window !== 'undefined'
    ? `${window.location.origin}/?invite_org=${currentOrgId}&invite_type=invite&invite_token=${tokenHash}`
    : data?.properties?.action_link;

  if (!inviteLink) throw new Error('未能生成邀请链接');

  return { mode: 'invited', inviteLink };
};

export const removeUserFromOrg = async (userId: string): Promise<void> => {
  if (!currentOrgId) throw new Error('No organization selected');
  
  let { error } = await supabase
    .from('org_members')
    .delete()
    .eq('org_id', currentOrgId)
    .eq('user_id', userId);

  if (error && supabaseAdmin) {
    const adminResult = await supabaseAdmin
      .from('org_members')
      .delete()
      .eq('org_id', currentOrgId)
      .eq('user_id', userId);

    error = adminResult.error;
  }

  if (error) throw error;
};

// ============ Teams ============

export const fetchTeams = async (): Promise<Team[]> => {
  if (!currentOrgId) return [];
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('name');
  if (error) throw error;
  return (data || []).map(toTeam);
};

// ============ Cycles ============

export const fetchCycles = async (): Promise<Cycle[]> => {
  if (!currentOrgId) return [];
  const { data, error } = await supabase
    .from('cycles')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data || []).map(toCycle);
};

export const createCycle = async (cycle: Omit<Cycle, 'id'>): Promise<Cycle> => {
  if (!currentOrgId) throw new Error('No organization selected');
  const payload: Record<string, unknown> = {
    org_id: currentOrgId,
    name: cycle.name,
    start_date: cycle.startDate.toISOString(),
    end_date: cycle.endDate.toISOString(),
    description: cycle.description || null,
    is_released: cycle.isReleased || false,
  };
  if (cycle.goals && cycle.goals.length > 0) {
    payload.goals = cycle.goals;
  }
  const { data, error } = await supabase.from('cycles').insert(payload).select().single();
  if (error) {
    if (String(error.message || '').includes("'goals'")) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('cycles')
        .insert({
          org_id: currentOrgId,
          name: cycle.name,
          start_date: cycle.startDate.toISOString(),
          end_date: cycle.endDate.toISOString(),
          description: cycle.description || null,
          is_released: cycle.isReleased || false,
        })
        .select()
        .single();
      if (fallbackError) throw fallbackError;
      return toCycle(fallback);
    }
    throw error;
  }
  return toCycle(data);
};

export const updateCycle = async (cycle: Cycle): Promise<Cycle> => {
  const payload: Record<string, unknown> = {
    name: cycle.name,
    start_date: cycle.startDate.toISOString(),
    end_date: cycle.endDate.toISOString(),
    description: cycle.description || null,
    is_released: cycle.isReleased || false,
  };
  if (cycle.goals && cycle.goals.length > 0) {
    payload.goals = cycle.goals;
  }
  const { data, error } = await supabase.from('cycles').update(payload).eq('id', cycle.id).select().single();
  if (error) {
    if (String(error.message || '').includes("'goals'")) {
      const { data: fallback, error: fallbackError } = await supabase
        .from('cycles')
        .update({
          name: cycle.name,
          start_date: cycle.startDate.toISOString(),
          end_date: cycle.endDate.toISOString(),
          description: cycle.description || null,
          is_released: cycle.isReleased || false,
        })
        .eq('id', cycle.id)
        .select()
        .single();
      if (fallbackError) throw fallbackError;
      return toCycle(fallback);
    }
    throw error;
  }
  return toCycle(data);
};

// ============ Projects ============

export const fetchProjects = async (): Promise<Project[]> => {
  if (!currentOrgId) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('name');
  if (error) throw error;
  return (data || []).map(toProject);
};

export const createProject = async (project: Omit<Project, 'id'>): Promise<Project> => {
  if (!currentOrgId) throw new Error('No organization selected');
  const { data, error } = await supabase.from('projects').insert({
    org_id: currentOrgId,
    name: project.name,
    description: project.description || null,
    icon: project.icon,
  }).select().single();
  if (error) throw error;
  return toProject(data);
};

export const updateProject = async (project: Project): Promise<Project> => {
  const { data, error } = await supabase.from('projects').update({
    name: project.name,
    description: project.description || null,
    icon: project.icon,
  }).eq('id', project.id).select().single();
  if (error) throw error;
  return toProject(data);
};

export const deleteProject = async (id: string): Promise<void> => {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
};


// ============ Issues ============

export const fetchIssues = async (): Promise<Issue[]> => {
  if (!currentOrgId) return [];

  const { data: issuesData, error: issuesError } = await supabase
    .from('issues')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('created_at', { ascending: false });
  if (issuesError) throw issuesError;

  if (!issuesData || issuesData.length === 0) return [];

  const issueIds = issuesData.map(i => i.id);

  const [
    { data: subtasksData, error: subtasksError },
    { data: activitiesData, error: activitiesError },
  ] = await Promise.all([
    supabase.from('subtasks').select('*').in('issue_id', issueIds),
    supabase.from('activities').select('*').in('issue_id', issueIds).order('timestamp'),
  ]);
  if (subtasksError) throw subtasksError;
  if (activitiesError) throw activitiesError;

  const subtasksByIssue: Record<string, Subtask[]> = {};
  (subtasksData || []).forEach((row: DbSubtask) => {
    if (!subtasksByIssue[row.issue_id]) subtasksByIssue[row.issue_id] = [];
    subtasksByIssue[row.issue_id].push(toSubtask(row));
  });

  const activitiesByIssue: Record<string, Activity[]> = {};
  (activitiesData || []).forEach((row: DbActivity) => {
    if (!activitiesByIssue[row.issue_id]) activitiesByIssue[row.issue_id] = [];
    activitiesByIssue[row.issue_id].push(toActivity(row));
  });

  return issuesData.map((row: DbIssue) =>
    toIssue(row, subtasksByIssue[row.id] || [], activitiesByIssue[row.id] || [])
  );
};

export const createIssue = async (
  issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'activities'>,
  userId: string
): Promise<Issue> => {
  if (!currentOrgId) throw new Error('No organization selected');
  const now = getBeijingNow().toISOString();

  const { data: issueData, error: issueError } = await supabase.from('issues').insert({
    org_id: currentOrgId,
    identifier: issue.identifier,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    assignee_id: issue.assigneeId,
    previous_assignee_id: issue.previousAssigneeId || null,
    team_id: issue.teamId,
    project_id: issue.projectId || null,
    cycle_id: issue.cycleId,
    labels: issue.labels,
    custom_fields: issue.customFields,
    created_at: now,
    updated_at: now,
  }).select().single();
  if (issueError) throw issueError;

  // 创建 subtasks
  if (issue.subtasks.length > 0) {
    await supabase.from('subtasks').insert(
      issue.subtasks.map(st => ({
        issue_id: issueData.id,
        title: st.title,
        completed: st.completed,
      }))
    );
  }

  // 创建 activity
  await supabase.from('activities').insert({
    issue_id: issueData.id,
    type: 'create',
    user_id: userId,
    timestamp: now,
  });

  return toIssue(issueData, issue.subtasks, []);
};

export const updateIssue = async (issue: Issue): Promise<Issue> => {
  const now = getBeijingNow().toISOString();

  const { data, error } = await supabase.from('issues').update({
    title: issue.title,
    description: issue.description,
    status: issue.status,
    priority: issue.priority,
    assignee_id: issue.assigneeId,
    previous_assignee_id: issue.previousAssigneeId || null,
    team_id: issue.teamId,
    project_id: issue.projectId || null,
    cycle_id: issue.cycleId || null,
    labels: issue.labels,
    custom_fields: issue.customFields,
    updated_at: now,
  }).eq('id', issue.id).select().single();
  if (error) throw error;

  // 更新 subtasks
  const { data: existingSubtasks, error: subtasksError } = await supabase
    .from('subtasks')
    .select('id')
    .eq('issue_id', issue.id);
  if (subtasksError) throw subtasksError;

  const existingIds = (existingSubtasks || []).map(s => s.id as string);
  const { toDelete, toUpsert, toInsert } = diffSubtasks(existingIds, issue.subtasks);

  if (toDelete.length > 0) {
    const { error: deleteError } = await supabase.from('subtasks').delete().in('id', toDelete);
    if (deleteError) throw deleteError;
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await supabase.from('subtasks').upsert(
      toUpsert.map(st => ({
        id: st.id,
        issue_id: issue.id,
        title: st.title,
        completed: st.completed,
      })),
      { onConflict: 'id' }
    );
    if (upsertError) throw upsertError;
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from('subtasks').insert(
      toInsert.map(st => ({
        issue_id: issue.id,
        title: st.title,
        completed: st.completed,
      }))
    );
    if (insertError) throw insertError;
  }

  if (issue.activities && issue.activities.length > 0) {
    const { error: activityError } = await supabase
      .from('activities')
      .upsert(issue.activities.map(activity => toActivityRow(activity, issue.id)), { onConflict: 'id' });
    if (activityError) throw activityError;
  }

  return toIssue(data, issue.subtasks, issue.activities);
};

export const createActivity = async (issueId: string, activity: Activity): Promise<Activity> => {
  const { id: _id, ...row } = toActivityRow(activity, issueId);
  const { data, error } = await supabase
    .from('activities')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return toActivity(data as DbActivity);
};

export const deleteActivity = async (activityId: string, userId: string): Promise<void> => {
  const { data: existing, error: fetchError } = await supabase
    .from('activities')
    .select('id, user_id')
    .eq('id', activityId)
    .single();
  if (fetchError) throw fetchError;
  if (!existing || existing.user_id !== userId) {
    throw new Error('无权限或评论已被删除');
  }

  const { error, count } = await supabase
    .from('activities')
    .delete({ count: 'exact' })
    .eq('id', activityId);
  if (!error && count) return;

  if (!supabaseAdmin) {
    throw error || new Error('评论删除失败');
  }

  const { error: adminError, count: adminCount } = await supabaseAdmin
    .from('activities')
    .delete({ count: 'exact' })
    .eq('id', activityId)
    .eq('user_id', userId);
  if (adminError || !adminCount) {
    throw adminError || new Error('评论删除失败');
  }
};

export const updateIssueIdentifier = async (issueId: string, identifier: string): Promise<void> => {
  const now = getBeijingNow().toISOString();
  const { error } = await supabase
    .from('issues')
    .update({ identifier, updated_at: now })
    .eq('id', issueId);
  if (error) throw error;
};

export const deleteIssue = async (id: string): Promise<void> => {
  const { error } = await supabase.from('issues').delete().eq('id', id);
  if (error) throw error;
};

// ============ 实时订阅 ============

type RealtimeCallback = {
  onIssueChange?: (payload: any) => void;
  onProjectChange?: (payload: any) => void;
  onCycleChange?: (payload: any) => void;
  onUserChange?: (payload: any) => void;
  onTeamChange?: (payload: any) => void;
  onOrgMemberChange?: (payload: any) => void;
};

let realtimeChannel: RealtimeChannel | null = null;

export const subscribeToChanges = (callbacks: RealtimeCallback): (() => void) => {
  if (!currentOrgId) return () => {};

  // 取消之前的订阅
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabase
    .channel(`org_${currentOrgId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'issues', filter: `org_id=eq.${currentOrgId}` },
      (payload) => callbacks.onIssueChange?.(payload)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'projects', filter: `org_id=eq.${currentOrgId}` },
      (payload) => callbacks.onProjectChange?.(payload)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'cycles', filter: `org_id=eq.${currentOrgId}` },
      (payload) => callbacks.onCycleChange?.(payload)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'users' },
      (payload) => callbacks.onUserChange?.(payload)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'org_members', filter: `org_id=eq.${currentOrgId}` },
      (payload) => callbacks.onOrgMemberChange?.(payload)
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'teams', filter: `org_id=eq.${currentOrgId}` },
      (payload) => callbacks.onTeamChange?.(payload)
    )
    .subscribe();

  return () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  };
};

export const unsubscribeFromChanges = () => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
};
