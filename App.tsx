
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Sidebar, Search, Plus, Inbox, Layers, Filter, UserIcon, 
  PriorityIcon, StatusIcon, ArrowDownWideNarrow, LayoutList, TeamIcon, 
  Sun, Moon, Monitor, MoreVertical, CalendarRange, Repeat, Users, Rocket,
  Briefcase, ProjectIcon, Settings, Zap, GitMerge, CheckCircle2, AlertCircle, XCircle,
  LayoutGrid, List, BarChart3, Clock, AlertTriangle, Check, LogOut, ChevronDown, ChevronRight, Edit3,
  MessageSquare
} from './components/Icons';
import NarrowSidebar, { SidebarMode } from './components/NarrowSidebar';
import ChatChannelsPane from './components/ChatChannelsPane';
import ChatMessagesPane from './components/ChatMessagesPane';
import { useChat } from './hooks/useChat';
import CreateIssueModal from './components/CreateIssueModal';
import CreateProjectModal from './components/CreateProjectModal'; 
import CreateCycleModal from './components/CreateCycleModal';
import IssueDetailPane from './components/IssueDetailPane';
import ProjectAiSidebar from './components/ProjectAiSidebar';
import WorkspaceAiPanel from './components/WorkspaceAiPanel';
import CyclesOverview from './components/CyclesOverview';
import CycleSummaryPanel from './components/CycleSummaryPanel';
import TeamMembersView from './components/TeamMembersView';
import LoginPage from './components/LoginPage';
import UserSettingsModal from './components/UserSettingsModal';
import { useAuth } from './contexts/AuthContext';
import { useData } from './hooks/useData';
import { Issue, ViewState, Team, Status, Priority, SortOption, GroupOption, Cycle, User, Project, UserRole, PermissionRole, Activity, InviteResult } from './types';
import { resolveAvatarUrl } from './services/avatar';
import { isSupabaseConfigured, supabase } from './services/supabaseClient';
import { computeReorderOrder, resolvePipelineDrop, resolveTeamDrop } from './services/issueWorkflow';
import { buildIdentifier } from './services/identifier';
import { isBugIssue } from './services/bugHelpers';
import { buildBugStats } from './services/bugStats';
import { getDefaultsForView } from './services/viewDefaults';
import { formatBeijingDate, formatBeijingDateTime, formatBeijingTime, getBeijingNow } from './constants';

const DEFAULT_VIEW_STATE: ViewState = { type: 'my' };
const DEFAULT_PIPELINE_STAGE: NonNullable<ViewState['pipelineStage']> = 'building';
const PIPELINE_STAGES: NonNullable<ViewState['pipelineStage']>[] = ['triage', 'building', 'qa', 'live'];
const VIEW_TYPES: ViewState['type'][] = ['all', 'my', 'team', 'cycle', 'cycles', 'members', 'project', 'pipeline', 'bug', 'chat'];

const normalizeViewState = (value: any): ViewState => {
  if (!value || typeof value !== 'object') return DEFAULT_VIEW_STATE;
  const type = VIEW_TYPES.includes(value.type) ? value.type : DEFAULT_VIEW_STATE.type;

  if (type === 'pipeline') {
    const pipelineStage = PIPELINE_STAGES.includes(value.pipelineStage)
      ? value.pipelineStage
      : DEFAULT_PIPELINE_STAGE;
    return { type, pipelineStage };
  }
  if (type === 'team') return value.teamId ? { type, teamId: value.teamId } : DEFAULT_VIEW_STATE;
  if (type === 'cycle') return value.cycleId ? { type, cycleId: value.cycleId } : DEFAULT_VIEW_STATE;
  if (type === 'project') return value.projectId ? { type, projectId: value.projectId } : DEFAULT_VIEW_STATE;
  if (type === 'chat') return value.channelId ? { type, channelId: value.channelId } : { type };
  return { type };
};

const loadViewState = (): ViewState => {
  try {
    const stored = localStorage.getItem('viewState');
    if (!stored) return DEFAULT_VIEW_STATE;
    return normalizeViewState(JSON.parse(stored));
  } catch {
    return DEFAULT_VIEW_STATE;
  }
};

const getIssueStatusRank = (status: Status) => {
  switch (status) {
    case Status.InQA:
    case Status.CodeMerged:
      return 0;
    case Status.InProgress:
      return 1;
    case Status.Todo:
    case Status.Backlog:
      return 2;
    case Status.Canceled:
    case Status.Closed:
      return 3;
    case Status.Done:
      return 4;
    default:
      return 5;
  }
};

const isBlockingStatus = (status: Status) => status === Status.Canceled || status === Status.Closed;

// --- Components ---

const SidebarItem = ({ icon, label, isActive, onClick, count, subLabel, className, isReleased, onDrop, onDragOver, onDragEnter, onDragLeave, isDragTarget }: any) => (
  <button 
    onClick={onClick}
    onDrop={onDrop}
    onDragOver={onDragOver}
    onDragEnter={onDragEnter}
    onDragLeave={onDragLeave}
    className={`w-full flex items-center px-3 py-2 rounded-xl transition-all duration-200 group relative mb-0.5
      ${isActive 
        ? 'bg-white dark:bg-white/10 text-main shadow-sm font-medium' 
        : 'text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-main'}
      ${isDragTarget ? 'ring-2 ring-accent/50 bg-accent/10' : ''}
      ${className || ''}
    `}
  >
    <span className={`transition-colors duration-200 flex items-center justify-center w-5 h-5 ${isActive ? 'text-accent' : isReleased ? 'text-green-500' : 'text-muted group-hover:text-main'}`}>
      {isReleased ? <Rocket size={18} /> : icon}
    </span>
    <div className="ml-3 flex flex-col items-start truncate">
        <span className="text-sm tracking-tight">{label}</span>
        {subLabel && <span className="text-[10px] opacity-70 font-normal">{subLabel}</span>}
    </div>
    {count !== undefined && count > 0 && (
      <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${isActive ? 'bg-accent/10 text-accent' : 'bg-transparent text-muted group-hover:bg-black/5 dark:group-hover:bg-white/10'}`}>
        {count}
      </span>
    )}
  </button>
);

const IssueCard: React.FC<{
  issue: Issue;
  selected: boolean;
  onClick: () => void;
  users: User[];
  cycles: Cycle[];
  projects: Project[];
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}> = ({
  issue,
  selected,
  onClick,
  users,
  cycles,
  projects,
  onDragStart,
  onDragEnd,
}) => {
  const assignee = users.find(u => u.id === issue.assigneeId);
  const cycle = cycles.find(c => c.id === issue.cycleId);
  const project = projects.find(p => p.id === issue.projectId);

  const isInactive = issue.status === Status.Done || issue.status === Status.Canceled || issue.status === Status.Closed;
  const isDone = issue.status === Status.Done || issue.status === Status.Closed;
  const isRejected = issue.status === Status.Canceled;
  const isDeployed = isDone && cycle?.isReleased;

  const getPriorityStyles = (p: Priority) => {
      switch (p) {
          case Priority.Urgent: return 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400';
          case Priority.High: return 'bg-orange-500/10 border-orange-500/20 text-orange-600 dark:text-orange-400';
          case Priority.Medium: return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-600 dark:text-yellow-400';
          default: return 'bg-black/5 dark:bg-white/5 border-transparent text-muted';
      }
  };

  const priorityStyle = getPriorityStyles(issue.priority);
  const isUrgent = issue.priority === Priority.Urgent;
  const totalSubtasks = issue.subtasks?.length || 0;
  const completedSubtasks = issue.subtasks?.filter(subtask => subtask.completed).length || 0;
  const subtaskProgress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  return (
    <div 
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className={`group relative flex items-start p-3 rounded-xl border transition-all duration-200 cursor-pointer w-full
        ${selected 
            ? 'bg-white dark:bg-white/10 border-accent/50 shadow-[0_0_0_2px_rgba(var(--accent),0.3)]' 
            : isUrgent && !isInactive
                ? 'bg-red-500/5 border-red-500/30 hover:bg-red-500/10' 
                : 'bg-surface border-transparent hover:bg-white hover:shadow-md hover:border-black/5 dark:hover:bg-white/5 dark:hover:border-white/5'
        }
        ${isInactive ? 'opacity-70' : ''}
        `}
    >
      <div className={`mt-0.5 mr-3 shrink-0 w-5 h-5 flex items-center justify-center rounded-md border ${priorityStyle} transition-colors`}>
         <PriorityIcon priority={issue.priority} />
      </div>

      <div className="flex-1 min-w-0">
         <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono text-muted group-hover:text-main transition-colors flex items-center gap-2 min-w-0">
              <span className="truncate whitespace-nowrap">{issue.identifier}</span>
              {isDeployed && <Rocket size={10} className="text-green-500" />}
              {isRejected && <XCircle size={10} className="text-red-500" />}
            </span>
            <span className="text-[10px] text-muted">{formatBeijingDate(issue.createdAt, { month: 'numeric', day: 'numeric' })}</span>
         </div>

         <h3 className={`text-sm font-medium leading-snug mb-1.5 transition-colors line-clamp-2 
            ${selected ? 'text-accent' : isInactive ? 'text-muted line-through decoration-muted/50' : 'text-main'}
         `}>
            {issue.title}
         </h3>

         <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-1.5 min-w-0">
                {project && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted truncate max-w-[120px]">
                        {project.icon} {project.name}
                    </span>
                )}
                {issue.labels.slice(0, 1).map(label => (
                    <span key={label} className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted truncate max-w-[80px]">
                        {label}
                    </span>
                ))}
                {totalSubtasks > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-muted inline-flex items-center gap-1">
                    <span>{completedSubtasks}/{totalSubtasks}</span>
                    <span className="w-6 h-1 rounded-full bg-black/10 dark:bg-white/20 overflow-hidden">
                      <span className="block h-full rounded-full bg-accent/60" style={{ width: `${subtaskProgress}%` }} />
                    </span>
                  </span>
                )}
            </div>
            <div className="shrink-0">
              {assignee ? (
                  <img src={resolveAvatarUrl(assignee.name || assignee.email, assignee.avatarUrl)} alt={assignee.name} className="w-5 h-5 rounded-full" title={assignee.name} />
              ) : (
                  <div className="w-5 h-5 rounded-full border border-dashed border-muted/50" title="未分配" />
              )}
            </div>
         </div>
      </div>
    </div>
  )
}

const IssueRow: React.FC<{
  issue: Issue;
  selected: boolean;
  onClick: () => void;
  users: User[];
  cycles: Cycle[];
  projects: Project[];
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  isDragTarget?: boolean;
}> = ({
  issue,
  selected,
  onClick,
  users,
  cycles,
  projects,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
  onDragEnter,
  onDragLeave,
  isDragTarget,
}) => {
  const assignee = users.find(u => u.id === issue.assigneeId);
  const cycle = cycles.find(c => c.id === issue.cycleId);
  const project = projects.find(p => p.id === issue.projectId);

  const isInactive = issue.status === Status.Done || issue.status === Status.Canceled || issue.status === Status.Closed;
  const isDone = issue.status === Status.Done || issue.status === Status.Closed;
  const isRejected = issue.status === Status.Canceled;
  const isDeployed = isDone && cycle?.isReleased;
  const totalSubtasks = issue.subtasks?.length || 0;
  const completedSubtasks = issue.subtasks?.filter(subtask => subtask.completed).length || 0;
  const subtaskProgress = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;

  return (
    <div 
        onClick={onClick}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        className={`group flex items-center gap-3 px-4 py-2.5 border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer last:border-b-0
        ${selected ? 'bg-accent/5' : 'bg-surface/50'}
        ${isDragTarget ? 'bg-accent/10 ring-2 ring-accent/40' : ''}
        ${isInactive ? 'opacity-70' : ''}
        `}
    >
       <div className="shrink-0 text-muted" title={issue.priority}><PriorityIcon priority={issue.priority} /></div>
       <div className="shrink-0 w-40 text-[10px] font-mono text-muted truncate whitespace-nowrap" title={issue.identifier}>{issue.identifier}</div>
       <div className="shrink-0" title={issue.status}><StatusIcon status={issue.status} /></div>
       <div className="flex-1 min-w-0 font-medium text-sm text-main truncate flex items-center gap-2">
          {project && (
              <span title={project.name} className="flex items-center gap-1 text-muted text-xs bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                  {project.icon} <span className="hidden lg:inline">{project.name}</span>
              </span>
          )}
           <span className={`${isInactive ? 'line-through text-muted' : ''} truncate`}>{issue.title}</span>
           {totalSubtasks > 0 && (
             <span className="hidden md:flex items-center gap-1 text-[10px] text-muted">
               <span>{completedSubtasks}/{totalSubtasks}</span>
               <span className="w-12 h-1 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                 <span className="block h-full rounded-full bg-accent/70" style={{ width: `${subtaskProgress}%` }} />
               </span>
             </span>
           )}
           {isDeployed && <span title="已发布"><Rocket size={12} className="text-green-500" /></span>}
           {isRejected && <span title="已驳回"><XCircle size={12} className="text-red-500" /></span>}
        </div>

       <div className="hidden sm:flex items-center gap-1.5">
          {issue.labels.slice(0, 2).map(l => (
             <span key={l} className="text-[10px] px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-muted border border-black/5 dark:border-white/5 whitespace-nowrap">{l}</span>
          ))}
       </div>
       <div className="hidden md:block shrink-0 text-xs text-muted w-16 text-right">
          {formatBeijingDate(issue.createdAt, { month: 'numeric', day: 'numeric' })}
       </div>
       <div className="shrink-0 w-28 flex justify-end">
          {assignee ? (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <img src={resolveAvatarUrl(assignee.name || assignee.email, assignee.avatarUrl)} alt={assignee.name} className="w-5 h-5 rounded-full" title={assignee.name} />
                <span className="hidden lg:inline">{assignee.name}</span>
              </div>
          ) : (
              <div className="w-5 h-5 rounded-full border border-dashed border-muted/50" title="未分配" />
          )}
       </div>
    </div>
  )
}

// --- DASHBOARD COMPONENTS ---

const StatCard = ({ label, count, icon, colorClass, borderClass, subText }: any) => (
    <div className={`flex-1 min-w-[140px] p-2.5 sm:p-3 rounded-xl bg-surface-glass border ${borderClass || 'border-black/5 dark:border-white/5'} shadow-sm flex items-center justify-between gap-2 relative overflow-hidden group hover:border-black/10 transition-all`}>
        <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center ${colorClass}`}>
            {icon}
        </div>
        <div className="relative z-10 flex-1 min-w-0">
            <div className="flex items-center gap-2">
                <div className="text-lg sm:text-xl font-bold text-main shrink-0">{count}</div>
                <div className="text-[11px] sm:text-xs font-semibold text-muted uppercase tracking-wider truncate">{label}</div>
            </div>
            {subText && <div className="text-[10px] text-muted opacity-80 truncate">{subText}</div>}
        </div>
        {/* Background Decoration */}
        <div className={`absolute -right-5 -bottom-5 w-12 h-12 rounded-full opacity-10 ${colorClass.split(' ')[0]}`}></div>
    </div>
);

const WorkspaceCard = ({ title, subtitle, children, action }: any) => (
    <div className="bg-surface-glass border border-black/5 dark:border-white/10 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between">
            <div>
                <div className="text-sm font-semibold text-main">{title}</div>
                {subtitle && <div className="text-[11px] text-muted">{subtitle}</div>}
            </div>
            {action}
        </div>
        {children}
    </div>
);

const BusinessDashboardHeader: React.FC<{ issues: Issue[], inboxTeamId: string, engTeamId: string }> = ({ issues, inboxTeamId, engTeamId }) => {
    // 1. Pending: Inbox
    const pendingCount = issues.filter(i => i.teamId === inboxTeamId && i.status === Status.Backlog).length;
    // 2. In Pipeline: Accepted (In Eng team)
    const activeEngCount = issues.filter(i => i.teamId === engTeamId && i.status !== Status.Canceled).length;
    // 3. Rejection Rate
    const totalProcessed = issues.filter(i => i.teamId === inboxTeamId && (i.status === Status.Canceled || i.status === Status.Done)).length + activeEngCount;
    const rejectedCount = issues.filter(i => i.status === Status.Canceled).length;
    const adoptionRate = totalProcessed > 0 ? Math.round(((totalProcessed - rejectedCount) / totalProcessed) * 100) : 100;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 px-2 mb-4 sm:mb-6 animate-fade-in">
            <StatCard 
                label="待决策 (Inbox)" 
                count={pendingCount} 
                icon={<Inbox size={16} />} 
                colorClass="bg-indigo-500/10 text-indigo-500"
                subText="需业务审核"
            />
            <StatCard 
                label="研发中 (Building)" 
                count={activeEngCount} 
                icon={<Zap size={16} />} 
                colorClass="bg-blue-500/10 text-blue-500"
                subText="已流转至研发"
            />
            <StatCard 
                label="需求采纳率" 
                count={`${adoptionRate}%`} 
                icon={<BarChart3 size={16} />} 
                colorClass="bg-green-500/10 text-green-500"
                subText="质量健康度"
            />
            <StatCard 
                label="已驳回 (Rejected)" 
                count={rejectedCount} 
                icon={<XCircle size={16} />} 
                colorClass="bg-red-500/10 text-red-500"
                subText="被取消的需求"
            />
        </div>
    );
};

  const EngineeringDashboardHeader: React.FC<{ issues: Issue[], cycles: Cycle[], engTeamId: string }> = ({ issues, cycles, engTeamId }) => {
    // Current Cycle Stats
    const currentCycle = cycles.find(c => {
        const nowInBeijing = getBeijingNow();
        return nowInBeijing >= c.startDate && nowInBeijing <= c.endDate;
    }) || cycles[0];


    const cycleIssues = currentCycle ? issues.filter(i => i.cycleId === currentCycle.id) : [];
    const totalCycle = cycleIssues.length;
    const doneCycle = cycleIssues.filter(i => i.status === Status.Done || i.status === Status.Closed).length;
    const progress = totalCycle === 0 ? 0 : Math.round((doneCycle / totalCycle) * 100);

    // Bug Radar
    const activeBugs = issues.filter(i => i.labels.includes('Bug') && i.status !== Status.Done && i.status !== Status.Closed && i.status !== Status.Canceled).length;

    // Unassigned (Workload)
    const unassignedCount = issues.filter(i => i.teamId === engTeamId && !i.assigneeId && i.status !== Status.Done && i.status !== Status.Closed).length;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 px-2 mb-4 sm:mb-6 animate-fade-in">
            <StatCard 
                label="本周迭代" 
                count={`${progress}%`} 
                icon={<Clock size={16} />} 
                colorClass="bg-emerald-500/10 text-emerald-500"
                subText={`${doneCycle}/${totalCycle} 任务完成`}
            />
            <StatCard 
                label="活跃 Bugs" 
                count={activeBugs} 
                icon={<AlertTriangle size={16} />} 
                colorClass={activeBugs > 0 ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500"}
                subText="需优先修复"
            />
            <StatCard 
                label="待认领任务" 
                count={unassignedCount} 
                icon={<UserIcon size={16} />} 
                colorClass="bg-orange-500/10 text-orange-500"
                subText="无人负责"
            />
             <StatCard 
                label="活跃任务总数" 
                count={issues.filter(i => i.teamId === engTeamId && (i.status === Status.Todo || i.status === Status.InProgress)).length} 
                icon={<Zap size={16} />} 
                colorClass="bg-yellow-500/10 text-yellow-500"
                subText="Todo + In Progress"
            />
        </div>
    );
};

const QADashboardHeader: React.FC<{ issues: Issue[] }> = ({ issues }) => {
    const qaIssues = issues.filter(i =>
        i.status === Status.CodeMerged ||
        i.status === Status.InQA ||
        i.status === Status.Done ||
        i.status === Status.Closed ||
        i.status === Status.Canceled
    );
    const total = qaIssues.length;
    const passed = qaIssues.filter(i => i.status === Status.Done || i.status === Status.Closed).length;
    const pending = qaIssues.filter(i => i.status === Status.CodeMerged || i.status === Status.InQA).length;
    const rejected = qaIssues.filter(i => i.status === Status.Canceled).length;
    const bugTagged = qaIssues.filter(i => i.labels.includes('Bug')).length;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 100;
    const reworkRate = total > 0 ? Math.round((bugTagged / total) * 100) : 0;

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 px-2 mb-4 sm:mb-6 animate-fade-in">
            <StatCard
                label="通过率"
                count={`${passRate}%`}
                icon={<CheckCircle2 size={16} />}
                colorClass="bg-emerald-500/10 text-emerald-500"
                subText={`${passed}/${total} 已通过`}
            />
            <StatCard
                label="待验收"
                count={pending}
                icon={<AlertTriangle size={16} />}
                colorClass="bg-orange-500/10 text-orange-500"
                subText="CodeMerged + InQA"
            />
            <StatCard
                label="驳回"
                count={rejected}
                icon={<XCircle size={16} />}
                colorClass="bg-red-500/10 text-red-500"
                subText="已取消"
            />
            <StatCard
                label="返工率"
                count={`${reworkRate}%`}
                icon={<AlertCircle size={16} />}
                colorClass="bg-yellow-500/10 text-yellow-500"
                subText={`${bugTagged} 个标记 Bug`}
            />
        </div>
    );
};

const BugDashboardHeader: React.FC<{ issues: Issue[] }> = ({ issues }) => {
    const stats = buildBugStats(issues);

    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 px-2 mb-4 sm:mb-6 animate-fade-in">
            <StatCard
                label="总 Bug"
                count={stats.total}
                icon={<AlertCircle size={16} />}
                colorClass="bg-rose-500/10 text-rose-500"
                subText="全部 Bug"
            />
            <StatCard
                label="未关闭"
                count={stats.open}
                icon={<AlertTriangle size={16} />}
                colorClass="bg-orange-500/10 text-orange-500"
                subText="进行中 + 待验收"
            />
            <StatCard
                label="已修复"
                count={stats.fixed}
                icon={<CheckCircle2 size={16} />}
                colorClass="bg-emerald-500/10 text-emerald-500"
                subText="Done + Closed"
            />
            <StatCard
                label="返工率"
                count={`${stats.reopenRate}%`}
                icon={<AlertCircle size={16} />}
                colorClass="bg-yellow-500/10 text-yellow-500"
                subText={`${stats.reopened} 次返工`}
            />
        </div>
    );
};

// --- Main App ---

function App() {
  const { user, loading: authLoading, signOut } = useAuth();
  const {
    organizations,
    currentOrg,
    setCurrentOrg,
    createOrganization,
    issues,
    users,
    teams,
    cycles,
    projects,
    loading: dataLoading,
    error: dataError,
    createIssue,
    updateIssue,
    updateIssueComment,
    deleteIssueComment,
    deleteIssue,
    updateUser,
    updateUserPreferences,
    inviteUser,
    removeUser,
    createProject,
    updateProject,
    deleteProject,
    createCycle,
    updateCycle,
    migrateIssueIdentifiers,
  } = useData();

  const [viewState, setViewState] = useState<ViewState>(() => loadViewState());
  const [layout, setLayout] = useState<'board' | 'list'>(() => {
    const saved = localStorage.getItem('issueLayout');
    return saved === 'list' || saved === 'board' ? saved : 'board';
  });
  
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isCycleModalOpen, setIsCycleModalOpen] = useState(false);
  const [isOrgModalOpen, setIsOrgModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingCycle, setEditingCycle] = useState<Cycle | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState<'all' | 'review' | 'inProgress' | 'todo' | 'blocked'>('all');
  
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => (localStorage.getItem('theme') as any) || 'system');
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const issueSelectionRef = useRef<string | null>(null);
  const [isUserSettingsOpen, setIsUserSettingsOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('priority'); 
  const [groupBy, setGroupBy] = useState<GroupOption>('status');
  const [showOrgDropdown, setShowOrgDropdown] = useState(false);
  const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
  const [dragHoverTarget, setDragHoverTarget] = useState<string | null>(null);
  const [dragHoverRowId, setDragHoverRowId] = useState<string | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState<'all' | 'feature' | 'bug'>(() => {
    const saved = localStorage.getItem('pipelineFilter');
    return saved === 'feature' || saved === 'bug' || saved === 'all' ? saved : 'all';
  });
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    const saved = localStorage.getItem('sidebarMode');
    return saved === 'chat' ? 'chat' : 'project';
  });

  // Chat hook - always call at top level
  const chatHook = useChat({ 
    orgId: currentOrg?.id || null, 
    userId: user?.id || null 
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const issueId = params.get('issue');
    if (issueId && issueId !== issueSelectionRef.current) {
      setSelectedIssueId(issueId);
      issueSelectionRef.current = issueId;
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedIssueId) {
      url.searchParams.set('issue', selectedIssueId);
    } else {
      url.searchParams.delete('issue');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    issueSelectionRef.current = selectedIssueId;
  }, [selectedIssueId]);

  const listRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const loading = authLoading || dataLoading;
  const currentUserRecord = useMemo(() => (
    user ? users.find(u => u.id === user.id) || null : null
  ), [user, users]);
  const workspaceAiUser = useMemo(() => {
    if (currentUserRecord) return currentUserRecord;
    if (!user) return null;
    const fallbackName = user.email ? user.email.split('@')[0] : '成员';
    return {
      id: user.id,
      name: fallbackName,
      email: user.email || '',
      avatarUrl: '',
      role: UserRole.Other,
    };
  }, [currentUserRecord, user]);

  const isAdmin =
    currentUserRecord?.permissionRole === PermissionRole.Admin ||
    String(currentUserRecord?.permissionRole || currentUserRecord?.role || '').toLowerCase() === 'admin';

  useEffect(() => {
    if (!currentUserRecord) return;

    if (currentUserRecord.themePreference) {
      setTheme(currentUserRecord.themePreference);
    }

    if (currentUserRecord.layoutPreference) {
      setLayout(currentUserRecord.layoutPreference);
    }
  }, [currentUserRecord]);

  // 动态获取团队 ID
  const inboxTeam = teams.find(t => t.icon === 'Inbox' || t.name.includes('收件箱'));
  const engTeam = teams.find(t => t.icon === 'Zap' || t.name.includes('研发'));
  const REQUIREMENT_POOL_ID = inboxTeam?.id || '';
  const ENGINEERING_ID = engTeam?.id || '';

  useEffect(() => {
      // Force Kanban layout when switching to Engineering view for better UX
      if (viewState.type === 'team' && viewState.teamId === ENGINEERING_ID) {
          setLayout('board');
          setGroupBy('status');
      }
      // Default to a flat list of backlog for Inbox, but don't force layout
      if (viewState.type === 'team' && viewState.teamId === REQUIREMENT_POOL_ID) {
          setGroupBy('none');
      }
      if (viewState.type !== 'my') {
          setWorkspaceFilter('all');
      }
      const defaults = getDefaultsForView(viewState.type);
      if (defaults.sortBy) setSortBy(defaults.sortBy);
      if (defaults.groupBy) setGroupBy(defaults.groupBy);
  }, [viewState.type, viewState.teamId, ENGINEERING_ID, REQUIREMENT_POOL_ID]);

  useEffect(() => {
    localStorage.setItem('issueLayout', layout);
  }, [layout]);

  useEffect(() => {
    localStorage.setItem('pipelineFilter', pipelineFilter);
  }, [pipelineFilter]);

  useEffect(() => {
    localStorage.setItem('viewState', JSON.stringify(viewState));
  }, [viewState]);

  useEffect(() => {
    localStorage.setItem('sidebarMode', sidebarMode);
    // When switching to chat mode, set viewState to chat
    if (sidebarMode === 'chat' && viewState.type !== 'chat') {
      setViewState({ type: 'chat' });
    }
    // When switching to project mode from chat, go back to default view
    if (sidebarMode === 'project' && viewState.type === 'chat') {
      setViewState({ type: 'my' });
    }
  }, [sidebarMode]);

  useEffect(() => {
    if (loading) return;

    if (viewState.type === 'project') {
      if (!viewState.projectId || !projects.some(p => p.id === viewState.projectId)) {
        setViewState(DEFAULT_VIEW_STATE);
      }
      return;
    }

    if (viewState.type === 'cycle') {
      if (!viewState.cycleId || !cycles.some(c => c.id === viewState.cycleId)) {
        setViewState(DEFAULT_VIEW_STATE);
      }
      return;
    }

    if (viewState.type === 'team') {
      if (!viewState.teamId || !teams.some(t => t.id === viewState.teamId)) {
        setViewState(DEFAULT_VIEW_STATE);
      }
      return;
    }

    if (viewState.type === 'pipeline') {
      const pipelineStage = viewState.pipelineStage;
      if (!pipelineStage || !PIPELINE_STAGES.includes(pipelineStage)) {
        setViewState(DEFAULT_VIEW_STATE);
      }
    }
  }, [loading, viewState, projects, cycles, teams]);

  const allowDrop = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleDragStart = (issueId: string) => (event: React.DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', issueId);
    setDraggingIssueId(issueId);
    setDragHoverTarget(null);
  };

  const handleDragEnd = () => {
    setDraggingIssueId(null);
    setDragHoverTarget(null);
    setDragHoverRowId(null);
  };

  const applyIssueUpdate = async (issueId: string, updates: Partial<Issue>) => {
    const issue = issues.find(i => i.id === issueId);
    if (!issue) return;
    try {
      await updateIssue({ ...issue, ...updates });
    } catch (err: any) {
      alert('更新失败: ' + (err?.message || JSON.stringify(err)));
    }
  };

  const handleDropToStatus = (status: Status) => async (event: React.DragEvent) => {
    event.preventDefault();
    const issueId = event.dataTransfer.getData('text/plain') || draggingIssueId;
    if (!issueId) return;
    await applyIssueUpdate(issueId, { status });
    setDraggingIssueId(null);
    setDragHoverTarget(null);
    setDragHoverRowId(null);
  };

  const handleDropToTeam = (teamId: string) => async (event: React.DragEvent) => {
    event.preventDefault();
    const issueId = event.dataTransfer.getData('text/plain') || draggingIssueId;
    if (!issueId) return;
    const issue = issues.find(i => i.id === issueId);
    if (!issue) return;
    const updates = resolveTeamDrop(issue.status, teamId, REQUIREMENT_POOL_ID, ENGINEERING_ID);
    await applyIssueUpdate(issueId, updates);
    setDraggingIssueId(null);
    setDragHoverTarget(null);
    setDragHoverRowId(null);
  };

  const handleDropToPipeline = (stage: ViewState['pipelineStage']) => async (event: React.DragEvent) => {
    event.preventDefault();
    const issueId = event.dataTransfer.getData('text/plain') || draggingIssueId;
    if (!issueId || !stage) return;
    const updates = resolvePipelineDrop(stage, REQUIREMENT_POOL_ID, ENGINEERING_ID);
    await applyIssueUpdate(issueId, updates);
    setDraggingIssueId(null);
    setDragHoverTarget(null);
    setDragHoverRowId(null);
  };

  const reorderIssues = async (list: Issue[], sourceId: string, targetId: string) => {
    const result = computeReorderOrder(list, sourceId, targetId);
    if (!result) return;
    const movedIssue = issues.find(i => i.id === result.id);
    if (!movedIssue) return;
    setSortBy('manual');
    try {
      await updateIssue({ ...movedIssue, customFields: { ...movedIssue.customFields, order: result.order } });
    } catch (err: any) {
      alert('排序失败: ' + (err?.message || JSON.stringify(err)));
    }
  };

  const handleDropReorder = (list: Issue[], targetId: string) => async (event: React.DragEvent) => {
    event.preventDefault();
    const sourceId = event.dataTransfer.getData('text/plain') || draggingIssueId;
    if (!sourceId) return;
    await reorderIssues(list, sourceId, targetId);
    setDraggingIssueId(null);
    setDragHoverTarget(null);
    setDragHoverRowId(null);
  };

  // Cycle Logic
  const currentCycle = useMemo(() => {
    const nowInBeijing = getBeijingNow();
    return cycles.find(c => nowInBeijing >= c.startDate && nowInBeijing <= c.endDate) || cycles[0];
  }, [cycles]);

  // Theme Logic
  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (t: 'light' | 'dark' | 'system') => {
      let effectiveTheme = t;
      if (t === 'system') effectiveTheme = mediaQuery.matches ? 'dark' : 'light';
      root.classList.toggle('dark', effectiveTheme === 'dark');
      if (t === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', t);
    };
    applyTheme(theme);
    const listener = () => theme === 'system' && applyTheme('system');
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  const isWorkspace = viewState.type === 'my';

  const myIssues = useMemo(() => (
    user ? issues.filter(i => i.assigneeId === user.id) : []
  ), [issues, user]);

  const workspaceStats = useMemo(() => {
    const review = myIssues.filter(i => i.status === Status.InQA || i.status === Status.CodeMerged);
    const inProgress = myIssues.filter(i => i.status === Status.InProgress);
    const todo = myIssues.filter(i => i.status === Status.Todo || i.status === Status.Backlog);
    const blocked = myIssues.filter(i => isBlockingStatus(i.status));
    const highPriority = myIssues.filter(i => (i.priority === Priority.Urgent || i.priority === Priority.High) && !isBlockingStatus(i.status) && i.status !== Status.Done);

    return {
      review,
      inProgress,
      todo,
      blocked,
      highPriority,
    };
  }, [myIssues]);

  const workspaceOverview = useMemo(() => {
    const counts = issues.reduce(
      (acc, issue) => {
        if (issue.status === Status.Done || issue.status === Status.Closed) {
          acc.done += 1;
        } else if (issue.status === Status.Canceled) {
          acc.blocked += 1;
        } else if (issue.status === Status.InQA || issue.status === Status.CodeMerged) {
          acc.qa += 1;
        } else if (issue.status === Status.InProgress) {
          acc.inProgress += 1;
        } else if (issue.status === Status.Todo || issue.status === Status.Backlog || !issue.assigneeId) {
          acc.todoUnassigned += 1;
        } else {
          acc.todoUnassigned += 1;
        }
        return acc;
      },
      {
        total: issues.length,
        done: 0,
        inProgress: 0,
        qa: 0,
        blocked: 0,
        todoUnassigned: 0,
      }
    );

    return counts;
  }, [issues]);

  const availableWorkspaceIssues = useMemo(() => (
    issues.filter(issue => !issue.assigneeId && issue.status !== Status.Canceled && issue.status !== Status.Closed)
  ), [issues]);

  const workspaceProjects = useMemo(() => {
    const summary = new Map<string, { project: Project; openCount: number; blockedCount: number }>();
    myIssues.forEach(issue => {
      if (!issue.projectId) return;
      const project = projects.find(p => p.id === issue.projectId);
      if (!project) return;
      if (!summary.has(project.id)) {
        summary.set(project.id, { project, openCount: 0, blockedCount: 0 });
      }
      const entry = summary.get(project.id)!;
      if (isBlockingStatus(issue.status)) entry.blockedCount += 1;
      if (issue.status !== Status.Done && issue.status !== Status.Closed && issue.status !== Status.Canceled) {
        entry.openCount += 1;
      }
    });
    return Array.from(summary.values()).sort((a, b) => b.openCount - a.openCount);
  }, [myIssues, projects]);

  const renderWorkspaceActivity = (activity: Activity) => {
    if (activity.type === 'comment') return <span>评论：{activity.newValue || '（空）'}</span>;
    if (activity.type === 'update' && activity.field) {
      if (activity.newValue) {
        return (
          <span className="flex items-center gap-1.5 flex-wrap">
            将 <span className="font-medium text-muted">{activity.field}</span>
            {activity.oldValue && (
              <>从 <span className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-muted decoration-slate-400 line-through text-xs">{activity.oldValue}</span></>
            )}
            变更为了
            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium text-xs">{activity.newValue}</span>
          </span>
        );
      }
      return <span>更新了{activity.field}</span>;
    }
    if (activity.type === 'create') return <span>创建了任务</span>;
    return <span>更新了任务</span>;
  };

  const recentUpdates = useMemo(() => {
    if (!user) return [];
    const now = getBeijingNow();
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return issues
      .map(issue => {
        const latestActivity = (issue.activities || [])
          .filter(activity => activity.userId === user.id && activity.type !== 'create')
          .filter(activity => new Date(activity.timestamp) >= cutoff)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        return latestActivity ? { issue, activity: latestActivity } : null;
      })
      .filter((entry): entry is { issue: Issue; activity: Activity } => Boolean(entry))
      .sort((a, b) => new Date(b.activity.timestamp).getTime() - new Date(a.activity.timestamp).getTime())
      .slice(0, 3);
  }, [issues, user]);

  const workspaceSummary = useMemo(() => {
    return `待验收 ${workspaceStats.review.length} · 进行中 ${workspaceStats.inProgress.length} · 待办 ${workspaceStats.todo.length} · 高优先级 ${workspaceStats.highPriority.length}`;
  }, [workspaceStats]);

  const workspaceDotScale = (count: number) => {
    if (count > 200) return 10;
    if (count > 100) return 5;
    return 1;
  };

  const workspaceStatusDots = [
    { key: 'done', label: '已完成', count: workspaceOverview.done, color: 'bg-emerald-500' },
    { key: 'blocked', label: '阻塞/bug', count: workspaceOverview.blocked, color: 'bg-red-500' },
    { key: 'qa', label: '合并/测试', count: workspaceOverview.qa, color: 'bg-amber-500' },
    { key: 'inProgress', label: '进行中', count: workspaceOverview.inProgress, color: 'bg-blue-500' },
    { key: 'todo', label: '待办/未认领', count: workspaceOverview.todoUnassigned, color: 'bg-[rgba(237,236,236,1)]' },
  ];

  const workspaceTotalCount = workspaceOverview.total;
  const workspaceDotScaleValue = workspaceDotScale(workspaceTotalCount);

  const renderWorkspaceDots = () => {
    if (workspaceTotalCount === 0) {
      return <span className="text-[10px] text-muted">暂无任务</span>;
    }

    const maxDots = 100;
    const scale = Math.max(workspaceDotScaleValue, Math.ceil(workspaceTotalCount / maxDots));

    const actualDots = workspaceStatusDots.flatMap(item => {
      const totalDots = Math.ceil(item.count / scale);
      return Array.from({ length: totalDots }, (_, index) => {
        const remaining = item.count - index * scale;
        const represented = Math.min(scale, remaining);
        const tooltip = `${item.label} · ${represented} 个任务${scale > 1 ? `（每点=${scale}）` : ''}`;
        return (
          <span
            key={`${item.key}-${index}`}
            title={tooltip}
            className={`h-2.5 w-2.5 rounded-full ${item.color}`}
          />
        );
      });
    });

    const placeholders = Math.max(maxDots - actualDots.length, 0);

    return [
      ...actualDots,
      ...Array.from({ length: placeholders }, (_, index) => (
        <span
          key={`placeholder-${index}`}
          className="h-2.5 w-2.5 rounded-full border border-black/10 dark:border-white/10"
        />
      )),
    ];
  };

  // Data Filtering
  const filteredIssues = useMemo(() => {
    let filtered = issues;
    
    if (viewState.type === 'pipeline') {
        if (viewState.pipelineStage === 'triage') filtered = filtered.filter(i => i.teamId === REQUIREMENT_POOL_ID || i.status === Status.Backlog);
        else if (viewState.pipelineStage === 'building') filtered = filtered.filter(i => i.teamId === ENGINEERING_ID && (i.status === Status.Todo || i.status === Status.InProgress));
        else if (viewState.pipelineStage === 'qa') filtered = filtered.filter(i => i.status === Status.CodeMerged || i.status === Status.InQA);
        else if (viewState.pipelineStage === 'live') filtered = filtered.filter(i => i.status === Status.Done || i.status === Status.Closed);
        if (pipelineFilter === 'bug') filtered = filtered.filter(isBugIssue);
        if (pipelineFilter === 'feature') filtered = filtered.filter(i => !isBugIssue(i));
    }
    else if (viewState.type === 'my') {
      filtered = user ? filtered.filter(i => i.assigneeId === user.id) : [];
      if (workspaceFilter !== 'all') {
        filtered = filtered.filter(issue => {
          if (workspaceFilter === 'review') return issue.status === Status.InQA || issue.status === Status.CodeMerged;
          if (workspaceFilter === 'inProgress') return issue.status === Status.InProgress;
          if (workspaceFilter === 'todo') return issue.status === Status.Todo || issue.status === Status.Backlog;
          if (workspaceFilter === 'blocked') return isBlockingStatus(issue.status);
          return true;
        });
      }
    }
    else if (viewState.type === 'bug') filtered = filtered.filter(isBugIssue);
    else if (viewState.type === 'team' && viewState.teamId) {
        // For Business Inbox, show everything so they can see history, not just Backlog
        if (viewState.teamId === REQUIREMENT_POOL_ID) {
            filtered = filtered.filter(i => i.teamId === REQUIREMENT_POOL_ID);
        } else {
            filtered = filtered.filter(i => i.teamId === viewState.teamId);
        }
    } else if (viewState.type === 'cycle' && viewState.cycleId) filtered = filtered.filter(i => i.cycleId === viewState.cycleId);
    else if (viewState.type === 'project' && viewState.projectId) filtered = filtered.filter(i => i.projectId === viewState.projectId);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(i => i.title.toLowerCase().includes(q) || i.identifier.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }

    return filtered.sort((a, b) => {
        if (sortBy === 'manual') {
            const orderA = Number(a.customFields?.order ?? Number.MAX_SAFE_INTEGER);
            const orderB = Number(b.customFields?.order ?? Number.MAX_SAFE_INTEGER);
            if (orderA !== orderB) return orderA - orderB;
        }
        if (sortBy === 'priority') {
            const pOrder = { [Priority.Urgent]: 4, [Priority.High]: 3, [Priority.Medium]: 2, [Priority.Low]: 1, [Priority.NoPriority]: 0 };
            return pOrder[b.priority] - pOrder[a.priority];
        }
        if (sortBy === 'status') return a.status.localeCompare(b.status);
        return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }, [issues, viewState, searchQuery, sortBy, pipelineFilter, workspaceFilter, user, REQUIREMENT_POOL_ID, ENGINEERING_ID]);

  const groupedIssues: Record<string, Issue[]> = useMemo(() => {
     if (groupBy === 'none') return { '列表': filteredIssues };
     
     // Special Handling for Engineering Kanban: Ensure columns exist even if empty
     const isEngBoard = viewState.type === 'team' && viewState.teamId === ENGINEERING_ID && groupBy === 'status';

     const groups: Record<string, Issue[]> = {};
     
     if (groupBy === 'status') {
         let relevantStatuses = Object.values(Status);
         
         // Custom Columns for Engineering Board
         if (isEngBoard) {
             relevantStatuses = [Status.Todo, Status.InProgress, Status.CodeMerged, Status.InQA, Status.Done];
         }
         
         relevantStatuses.forEach(s => {
             if (isEngBoard || filteredIssues.some(i => i.status === s)) { 
                 groups[s] = [];
             }
         });
     }
     else if (groupBy === 'priority') Object.values(Priority).forEach(p => groups[p] = []);
     else if (groupBy === 'project') {
         projects.forEach(p => groups[p.name] = []);
         groups['未分类'] = [];
     }
     
     filteredIssues.forEach(issue => {
        let key = '';
        if (groupBy === 'status') key = issue.status;
        else if (groupBy === 'priority') key = issue.priority;
        else if (groupBy === 'project') {
            const p = projects.find(proj => proj.id === issue.projectId);
            key = p ? p.name : '未分类';
        }
        if (groups[key]) groups[key].push(issue);
     });
     
     // Clean up empty keys only if NOT Engineering Kanban (we want fixed columns there)
     if (!isEngBoard) {
        return Object.fromEntries(Object.entries(groups).filter(([_, v]) => v.length > 0));
     }
     return groups;
  }, [filteredIssues, groupBy, viewState, projects]);

  const handleCreateIssue = async (newIssuesData: any[]) => {
    if (!user) return;
    const errors: any[] = [];
    const existingIdentifiers = new Set(issues.map(i => i.identifier));
    for (const data of newIssuesData) {
      const branchName = data.customFields?.branchName as string | undefined;
      const identifierSource = branchName?.trim() || data.title || '';
      const identifier = buildIdentifier(identifierSource, existingIdentifiers);
      existingIdentifiers.add(identifier);
      try {
        await createIssue({
          identifier,
          title: data.title,
          description: data.description,
          status: data.status,
          priority: data.priority,
          assigneeId: data.assigneeId || null,
          teamId: data.teamId,
          cycleId: viewState.type === 'cycle' ? viewState.cycleId || null : null,
          projectId: data.projectId || (viewState.type === 'project' ? viewState.projectId : null), 
          labels: data.labels || [],
          subtasks: data.subtasks || [],
          customFields: data.customFields || {},
        }, user.id);
      } catch (err: any) {
        console.error('Failed to create issue:', err);
        errors.push(err);
      }
    }
    if (errors.length > 0) {
      const first = errors[0];
      throw new Error(first?.message || JSON.stringify(first));
    }
  };

  const handleUserUpdate = async (updatedUser: User) => { await updateUser(updatedUser); };
  const handleUserInvite = async (userToInvite: User): Promise<InviteResult | null> => { 
    try {
      return await inviteUser(userToInvite.email, (userToInvite.permissionRole as PermissionRole) || PermissionRole.Member); 
    } catch (err: any) {
      alert(err.message);
      return null;
    }
  };
  const handleUserRemove = async (id: string) => { await removeUser(id); };
  const handleUserSettingsSave = async (preferences: { themePreference: 'light' | 'dark' | 'system' | null; layoutPreference: 'board' | 'list' | null; role: string | null; avatarUrl: string | null }) => {
    if (!user) return;
    if (!isSupabaseConfigured) {
      throw new Error('Supabase 未配置，无法保存个人设置。');
    }

    const withTimeout = async <T,>(promise: PromiseLike<T>, label: string, timeoutMs = 8000) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} 超时，请检查网络或 Supabase 配置。`)), timeoutMs);
      });

      try {
        return await Promise.race([Promise.resolve(promise), timeoutPromise]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    const shouldUpdateRole = preferences.role && currentUserRecord && preferences.role !== currentUserRecord.role;
    const shouldUpdateAvatar = preferences.avatarUrl && currentUserRecord && preferences.avatarUrl !== currentUserRecord.avatarUrl;

    if (currentUserRecord && (shouldUpdateRole || shouldUpdateAvatar)) {
      console.info('[UserSettings] saving member profile', {
        userId: currentUserRecord.id,
        shouldUpdateRole,
        shouldUpdateAvatar,
      });
      await withTimeout(
        updateUser({
          ...currentUserRecord,
          role: shouldUpdateRole ? preferences.role as string : currentUserRecord.role,
          avatarUrl: shouldUpdateAvatar ? preferences.avatarUrl as string : currentUserRecord.avatarUrl,
        }),
        '保存成员信息'
      );
      console.info('[UserSettings] member profile saved');
    }

    if (preferences.avatarUrl) {
      console.info('[UserSettings] syncing avatar metadata');
      supabase.auth
        .updateUser({
          data: {
            avatar_url: preferences.avatarUrl,
          },
        })
        .then(() => {
          console.info('[UserSettings] avatar metadata synced');
        })
        .catch((err) => {
          console.warn('同步头像失败，已跳过同步到认证资料。', err);
        });
    }

    const shouldUpdatePreferences =
      preferences.themePreference !== currentUserRecord?.themePreference ||
      preferences.layoutPreference !== currentUserRecord?.layoutPreference;

    if (shouldUpdatePreferences) {
      console.info('[UserSettings] saving preferences');
      withTimeout(
        updateUserPreferences(user.id, {
          themePreference: preferences.themePreference,
          layoutPreference: preferences.layoutPreference,
        }),
        '保存偏好'
      )
        .then(() => {
          console.info('[UserSettings] preferences saved');
        })
        .catch((err) => {
          console.warn('[UserSettings] preferences save skipped', err);
        });
    }

    const fallbackLayout = localStorage.getItem('issueLayout');
    const nextLayout = preferences.layoutPreference
      ?? (fallbackLayout === 'list' || fallbackLayout === 'board' ? fallbackLayout : 'board');
    const nextTheme = preferences.themePreference ?? 'system';

    setTheme(nextTheme);
    setLayout(nextLayout);
  };
  const handleReleaseCycle = async (cycleId: string) => {
    const cycle = cycles.find(c => c.id === cycleId);
    if (cycle) await updateCycle({ ...cycle, isReleased: !cycle.isReleased });
  };
  const handleSaveProject = async (project: Project) => {
    if (projects.some(p => p.id === project.id)) {
      await updateProject(project);
    } else {
      await createProject(project);
    }
  };
  const handleDeleteProject = async (id: string) => {
    await deleteProject(id);
    if (viewState.type === 'project' && viewState.projectId === id) {
      setViewState({ type: 'pipeline', pipelineStage: 'building' });
    }
  };
  const openCreateProjectModal = () => { setEditingProject(null); setIsProjectModalOpen(true); };
  const openEditProjectModal = (project: Project) => { setEditingProject(project); setIsProjectModalOpen(true); };
  const openEditCycleModal = (cycle: Cycle) => { setEditingCycle(cycle); setIsCycleModalOpen(true); };
  const scrollToSection = (group: string) => sectionRefs.current[group]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const selectedIssue = useMemo(() => issues.find(i => i.id === selectedIssueId) || null, [issues, selectedIssueId]);
  const activeGroups = useMemo(() => Object.entries(groupedIssues).filter(([_, list]) => list.length > 0 || (viewState.type === 'team' && viewState.teamId === ENGINEERING_ID)).map(([group]) => group), [groupedIssues, viewState, ENGINEERING_ID]);

  const handleMigrateIdentifiers = async () => {
    if (!confirm('将批量更新所有任务的订单编号，可能影响引用。确认继续？')) return;
    try {
      const result = await migrateIssueIdentifiers();
      alert(`已更新 ${result.updated}/${result.total} 条任务编号。`);
    } catch (err: any) {
      alert('更新失败: ' + (err?.message || JSON.stringify(err)));
    }
  };

  const currentProject = viewState.type === 'project' ? projects.find(p => p.id === viewState.projectId) || null : null;
  const activeCycle = viewState.type === 'cycle' ? cycles.find(c => c.id === viewState.cycleId) || null : null;
  const sortedCycles = useMemo(() => [...cycles].sort((a, b) => b.startDate.getTime() - a.startDate.getTime()), [cycles]);

  const getViewTitle = () => {
    if (viewState.type === 'pipeline') {
        switch(viewState.pipelineStage) {
            case 'triage': return '待规划 (Triage)';
            case 'building': return '构建中 (Building)';
            case 'qa': return '待验收 (Ready for QA)';
            case 'live': return '已发布 (Live)';
        }
    }
    if (viewState.type === 'team') return teams.find(t=>t.id===viewState.teamId)?.name;
    if (viewState.type === 'bug') return 'Bug 列表';
    if (viewState.type === 'my') return '我的工作台';
    if (viewState.type === 'all') return '所有任务';
    if (viewState.type === 'cycles') return '迭代';
    if (viewState.type === 'project') {
         const p = projects.find(p => p.id === viewState.projectId);
         return p ? <div className="flex items-center gap-2"><ProjectIcon icon={p.icon} /><span>{p.name}</span></div> : '项目';
    }
    if (viewState.type === 'cycle') {
        const c = cycles.find(c=>c.id===viewState.cycleId);
        return c ? <span className="font-mono">{c.name}</span> : '迭代';
    }
    return '';
  };

  const isEngKanban = viewState.type === 'team' && viewState.teamId === ENGINEERING_ID && layout === 'board' && groupBy === 'status';

  // 显示加载状态
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg animate-pulse">
            O
          </div>
          <span className="text-muted">加载中...</span>
        </div>
      </div>
    );
  }

  // 未登录显示登录页
  if (!user) {
    return <LoginPage />;
  }

  // 没有组织，显示创建组织页面
  if (!currentOrg) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-accent/30">O</div>
            <span className="ml-3 text-3xl font-bold tracking-tight text-main">Orbit</span>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-8 border border-black/5 dark:border-white/10">
            <h2 className="text-2xl font-bold text-center text-main mb-2">创建你的组织</h2>
            <p className="text-center text-muted mb-8">开始使用 Orbit 管理你的团队任务</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
              const name = (form.elements.namedItem('orgName') as HTMLInputElement).value;
              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              
              submitBtn.disabled = true;
              submitBtn.textContent = '创建中...';
              
              try {
                console.log('Creating organization:', name, slug);
                await createOrganization(name, slug);
                console.log('Organization created successfully');
              } catch (err: any) {
                console.error('Failed to create organization:', err);
                alert('创建失败: ' + (err.message || JSON.stringify(err)));
                submitBtn.disabled = false;
                submitBtn.textContent = '创建组织';
              }
            }} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-main mb-2">组织名称</label>
                <input name="orgName" type="text" required placeholder="例如：我的团队" className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-slate-700/50 text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
              <button type="submit" className="w-full py-3 px-4 rounded-xl bg-main text-surface font-medium hover:opacity-90 active:scale-[0.98] transition-all shadow-lg disabled:opacity-50">创建组织</button>
            </form>
            <div className="mt-6 text-center">
              <button onClick={signOut} className="text-sm text-muted hover:text-main">退出登录</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-background text-main font-sans selection:bg-accent/20 overflow-hidden relative">
      
      {/* Sidebar Container: Narrow Rail + Wide Panel */}
      <div className="fixed left-4 top-4 bottom-4 w-[324px] max-[1800px]:w-[272px] flex gap-2 z-20 hidden md:flex">
        {/* Narrow Rail */}
        <NarrowSidebar
          mode={sidebarMode}
          onModeChange={setSidebarMode}
          projects={projects}
          currentProjectId={viewState.type === 'project' ? viewState.projectId || null : null}
          onProjectSelect={(projectId) => {
            setSidebarMode('project');
            setViewState({ type: 'project', projectId });
          }}
          onCreateProject={openCreateProjectModal}
          orgInitial={currentOrg.name.charAt(0).toUpperCase()}
          totalUnread={chatHook.totalUnread}
        />

        {/* Wide Panel */}
        <aside className="flex-1 glass-panel rounded-3xl shadow-floating flex flex-col p-4 overflow-hidden">
            {/* 组织选择器 */}
            <div className="relative mb-4">
              <button 
                onClick={() => setShowOrgDropdown(!showOrgDropdown)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                    {currentOrg.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="ml-2 font-medium text-sm text-main truncate max-w-[120px]">{currentOrg.name}</span>
                </div>
                <ChevronDown size={16} className={`text-muted transition-transform ${showOrgDropdown ? 'rotate-180' : ''}`} />
              </button>
              
              {showOrgDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden z-50">
                  {organizations.map(org => (
                    <button
                      key={org.id}
                      onClick={() => { setCurrentOrg(org); setShowOrgDropdown(false); }}
                      className={`w-full flex items-center px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${org.id === currentOrg.id ? 'bg-accent/10' : ''}`}
                    >
                      <div className="w-6 h-6 rounded-md bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                        {org.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="ml-2 text-sm text-main">{org.name}</span>
                      {org.id === currentOrg.id && <Check size={14} className="ml-auto text-accent" />}
                    </button>
                  ))}
                  <div className="border-t border-black/5 dark:border-white/5">
                    <button
                      onClick={() => { setShowOrgDropdown(false); setIsOrgModalOpen(true); }}
                      className="w-full flex items-center px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-muted"
                    >
                      <Plus size={16} />
                      <span className="ml-2 text-sm">创建新组织</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Conditional Content based on sidebarMode */}
            {sidebarMode === 'chat' ? (
              /* Chat Mode: Show Channels */
              <ChatChannelsPane
                publicChannels={chatHook.publicChannels}
                directMessages={chatHook.directMessages}
                currentChannelId={chatHook.currentChannelId}
                onSelect={chatHook.setCurrentChannelId}
                unreadByChannel={chatHook.unreadByChannel}
                loading={chatHook.loading}
                users={users}
                currentUserId={user.id}
                onStartDm={(userId) => {
                  setSidebarMode('chat');
                  setViewState({ type: 'chat' });
                  chatHook.startDm(userId);
                }}
                onCreateChannel={(name, slug) =>
                  chatHook.createPublicChannel(name, slug)
                }
              />
            ) : (
              /* Project Mode: Show navigation */
              <>
                <nav className="flex-1 overflow-y-auto pr-1">
                    <div className="text-[11px] font-bold text-muted uppercase tracking-wider px-3 mb-2 mt-2">我的视图</div>
                    <SidebarItem icon={<UserIcon size={18} />} label="我的工作台" isActive={viewState.type === 'my'} onClick={() => setViewState({ type: 'my' })} count={issues.filter(i => i.assigneeId === user.id).length} />
                    <SidebarItem icon={<AlertCircle size={18} className="text-rose-500" />} label="Bug" isActive={viewState.type === 'bug'} onClick={() => setViewState({ type: 'bug' })} count={issues.filter(isBugIssue).length} />
                    {engTeam && <SidebarItem icon={<Zap size={18} className="text-yellow-500" />} label="研发看板" isActive={viewState.type === 'team' && viewState.teamId === ENGINEERING_ID} onClick={() => setViewState({ type: 'team', teamId: ENGINEERING_ID })} count={issues.filter(i => i.teamId === ENGINEERING_ID).length} onDragOver={allowDrop} onDrop={handleDropToTeam(ENGINEERING_ID)} onDragEnter={() => setDragHoverTarget('team_eng')} onDragLeave={() => setDragHoverTarget(null)} isDragTarget={dragHoverTarget === 'team_eng'} />}

                    <div className="text-[11px] font-bold text-muted uppercase tracking-wider px-3 mb-2 mt-5">交付流水线</div>
                    <SidebarItem icon={<Inbox size={18} />} label="待规划" subLabel="Triage" isActive={viewState.type === 'pipeline' && viewState.pipelineStage === 'triage'} onClick={() => setViewState({ type: 'pipeline', pipelineStage: 'triage' })} count={issues.filter(i => i.teamId === REQUIREMENT_POOL_ID || i.status === Status.Backlog).length} onDragOver={allowDrop} onDrop={handleDropToPipeline('triage')} onDragEnter={() => setDragHoverTarget('pipeline_triage')} onDragLeave={() => setDragHoverTarget(null)} isDragTarget={dragHoverTarget === 'pipeline_triage'} />
                    <SidebarItem icon={<Zap size={18} />} label="构建中" subLabel="Building" isActive={viewState.type === 'pipeline' && viewState.pipelineStage === 'building'} onClick={() => setViewState({ type: 'pipeline', pipelineStage: 'building' })} count={issues.filter(i => i.teamId === ENGINEERING_ID && (i.status === Status.Todo || i.status === Status.InProgress)).length} onDragOver={allowDrop} onDrop={handleDropToPipeline('building')} onDragEnter={() => setDragHoverTarget('pipeline_building')} onDragLeave={() => setDragHoverTarget(null)} isDragTarget={dragHoverTarget === 'pipeline_building'} />
                    <SidebarItem icon={<GitMerge size={18} />} label="待验收" subLabel="Ready for QA" isActive={viewState.type === 'pipeline' && viewState.pipelineStage === 'qa'} onClick={() => setViewState({ type: 'pipeline', pipelineStage: 'qa' })} count={issues.filter(i => i.status === Status.CodeMerged || i.status === Status.InQA).length} onDragOver={allowDrop} onDrop={handleDropToPipeline('qa')} onDragEnter={() => setDragHoverTarget('pipeline_qa')} onDragLeave={() => setDragHoverTarget(null)} isDragTarget={dragHoverTarget === 'pipeline_qa'} />
                    <SidebarItem icon={<Rocket size={18} />} label="已发布" subLabel="Live" isActive={viewState.type === 'pipeline' && viewState.pipelineStage === 'live'} onClick={() => setViewState({ type: 'pipeline', pipelineStage: 'live' })} count={issues.filter(i => i.status === Status.Done || i.status === Status.Closed).length} onDragOver={allowDrop} onDrop={handleDropToPipeline('live')} onDragEnter={() => setDragHoverTarget('pipeline_live')} onDragLeave={() => setDragHoverTarget(null)} isDragTarget={dragHoverTarget === 'pipeline_live'} />

                    <div className="text-[11px] font-bold text-muted uppercase tracking-wider px-3 mb-2 mt-5">迭代</div>
                    <SidebarItem icon={<Repeat size={18} />} label="迭代总览" isActive={viewState.type === 'cycles'} onClick={() => setViewState({ type: 'cycles' })} />
                    {sortedCycles.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-muted">暂无迭代</div>
                    ) : (
                        sortedCycles.map(c => (
                            <SidebarItem
                              key={c.id}
                              icon={<Repeat size={18} />}
                              label={c.name}
                              subLabel={`${formatBeijingDate(c.startDate, { month: '2-digit', day: '2-digit' }, 'zh-CN')} - ${formatBeijingDate(c.endDate, { month: '2-digit', day: '2-digit' }, 'zh-CN')}`}
                              isActive={viewState.type === 'cycle' && viewState.cycleId === c.id}
                              onClick={() => setViewState({ type: 'cycle', cycleId: c.id })}
                              count={issues.filter(i => i.cycleId === c.id).length}
                              isReleased={c.isReleased}
                            />
                        ))
                    )}

                    <div className="text-[11px] font-bold text-muted uppercase tracking-wider px-3 mb-2 mt-5">管理</div>
                    <SidebarItem icon={<Users size={18} />} label="团队成员" isActive={viewState.type === 'members'} onClick={() => setViewState({ type: 'members' })} />
                    {isAdmin && (
                      <SidebarItem icon={<ArrowDownWideNarrow size={18} />} label="更新订单编号" isActive={false} onClick={handleMigrateIdentifiers} />
                    )}
                </nav>
              </>
            )}

            {/* Footer - always visible */}
            <div className="pt-4 mt-2 border-t border-black/5 dark:border-white/5 flex items-center justify-between px-2">
                <button onClick={() => setTheme(prev => prev === 'light' ? 'dark' : prev === 'dark' ? 'system' : 'light')} className="p-2 text-muted hover:text-main rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors">{theme === 'light' ? <Sun size={18} /> : theme === 'dark' ? <Moon size={18} /> : <Monitor size={18} />}</button>
                <div className="flex items-center gap-2">
                  <button onClick={signOut} className="p-2 text-muted hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="退出登录"><LogOut size={18} /></button>
                  <button
                    onClick={() => setIsUserSettingsOpen(true)}
                    className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent hover:bg-accent/30 transition-colors"
                    title="个人设置"
                  >
                    {user.email?.charAt(0).toUpperCase() || '用'}
                  </button>
                </div>
            </div>
        </aside>
      </div>

      {/* Main Canvas */}
      <main className="flex-1 flex flex-col h-full md:ml-[354px] max-[1800px]:md:ml-[302px] mr-4 my-4 rounded-3xl bg-transparent overflow-hidden relative">
          {viewState.type === 'members' ? (
              <TeamMembersView users={users} currentUser={currentUserRecord} onAddUser={handleUserInvite} onUpdateUser={handleUserUpdate} onDeleteUser={handleUserRemove} />
          ) : viewState.type === 'chat' || sidebarMode === 'chat' ? (
              <ChatMessagesPane
                channel={chatHook.currentChannel}
                messages={chatHook.messages}
                users={users}
                currentUserId={user.id}
                loading={chatHook.loadingMessages}
                hasMore={chatHook.hasMoreMessages}
                onLoadMore={chatHook.loadMoreMessages}
                onSend={chatHook.sendMessage}
                onTyping={chatHook.sendTyping}
                onStartDm={(userId) => {
                  setSidebarMode('chat');
                  setViewState({ type: 'chat' });
                  chatHook.startDm(userId);
                }}
                typingUserIds={chatHook.typingUserIds}
                onlineUserIds={chatHook.onlineUserIds}
              />
          ) : (

            <div className="flex-1 flex overflow-hidden">
              {viewState.type === 'cycles' ? (
                <CyclesOverview
                  cycles={sortedCycles}
                  issues={issues}
                  onCreate={() => { setEditingCycle(null); setIsCycleModalOpen(true); }}
                  onEdit={(cycle) => { setEditingCycle(cycle); setIsCycleModalOpen(true); }}
                  onSelect={(cycleId) => setViewState({ type: 'cycle', cycleId })}
                />
              ) : (
                <>
                  <div className="flex-1 flex flex-col min-w-0">
                  {/* Top Bar */}
                  <header className="flex flex-col z-10 shrink-0">
                      <div className="h-16 flex items-center justify-between px-2">
                          <div className="flex items-center gap-4">
                              <h1 className="text-2xl font-bold tracking-tight text-main whitespace-nowrap flex items-center gap-2">
                                 {getViewTitle()}
                              </h1>
                             
                             {viewState.type === 'project' && currentProject && (
                                 <button onClick={() => { openEditProjectModal(currentProject); }} className="p-1.5 text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors" title="项目设置"><Settings size={18} /></button>
                             )}
                             
                             {viewState.type === 'cycle' && viewState.cycleId && (
                                 <div className="hidden md:flex items-center gap-2">
                                     {activeCycle && (
                                       <button onClick={() => openEditCycleModal(activeCycle)} className="p-1.5 text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors" title="编辑迭代">
                                         <Edit3 size={16} />
                                       </button>
                                     )}
                                     {cycles.find(c => c.id === viewState.cycleId)?.isReleased ? (
                                         <button onClick={() => handleReleaseCycle(viewState.cycleId!)} className="text-xs font-medium text-green-600 bg-green-500/10 hover:bg-green-500/20 px-3 py-1.5 rounded-lg transition-colors border border-green-500/20">已发布 (v1.0)</button>
                                     ) : (
                                         <button onClick={() => handleReleaseCycle(viewState.cycleId!)} className="text-xs font-medium text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 border border-transparent hover:border-black/5"><Rocket size={12} />发布此版本</button>
                                     )}
                                 </div>
                             )}
                             
                             {/* Nav & View Controls */}
                             {!isEngKanban && groupBy !== 'none' && activeGroups.length > 0 && (
                                 <>
                                    <div className="h-6 w-[1px] bg-black/10 dark:bg-white/10 mx-2 hidden lg:block"></div>
                                    <div className="hidden lg:flex items-center gap-1 p-1 rounded-xl bg-surface-glass border border-black/5 dark:border-white/10 overflow-x-auto no-scrollbar max-w-[400px]">
                                        {activeGroups.map(group => (
                                            <button key={group} onClick={() => scrollToSection(group)} className="px-3 py-1 text-xs font-medium text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-all whitespace-nowrap">{group}</button>
                                        ))}
                                    </div>
                                 </>
                             )}

                             {viewState.type === 'pipeline' && (
                               <div className="hidden md:flex items-center gap-1 p-1 rounded-xl bg-surface-glass border border-black/5 dark:border-white/10">
                                 {[
                                   { key: 'all', label: '全部' },
                                   { key: 'feature', label: 'Feature' },
                                   { key: 'bug', label: 'Bug' },
                                 ].map(item => (
                                   <button
                                     key={item.key}
                                     onClick={() => setPipelineFilter(item.key as 'all' | 'feature' | 'bug')}
                                     className={`px-3 py-1 text-xs font-medium rounded-lg transition-all ${
                                       pipelineFilter === item.key ? 'bg-accent/10 text-accent' : 'text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10'
                                     }`}
                                   >
                                     {item.label}
                                   </button>
                                 ))}
                               </div>
                             )}

                             <div className="flex items-center gap-1 bg-surface-glass border border-black/5 dark:border-white/10 rounded-xl p-1 shadow-sm ml-auto sm:ml-4">
                                <button onClick={() => setLayout('board')} className={`p-1.5 rounded-lg transition-all ${layout === 'board' ? 'bg-accent/10 text-accent' : 'text-muted hover:text-main'}`} title="看板视图"><LayoutGrid size={16} /></button>
                                <button onClick={() => setLayout('list')} className={`p-1.5 rounded-lg transition-all ${layout === 'list' ? 'bg-accent/10 text-accent' : 'text-muted hover:text-main'}`} title="列表视图"><List size={16} /></button>
                                <div className="w-[1px] h-4 bg-black/10 dark:bg-white/10 mx-1"></div>
                                <button onClick={() => setSortBy(prev => prev === 'priority' ? 'created' : 'priority')} className={`p-1.5 rounded-lg transition-all ${sortBy !== 'created' ? 'bg-accent/10 text-accent' : 'text-muted hover:text-main'}`} title="按优先级排序"><ArrowDownWideNarrow size={16} /></button>
                                <button onClick={() => setGroupBy(prev => { if (prev === 'status') return 'priority'; if (prev === 'priority') return 'project'; if (prev === 'project') return 'none'; return 'status'; })} className={`p-1.5 rounded-lg transition-all ${groupBy !== 'none' ? 'bg-accent/10 text-accent' : 'text-muted hover:text-main'}`} title="切换分组"><LayoutList size={16} /></button>
                             </div>
                         </div>

                         <div className="flex items-center gap-3 ml-4">
                             <div className="relative group hidden sm:block">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted w-4 h-4 group-focus-within:text-accent transition-colors" />
                                <input type="text" placeholder="搜索..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="bg-surface-glass border border-transparent hover:border-black/10 focus:border-accent/50 rounded-xl py-2 pl-9 pr-4 text-sm text-main focus:outline-none focus:ring-4 focus:ring-accent/10 w-32 md:w-48 transition-all shadow-sm" />
                             </div>
                             <button onClick={() => setIsIssueModalOpen(true)} className="flex items-center gap-2 bg-main text-surface hover:scale-[1.02] active:scale-95 transition-all px-4 py-2 rounded-xl shadow-lg font-medium text-sm whitespace-nowrap"><Plus size={16} /><span className="hidden sm:inline">提需求</span></button>
                         </div>
                      </div>

                      {isWorkspace && (
                        <div className="px-2 mb-6 space-y-4 animate-fade-in">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="text-xs font-semibold text-muted uppercase tracking-wider">行动摘要</div>
                            <div className="text-xs text-main bg-black/5 dark:bg-white/5 px-3 py-1 rounded-full">{workspaceSummary}</div>
                          </div>
                          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <WorkspaceCard
                              title="任务分区"
                              subtitle="快速聚焦今日优先事项"
                              action={workspaceFilter !== 'all' ? (
                                <button onClick={() => setWorkspaceFilter('all')} className="text-xs text-muted hover:text-main">重置</button>
                              ) : null}
                            >
                              <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-1.5" aria-label="任务状态分布">
                                  {renderWorkspaceDots()}
                                </div>
                              </div>
                            </WorkspaceCard>

                            <WorkspaceCard title="项目概览" subtitle="我参与的项目与负载">
                              {workspaceProjects.length === 0 ? (
                                <div className="text-xs text-muted">暂无关联项目</div>
                              ) : (
                                <div className="grid grid-cols-2 gap-2">
                                  {workspaceProjects.slice(0, 4).map(({ project, blockedCount }) => (
                                    <button
                                      key={project.id}
                                      onClick={() => setViewState({ type: 'project', projectId: project.id })}
                                      className="w-full flex items-center justify-between rounded-lg border border-black/5 dark:border-white/10 px-2.5 py-2 text-left hover:border-accent/30"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-base">{project.icon}</span>
                                        <span className="text-xs font-medium text-main truncate">{project.name}</span>
                                      </div>
                                      {blockedCount > 0 && <span className="text-[10px] text-red-500">阻塞 {blockedCount}</span>}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </WorkspaceCard>

                            <WorkspaceCard title="最近更新" subtitle="近 7 天与你相关的变化">
                              {recentUpdates.length === 0 ? (
                                <div className="text-xs text-muted">暂无更新</div>
                              ) : (
                                <div className="space-y-1">
                                  {recentUpdates.map(({ issue, activity }, index) => {
                                    const timestamp = new Date(activity.timestamp);
                                    return (
                                      <button
                                        key={`${issue.id}-${activity.id}`}
                                        onClick={() => setSelectedIssueId(issue.id)}
                                        className={`w-full flex items-start justify-between rounded-lg border border-black/5 dark:border-white/10 px-2.5 py-1.5 text-left hover:border-accent/30 ${index >= 2 ? 'max-[1800px]:hidden' : ''}`}
                                      >
                                        <div className="min-w-0">
                                          <div className="text-[11px] text-main/80 leading-4">{renderWorkspaceActivity(activity)}</div>
                                          <div className="text-[9px] text-muted truncate mt-0.5">{issue.title}</div>
                                        </div>
                                        <div className="text-[9px] text-muted text-right flex flex-col items-end gap-0.5 leading-4">
                                          <div>{formatBeijingDate(timestamp, { month: '2-digit', day: '2-digit' }, 'zh-CN')}</div>
                                          <div>{formatBeijingTime(timestamp, { hour: '2-digit', minute: '2-digit' }, 'zh-CN')}</div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </WorkspaceCard>
                          </div>

                          <div className="xl:hidden">
                            {workspaceAiUser && (
                              <WorkspaceAiPanel
                                variant="inline"
                                currentUser={workspaceAiUser}
                                myIssues={myIssues}
                                availableIssues={availableWorkspaceIssues}
                                projects={projects}
                                onSelectIssue={setSelectedIssueId}
                                onClaimIssue={async (issue) => {
                                  if (!workspaceAiUser) return;
                                  await updateIssue({ ...issue, assigneeId: workspaceAiUser.id });
                                }}
                              />
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* SPECIAL DASHBOARDS */}
                      {viewState.type === 'pipeline' && viewState.pipelineStage === 'triage' && REQUIREMENT_POOL_ID && (
                          <BusinessDashboardHeader issues={issues} inboxTeamId={REQUIREMENT_POOL_ID} engTeamId={ENGINEERING_ID} />
                      )}

                     {viewState.type === 'pipeline' && viewState.pipelineStage === 'qa' && (
                         <QADashboardHeader issues={issues} />
                     )}
                     {viewState.type === 'bug' && (
                         <BugDashboardHeader issues={issues} />
                     )}
                     {viewState.type === 'team' && viewState.teamId === ENGINEERING_ID && ENGINEERING_ID && (
                         <EngineeringDashboardHeader issues={issues} cycles={cycles} engTeamId={ENGINEERING_ID} />
                     )}
                     {viewState.type === 'cycle' && activeCycle && (
                         <CycleSummaryPanel cycle={activeCycle} issues={issues} />
                     )}
                 </header>

                 {/* Content Area */}
                  <div ref={listRef} className={`flex-1 overflow-y-auto pr-2 pb-4 mask-image-b scroll-smooth ${isEngKanban ? 'overflow-x-auto flex gap-6 px-4' : ''}`}>
                      {filteredIssues.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-muted animate-fade-in w-full text-center">
                             <Inbox size={48} className="opacity-20 mb-4" />
                             <p>{isWorkspace ? '今天暂无需要处理的任务' : '没有找到任务'}</p>
                             {isWorkspace && (
                               <button onClick={() => setIsIssueModalOpen(true)} className="mt-4 text-xs font-medium text-main bg-black/5 dark:bg-white/10 px-3 py-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/20 transition">
                                 创建任务或提问 AI
                               </button>
                             )}
                          </div>
                      ) : (

                         <div className={`animate-fade-in ${isEngKanban ? 'flex gap-4 h-full' : 'space-y-8'}`}>
                            {Object.entries(groupedIssues).map(([group, list]) => {
                                // For Kanban: Show empty columns. For others: Hide empty sections.
                                if (!isEngKanban && list.length === 0) return null;

                                const isStatusColumn = isEngKanban && Object.values(Status).includes(group as Status);
                                const isDropTarget = isStatusColumn && dragHoverTarget === `status_${group}`;
                                
                                return (
                                    <div 
                                        key={group} 
                                        ref={el => { sectionRefs.current[group] = el; }}
                                        onDragOver={isStatusColumn ? allowDrop : undefined}
                                        onDrop={isStatusColumn ? handleDropToStatus(group as Status) : undefined}
                                        onDragEnter={isStatusColumn ? () => setDragHoverTarget(`status_${group}`) : undefined}
                                        onDragLeave={isStatusColumn ? () => setDragHoverTarget(null) : undefined}
                                        className={`relative scroll-mt-4 ${isEngKanban ? 'w-[320px] shrink-0 flex flex-col h-full pb-4 rounded-2xl transition-colors' : ''} ${isDropTarget ? 'ring-2 ring-accent/40 bg-accent/5' : ''}`}
                                    >
                                        <div className={`sticky top-0 z-10 py-3 bg-background/80 backdrop-blur-md mb-2 flex items-center justify-between ${isEngKanban ? 'rounded-t-xl bg-surface/50 px-2' : ''}`}>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xs font-bold text-muted uppercase tracking-wider">{group}</h2>
                                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 text-muted">{list.length}</span>
                                            </div>
                                            {isEngKanban && <button className="text-muted hover:text-main"><Plus size={14} /></button>}
                                        </div>
                                        
                                        <div className={
                                            layout === 'list' ? "flex flex-col gap-1" :
                                            isEngKanban ? "flex flex-col gap-2 overflow-y-auto pb-8 pr-1 no-scrollbar h-full" : 
                                            "grid grid-cols-1 xl:grid-cols-2 gap-4"
                                        }>
                                            {list.map(issue => (
                                                layout === 'list' ? (
                                                    <IssueRow
                                                      key={issue.id}
                                                      issue={issue}
                                                      users={users}
                                                      cycles={cycles}
                                                      projects={projects}
                                                      selected={selectedIssueId === issue.id}
                                                      onClick={() => setSelectedIssueId(issue.id)}
                                                      onDragStart={handleDragStart(issue.id)}
                                                      onDragEnd={handleDragEnd}
                                                      onDragOver={allowDrop}
                                                      onDrop={handleDropReorder(list, issue.id)}
                                                      onDragEnter={() => setDragHoverRowId(issue.id)}
                                                      onDragLeave={() => setDragHoverRowId(null)}
                                                      isDragTarget={dragHoverRowId === issue.id}
                                                    />
                                                ) : (
                                                    <IssueCard
                                                      key={issue.id}
                                                      issue={issue}
                                                      users={users}
                                                      cycles={cycles}
                                                      projects={projects}
                                                      selected={selectedIssueId === issue.id}
                                                      onClick={() => setSelectedIssueId(issue.id)}
                                                      onDragStart={handleDragStart(issue.id)}
                                                      onDragEnd={handleDragEnd}
                                                    />
                                                )
                                            ))}
                                            {isEngKanban && list.length === 0 && (
                                                <div className="h-24 rounded-xl border-2 border-dashed border-black/5 dark:border-white/5 flex items-center justify-center text-muted text-xs">
                                                    空空如也
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                         </div>
                     )}
                  </div>
                  </div>
                  {viewState.type === 'project' && currentProject && (
                    <ProjectAiSidebar
                      project={currentProject}
                      issues={issues}
                      users={users}
                    />
                  )}
                  {viewState.type === 'my' && workspaceAiUser && (
                    <WorkspaceAiPanel
                      variant="sidebar"
                      currentUser={workspaceAiUser}
                      myIssues={myIssues}
                      availableIssues={availableWorkspaceIssues}
                      projects={projects}
                      onSelectIssue={setSelectedIssueId}
                      onClaimIssue={async (issue) => {
                        if (!workspaceAiUser) return;
                        await updateIssue({ ...issue, assigneeId: workspaceAiUser.id });
                      }}
                    />
                  )}
                </>
              )}
            </div>
         )}
         
         {/* Detail Pane */}
          {selectedIssue && (
            <div className="absolute inset-0 z-30 flex justify-end">
              <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" onClick={() => setSelectedIssueId(null)}></div>
              <div className="w-full md:w-[50vw] md:max-w-[50vw] h-full shadow-2xl animate-scale-in relative">
                <IssueDetailPane
                  issue={selectedIssue}
                  onClose={() => setSelectedIssueId(null)}
                  onUpdate={async (u) => updateIssue(u)}
                  onAddComment={async (issueId, activity) => {
                    const result = await updateIssueComment(issueId, activity);
                    return result;
                  }}
                  onDeleteComment={async (issueId, activityId, userId) => {
                    await deleteIssueComment(issueId, activityId, userId);
                  }}
                  onSelectIssue={(issueId) => setSelectedIssueId(issueId)}
                  onDelete={async (id) => { await deleteIssue(id); setSelectedIssueId(null); }}
                  users={users}
                  teams={teams}
                  cycles={cycles}
                  projects={projects}
                  issues={issues}
                  currentUser={currentUserRecord}
                />
              </div>
            </div>
          )}

      </main>

      <UserSettingsModal
        isOpen={isUserSettingsOpen}
        email={user.email}
        role={currentUserRecord?.role}
        avatarUrl={currentUserRecord?.avatarUrl}
        currentTheme={theme}
        currentLayout={layout}
        themePreference={currentUserRecord?.themePreference}
        layoutPreference={currentUserRecord?.layoutPreference}
        onClose={() => setIsUserSettingsOpen(false)}
        onSavePreferences={handleUserSettingsSave}
      />

      <CreateIssueModal isOpen={isIssueModalOpen} onClose={() => setIsIssueModalOpen(false)} onCreate={handleCreateIssue} teams={teams} users={users} currentTeamId={viewState.type === 'team' ? viewState.teamId : undefined} projects={projects} currentProjectId={viewState.type === 'project' ? viewState.projectId : undefined} />
      <CreateProjectModal isOpen={isProjectModalOpen} onClose={() => setIsProjectModalOpen(false)} onSave={handleSaveProject} onDelete={handleDeleteProject} existingProject={editingProject} />
      <CreateCycleModal
        isOpen={isCycleModalOpen}
        onClose={() => { setIsCycleModalOpen(false); setEditingCycle(null); }}
        existingCycle={editingCycle}
        onSave={async (cycle) => {
          if (editingCycle) {
            await updateCycle({ ...cycle, id: editingCycle.id });
          } else {
            const { id, ...payload } = cycle;
            await createCycle(payload);
          }
        }}
      />
      
      {/* 创建组织模态框 */}
      {isOrgModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface border border-black/10 dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-main mb-4">创建新组织</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const form = e.target as HTMLFormElement;
              const name = (form.elements.namedItem('newOrgName') as HTMLInputElement).value;
              const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
              try {
                await createOrganization(name, slug);
                setIsOrgModalOpen(false);
              } catch (err: any) {
                alert(err.message);
              }
            }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-main mb-2">组织名称</label>
                <input name="newOrgName" type="text" required placeholder="例如：新团队" className="w-full px-4 py-2.5 rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setIsOrgModalOpen(false)} className="flex-1 py-2.5 px-4 rounded-xl border border-black/10 dark:border-white/10 text-main hover:bg-black/5 dark:hover:bg-white/5 transition-colors">取消</button>
                <button type="submit" className="flex-1 py-2.5 px-4 rounded-xl bg-main text-surface font-medium hover:opacity-90 transition-all">创建</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
