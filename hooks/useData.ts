import { useState, useEffect, useCallback } from 'react';
import { Issue, User, Team, Cycle, Project, InviteResult, ThemePreference, LayoutPreference, PermissionRole } from '../types';
import * as dataService from '../services/dataService';
import { Organization, toIssueFromRow } from '../services/dataService';
import { applyRealtimeChange } from '../services/realtimeHelpers';
import { buildIdentifier } from '../services/identifier';

interface UseDataReturn {
  // 组织
  organizations: Organization[];
  currentOrg: Organization | null;
  setCurrentOrg: (org: Organization | null) => void;
  createOrganization: (name: string, slug: string) => Promise<Organization>;
  // 数据
  issues: Issue[];
  users: User[];
  teams: Team[];
  cycles: Cycle[];
  projects: Project[];
  loading: boolean;
  error: string | null;
  // Issue 操作
  createIssue: (issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'activities'>, userId: string) => Promise<void>;
    updateIssue: (issue: Issue) => Promise<Issue>;
    updateIssueComment: (issueId: string, activity: Issue['activities'][number]) => Promise<Issue | undefined>;
    deleteIssueComment: (issueId: string, activityId: string, userId: string) => Promise<void>;
    migrateIssueIdentifiers: () => Promise<{ updated: number; total: number }>;
    deleteIssue: (id: string) => Promise<void>;

  // User 操作
  updateUser: (user: User) => Promise<void>;
  updateUserPreferences: (userId: string, preferences: { themePreference: ThemePreference | null; layoutPreference: LayoutPreference | null }) => Promise<void>;
  inviteUser: (email: string, role?: PermissionRole) => Promise<InviteResult>;
  removeUser: (userId: string) => Promise<void>;
  // Project 操作
  createProject: (project: Omit<Project, 'id'>) => Promise<void>;
  updateProject: (project: Project) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  // Cycle 操作
  createCycle: (cycle: Omit<Cycle, 'id'>) => Promise<void>;
  updateCycle: (cycle: Cycle) => Promise<void>;
  // 刷新
  refresh: () => Promise<void>;
}

export const useData = (): UseDataReturn => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Organization | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orgsLoaded, setOrgsLoaded] = useState(false);

  // 加载用户的组织列表
  const loadOrganizations = useCallback(async () => {
    try {
      setOrgsLoaded(false);
      const orgs = await dataService.fetchUserOrganizations();
      setOrganizations(orgs);
      
      // 自动选择第一个组织或从 localStorage 恢复
      const savedOrgId = localStorage.getItem('currentOrgId');
      const savedOrg = orgs.find(o => o.id === savedOrgId);
      if (savedOrg) {
        setCurrentOrgState(savedOrg);
        dataService.setCurrentOrg(savedOrg.id);
      } else if (orgs.length > 0) {
        setCurrentOrgState(orgs[0]);
        dataService.setCurrentOrg(orgs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
      setError(err.message);
    } finally {
      setOrgsLoaded(true);
    }
  }, []);

  // 加载当前组织的数据
  const loadOrgData = useCallback(async () => {
    if (!currentOrg) {
      if (!orgsLoaded) {
        setLoading(true);
        return;
      }
      setIssues([]);
      setUsers([]);
      setTeams([]);
      setCycles([]);
      setProjects([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [issuesData, usersData, teamsData, cyclesData, projectsData] = await Promise.all([
        dataService.fetchIssues(),
        dataService.fetchUsers(),
        dataService.fetchTeams(),
        dataService.fetchCycles(),
        dataService.fetchProjects(),
      ]);

      setIssues(issuesData);
      setUsers(usersData);
      setTeams(teamsData);
      setCycles(cyclesData);
      setProjects(projectsData);
    } catch (err: any) {
      console.error('Failed to load org data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [currentOrg, orgsLoaded]);

  // 初始化
  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  // 当组织变化时重新加载数据
  useEffect(() => {
    loadOrgData();
  }, [loadOrgData]);

  // 实时订阅
  useEffect(() => {
    if (!currentOrg) return;

    const unsubscribe = dataService.subscribeToChanges({
      onIssueChange: (payload) => {
        setIssues(prev => {
          if (payload.eventType === 'INSERT' && payload.new) {
            if (prev.some(i => i.id === payload.new.id)) return prev;
          }
          if (payload.new) {
            const existing = prev.find(i => i.id === payload.new.id);
            const normalized = {
              ...payload,
              new: toIssueFromRow(payload.new as any, existing),
            };
            return applyRealtimeChange(prev, normalized);
          }
          return applyRealtimeChange(prev, payload);
        });
      },
      onUserChange: (payload) => {
        setUsers(prev => {
          if (payload.eventType === 'INSERT' && payload.new) {
            return prev.some(userItem => userItem.id === payload.new.id) ? prev : prev;
          }
          if (payload.eventType === 'UPDATE' && payload.new) {
            return prev.some(userItem => userItem.id === payload.new.id)
              ? applyRealtimeChange(prev, payload)
              : prev;
          }
          if (payload.eventType === 'DELETE' && payload.old) {
            return prev.some(userItem => userItem.id === payload.old.id)
              ? applyRealtimeChange(prev, payload)
              : prev;
          }
          return applyRealtimeChange(prev, payload);
        });
      },
      onTeamChange: (payload) => {
        setTeams(prev => applyRealtimeChange(prev, payload));
      },
      onProjectChange: () => loadOrgData(),
      onCycleChange: () => loadOrgData(),
      onOrgMemberChange: () => loadOrgData(),
    });

    return unsubscribe;
  }, [currentOrg, loadOrgData]);

  // 切换组织
  const setCurrentOrg = useCallback((org: Organization | null) => {
    setCurrentOrgState(org);
    dataService.setCurrentOrg(org?.id || null);
    if (org) {
      localStorage.setItem('currentOrgId', org.id);
    } else {
      localStorage.removeItem('currentOrgId');
    }
  }, []);

  // 创建组织
  const createOrganization = useCallback(async (name: string, slug: string) => {
    const org = await dataService.createOrganization(name, slug);
    setOrganizations(prev => [...prev, org]);
    setCurrentOrg(org);
    return org;
  }, [setCurrentOrg]);

  // Issue 操作
  const createIssue = useCallback(async (
    issue: Omit<Issue, 'id' | 'createdAt' | 'updatedAt' | 'activities'>,
    userId: string
  ) => {
    const newIssue = await dataService.createIssue(issue, userId);
    setIssues(prev => (prev.some(existing => existing.id === newIssue.id) ? prev : [newIssue, ...prev]));
  }, []);

  const updateIssue = useCallback(async (issue: Issue) => {
    try {
      const updated = await dataService.updateIssue(issue);
      setIssues(prev => prev.map(i => i.id === updated.id ? updated : i));
      return updated;
    } catch (err: any) {
      console.error('Failed to update issue:', err);
      setError(err?.message || '更新任务失败');
      throw err;
    }
  }, []);

  const updateIssueComment = useCallback(async (issueId: string, activity: Issue['activities'][number]) => {
    try {
      const created = await dataService.createActivity(issueId, activity);
      const issue = issues.find(item => item.id === issueId);
      if (!issue) return undefined;
      const updatedIssue = {
        ...issue,
        activities: [created, ...(issue.activities || [])],
        updatedAt: created.timestamp,
      } as Issue;
      setIssues(prev => prev.map(item => item.id === issueId ? updatedIssue : item));
      return updatedIssue;
    } catch (err: any) {
      console.error('Failed to create comment:', err);
      setError(err?.message || '评论发送失败');
      throw err;
    }
  }, [issues]);

  const deleteIssueComment = useCallback(async (issueId: string, activityId: string, userId: string) => {
    try {
      await dataService.deleteActivity(activityId, userId);
      setIssues(prev => prev.map(item => {
        if (item.id !== issueId) return item;
        return {
          ...item,
          activities: (item.activities || []).filter(activity => activity.id !== activityId),
        };
      }));
    } catch (err: any) {
      console.error('Failed to delete comment:', err);
      setError(err?.message || '评论删除失败');
      throw err;
    }
  }, []);


  const migrateIssueIdentifiers = useCallback(async () => {
    const existing = new Set<string>();
    let updatedCount = 0;

    for (const issue of issues) {
      const seed = (issue.customFields?.branchName as string | undefined) || issue.title || '';
      const nextId = buildIdentifier(seed, existing);
      existing.add(nextId);

      if (issue.identifier !== nextId) {
        await dataService.updateIssueIdentifier(issue.id, nextId);
        updatedCount += 1;
      }
    }

    await loadOrgData();
    return { updated: updatedCount, total: issues.length };
  }, [issues, loadOrgData]);

  const deleteIssue = useCallback(async (id: string) => {
    await dataService.deleteIssue(id);
    setIssues(prev => prev.filter(i => i.id !== id));
  }, []);

  // User 操作
  const updateUser = useCallback(async (user: User) => {
    if (user.permissionRole) {
      await dataService.updateOrgMemberRole(user.id, user.permissionRole as PermissionRole);
    }
    const updated = await dataService.updateUser(user);
    setUsers(prev => prev.map(u => u.id === updated.id ? { ...updated, permissionRole: user.permissionRole ?? updated.permissionRole } : u));
  }, []);

  const updateUserPreferences = useCallback(async (
    userId: string,
    preferences: { themePreference: ThemePreference | null; layoutPreference: LayoutPreference | null }
  ) => {
    await dataService.updateUserPreferences(userId, preferences);
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...preferences } : u));
  }, []);

  const inviteUser = useCallback(async (email: string, role: PermissionRole = PermissionRole.Member) => {
    const result = await dataService.inviteUserToOrg(email, role);
    if (result.mode === 'added') {
      await loadOrgData();
    }
    return result;
  }, [loadOrgData]);

  const removeUser = useCallback(async (userId: string) => {
    try {
      await dataService.removeUserFromOrg(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (err: any) {
      console.error('Failed to remove user:', err);
      setError(err?.message || '移除成员失败');
      throw err;
    }
  }, []);

  // Project 操作
  const createProject = useCallback(async (project: Omit<Project, 'id'>) => {
    const newProject = await dataService.createProject(project);
    setProjects(prev => [...prev, newProject]);
  }, []);

  const updateProject = useCallback(async (project: Project) => {
    const updated = await dataService.updateProject(project);
    setProjects(prev => prev.map(p => p.id === updated.id ? updated : p));
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await dataService.deleteProject(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    setIssues(prev => prev.map(i => i.projectId === id ? { ...i, projectId: null } : i));
  }, []);

  // Cycle 操作
  const createCycle = useCallback(async (cycle: Omit<Cycle, 'id'>) => {
    const newCycle = await dataService.createCycle(cycle);
    setCycles(prev => [...prev, newCycle]);
  }, []);

  const updateCycle = useCallback(async (cycle: Cycle) => {
    const updated = await dataService.updateCycle(cycle);
    setCycles(prev => prev.map(c => c.id === updated.id ? updated : c));
  }, []);

  return {
    organizations,
    currentOrg,
    setCurrentOrg,
    createOrganization,
    issues,
    users,
    teams,
    cycles,
    projects,
    loading,
    error,
    createIssue,
    updateIssue,
    updateIssueComment,
    deleteIssueComment,
    deleteIssue,
    migrateIssueIdentifiers,
    updateUser,
    updateUserPreferences,
    inviteUser,
    removeUser,
    createProject,
    updateProject,
    deleteProject,
    createCycle,
    updateCycle,
    refresh: loadOrgData,
  };
};
