
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, Trash2, Sparkles, CheckCircle2, Circle, Plus, User as UserIcon, CalendarRange,
  Terminal, GitBranch, Copy, Check, Shield, ThumbsUp, ThumbsDown, Bug, Play, ArrowRight, Inbox, Layers,
  UserPlus, History, ChevronDown, ChevronUp, Rocket, Briefcase, Zap, XCircle, AlertCircle, Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Issue, Priority, Status, Subtask, User, Team, Cycle, UserRole, Activity, Project } from '../types';
import { PriorityIcon, StatusIcon, TeamIcon } from './Icons';
import { enrichTaskDetails } from '../services/geminiService';
import { resolveAvatarUrl } from '../services/avatar';
import { canExecuteQaAction, resolveActivityUserId } from '../services/issuePermissions';
import { canCompleteBug, incrementReopenCount, withCloseReason } from '../services/bugWorkflow';
import { formatBeijingDateTime, formatBeijingTime, getBeijingNow } from '../constants';

interface IssueDetailPaneProps {
  issue: Issue | null;
  onClose: () => void;
  onUpdate: (issue: Issue) => Issue | Promise<Issue> | void | Promise<void>;
  onAddComment?: (issueId: string, activity: Activity) => Issue | Promise<Issue> | void | Promise<void>;
  onDeleteComment?: (issueId: string, activityId: string, userId: string) => void | Promise<void>;
  onSelectIssue?: (issueId: string) => void;
  onDelete: (id: string) => void | Promise<void>;
  users: User[];
  teams: Team[];
  cycles: Cycle[];
  projects?: Project[];
  issues?: Issue[];
  currentUser?: User | null;
}

// Custom Markdown Components for Linear-like Styling
const markdownComponents = {
  h1: (props: any) => <h1 className="text-2xl font-bold mt-6 mb-3 text-main tracking-tight" {...props} />,
  h2: (props: any) => <h2 className="text-xl font-bold mt-5 mb-2.5 text-main tracking-tight" {...props} />,
  h3: (props: any) => <h3 className="text-lg font-semibold mt-4 mb-2 text-main" {...props} />,
  h4: (props: any) => <h4 className="text-base font-semibold mt-3 mb-2 text-main" {...props} />,
  h5: (props: any) => <h5 className="text-sm font-bold mt-3 mb-1 text-main uppercase tracking-wide" {...props} />,
  h6: (props: any) => <h6 className="text-xs font-bold mt-3 mb-1 text-muted uppercase tracking-wide" {...props} />,
  p: (props: any) => <p className="mb-3 leading-7 text-main/90" {...props} />,
  ul: (props: any) => <ul className="list-disc list-outside ml-5 mb-4 space-y-1 text-main/90" {...props} />,
  ol: (props: any) => <ol className="list-decimal list-outside ml-5 mb-4 space-y-1 text-main/90" {...props} />,
  li: (props: any) => <li className="pl-1 leading-7" {...props} />,
  strong: (props: any) => <strong className="font-semibold text-main" {...props} />,
  b: (props: any) => <strong className="font-semibold text-main" {...props} />,
  em: (props: any) => <em className="italic text-main/80" {...props} />,
  i: (props: any) => <em className="italic text-main/80" {...props} />,
  code: ({ node, inline, className, children, ...props }: any) => {
      return inline
      ? <code className="bg-[#1E1E1E] text-[#D4D4D4] px-1.5 py-0.5 rounded text-[12px] font-mono border border-[#2D2D2D]" {...props}>{children}</code>
      : <code className="text-xs font-mono text-[#D4D4D4]" {...props}>{children}</code>
  },
  pre: (props: any) => (
      <pre className="rounded-xl bg-[#1E1E1E] overflow-x-auto mb-4 border border-[#2D2D2D] shadow-[0_16px_40px_-24px_rgba(0,0,0,0.7)] p-4" {...props} />
  ),
  blockquote: (props: any) => <blockquote className="border-l-2 border-accent/50 pl-4 py-1 my-4 text-muted italic" {...props} />,
  a: (props: any) => <a className="text-accent hover:underline cursor-pointer font-medium" {...props} />,
  hr: (props: any) => <hr className="my-6 border-black/5 dark:border-white/10" {...props} />,
  img: (props: any) => <img className="rounded-lg shadow-sm max-w-full my-4 border border-black/5 dark:border-white/10" {...props} />,
};

const IssueDetailPane: React.FC<IssueDetailPaneProps> = ({ 
  issue, onClose, onUpdate, onAddComment, onDeleteComment, onSelectIssue, onDelete, users, teams, cycles, projects = [], issues = [], currentUser
}) => {
  const [localIssue, setLocalIssue] = useState<Issue | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskTitle, setEditingSubtaskTitle] = useState('');
  const [commentDraft, setCommentDraft] = useState('');
  const [mentionState, setMentionState] = useState<{ start: number; end: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  
  // Description Edit State
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [draftDescription, setDraftDescription] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Dev Kit States
  const [copiedBranch, setCopiedBranch] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedIssueLink, setCopiedIssueLink] = useState(false);
  const [newAssetTitle, setNewAssetTitle] = useState('');
  const [newAssetUrl, setNewAssetUrl] = useState('');
  const [newAssetType, setNewAssetType] = useState<'figma' | 'image' | 'prototype' | 'link'>('figma');
  const [embedLoading, setEmbedLoading] = useState<Record<string, boolean>>({});
  const [embedViewModes, setEmbedViewModes] = useState<Record<string, 'mobile' | 'desktop'>>({});
  const [isSavingAssets, setIsSavingAssets] = useState(false);
  const [assetSaveError, setAssetSaveError] = useState<string | null>(null);
  const lastSavedAssetsRef = useRef<string>('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setLocalIssue(issue); }, [issue]);
  useEffect(() => {
    if (!isEditingDesc) {
      setDraftDescription(localIssue?.description || '');
    }
  }, [localIssue?.description, isEditingDesc]);
  
  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditingDesc && textareaRef.current) {
        textareaRef.current.focus();
        // Move cursor to end
        textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
    }
  }, [isEditingDesc]);

  const designAssets = Array.isArray(localIssue?.customFields?.designAssets)
    ? (localIssue?.customFields?.designAssets as Array<{ id?: string; type?: string; title?: string; url?: string }>)
    : [];

  const mentionCandidates = useMemo(() => {
    const lowerQuery = mentionState?.query.toLowerCase() || '';
    const results = users.filter(user => {
      const name = (user.name || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      return name.includes(lowerQuery) || email.includes(lowerQuery);
    });
    return results.slice(0, 6);
  }, [mentionState?.query, users]);

  const applyMention = (user: User) => {
    if (!commentInputRef.current || !mentionState) return;
    const input = commentInputRef.current;
    const value = commentDraft;
    const before = value.slice(0, mentionState.start);
    const after = value.slice(mentionState.end);
    const mentionToken = `@${user.name || user.email}`;
    const nextValue = `${before}${mentionToken} ${after}`;
    setCommentDraft(nextValue);
    setMentionState(null);
    requestAnimationFrame(() => {
      const caret = before.length + mentionToken.length + 1;
      input.focus();
      input.setSelectionRange(caret, caret);
    });
  };

  const parseMentionState = (value: string, caret: number) => {
    const lastAt = value.lastIndexOf('@', caret - 1);
    if (lastAt === -1) return null;
    const nextSpace = value.indexOf(' ', lastAt);
    if (nextSpace !== -1 && nextSpace < caret) return null;
    const query = value.slice(lastAt + 1, caret);
    if (query.includes('\n')) return null;
    return { start: lastAt, end: caret, query };
  };

  const handleCommentInput = (value: string) => {
    setCommentDraft(value);
    if (!commentInputRef.current) return;
    const caret = commentInputRef.current.selectionStart || value.length;
    const nextMention = parseMentionState(value, caret);
    setMentionState(nextMention);
    setMentionIndex(0);
  };

  const extractMentions = (value: string) => {
    const tokens = value.match(/@[^\s@]+/g) || [];
    const normalized = tokens.map(token => token.slice(1).toLowerCase());
    const ids = users
      .filter(user => normalized.includes((user.name || '').toLowerCase()) || normalized.includes((user.email || '').toLowerCase()))
      .map(user => user.id);
    return Array.from(new Set(ids));
  };

  const sendComment = async () => {
    if (!localIssue || !currentUser) return;
    const text = commentDraft.trim();
    if (!text) return;
    const mentions = extractMentions(text);
    const newActivity: Activity = {
      id: Math.random().toString(),
      type: 'comment',
      userId: currentUser.id,
      field: mentions.length ? 'mentions' : undefined,
      newValue: text,
      oldValue: mentions.length ? mentions.join(',') : undefined,
      timestamp: getBeijingNow(),
    };
    const updatedIssue = {
      ...localIssue,
      activities: [newActivity, ...(localIssue.activities || [])],
      updatedAt: getBeijingNow(),
    };
    setCommentDraft('');
    setMentionState(null);
    setLocalIssue(updatedIssue);
    try {
      const result = onAddComment
        ? await onAddComment(localIssue.id, newActivity)
        : await onUpdate(updatedIssue);
      if (result && typeof result === 'object') {
        setLocalIssue(result as Issue);
      } else if (onAddComment) {
        setLocalIssue(prev => prev ? { ...prev, activities: [newActivity, ...(prev.activities || [])] } : prev);
      }
    } catch (err) {
      setLocalIssue(localIssue);
      alert('评论发送失败，请重试。');
    }
  };

  const handleCommentKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionState && mentionCandidates.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setMentionIndex(prev => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setMentionIndex(prev => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        applyMention(mentionCandidates[mentionIndex]);
        return;
      }
      if (event.key === 'Escape') {
        setMentionState(null);
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendComment();
    }
  };

  const renderCommentBody = (content: string) => {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const mentionPattern = /@[^\s@]+/g;
    const parts = content.split(urlRegex);

    return (
      <span>
        {parts.map((part, partIndex) => {
          if (part.match(urlRegex)) {
            try {
              const url = new URL(part);
              const issueId = url.searchParams.get('issue');
              if (issueId) {
                const linkedIssue = (issues || []).find(item => item.id === issueId);
                if (linkedIssue) {
                  return (
                    <button
                      key={`issue-${partIndex}`}
                      type="button"
                      className="inline-flex items-center gap-2 px-2 py-1 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 mr-1"
                      onClick={() => onSelectIssue?.(issueId)}
                    >
                      <span className="font-semibold">{linkedIssue.identifier}</span>
                      <span className="text-xs text-main/80 truncate max-w-[200px]">{linkedIssue.title}</span>
                    </button>
                  );
                }
              }
            } catch (err) {
              return (
                <a key={`url-${partIndex}`} href={part} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                  {part}
                </a>
              );
            }
            return (
              <a key={`url-${partIndex}`} href={part} className="text-accent hover:underline" target="_blank" rel="noreferrer">
                {part}
              </a>
            );
          }

          const subParts = part.split(mentionPattern);
          const mentions = part.match(mentionPattern) || [];

          return (
            <React.Fragment key={`text-${partIndex}`}>
              {subParts.map((chunk, index) => {
                const mention = mentions[index];
                const mentionName = mention?.slice(1) || '';
                const mentionedUser = mention
                  ? users.find(user => user.name === mentionName || user.email === mentionName)
                  : null;
                return (
                  <React.Fragment key={`${chunk}-${index}`}>
                    {chunk}
                    {mention ? (
                      <button
                        type="button"
                        className="text-accent font-semibold hover:underline"
                        onClick={() => {
                          if (!mentionedUser) return;
                          const nextValue = `@${mentionedUser.name || mentionedUser.email} `;
                          setCommentDraft(nextValue);
                          if (!commentInputRef.current) return;
                          commentInputRef.current.focus();
                          commentInputRef.current.setSelectionRange(nextValue.length, nextValue.length);
                        }}
                      >
                        {mention}
                      </button>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </React.Fragment>
          );
        })}
      </span>
    );
  };

  useEffect(() => {
    if (!designAssets.length) return;
    setEmbedLoading(prev => {
      const next = { ...prev };
      designAssets.forEach((asset, index) => {
        const assetType = asset.type || 'link';
        if (assetType === 'figma' || assetType === 'prototype') {
          const key = asset.id || `${assetType}-${index}`;
          if (next[key] === undefined) {
            next[key] = true;
          }
        }
      });
      return next;
    });
    setEmbedViewModes(prev => {
      const next = { ...prev };
      designAssets.forEach((asset, index) => {
        const assetType = asset.type || 'link';
        if (assetType === 'figma' || assetType === 'prototype') {
          const key = asset.id || `${assetType}-${index}`;
          if (!next[key]) {
            next[key] = 'mobile';
          }
        }
      });
      return next;
    });
  }, [designAssets]);

  useEffect(() => {
    if (!localIssue) return;
    lastSavedAssetsRef.current = JSON.stringify(designAssets);
  }, [localIssue?.id]);

    if (!localIssue || !issue) return null;


  const handleUpdate = async (updates: Partial<Issue>) => {
    if (updates.status && (updates.status === Status.Done || updates.status === Status.Closed)) {
      if (!canCompleteBug(isBug, currentUser?.role)) {
        alert('Bug 任务需 QA 验收通过后才能完成。');
        return;
      }
    }
    if (updates.status && (updates.status === Status.Canceled || updates.status === Status.Closed)) {
      const reason = (updates.customFields?.closeReason as string | undefined) || window.prompt('请输入关闭原因（例如：重复/无效/不修）', '');
      if (!reason) return;
      updates.customFields = withCloseReason({ ...localIssue.customFields, ...(updates.customFields || {}) }, reason);
    }

    // --- Change Detection for Activity Log ---
    const newActivities: Activity[] = [];
    
    if (updates.status && updates.status !== localIssue.status) {
        newActivities.push({
            id: Math.random().toString(), type: 'update', userId: resolveActivityUserId(currentUser?.id), timestamp: getBeijingNow(),
            field: '状态', oldValue: localIssue.status, newValue: updates.status
        });
    }
    if (updates.priority && updates.priority !== localIssue.priority) {
        newActivities.push({
            id: Math.random().toString(), type: 'update', userId: resolveActivityUserId(currentUser?.id), timestamp: getBeijingNow(),
            field: '优先级', oldValue: localIssue.priority, newValue: updates.priority
        });
    }
    if (updates.assigneeId !== undefined && updates.assigneeId !== localIssue.assigneeId) {
         // Handle Assignee logic specifically for display
         const oldName = users.find(u => u.id === localIssue.assigneeId)?.name || '未分配';
         const newName = users.find(u => u.id === updates.assigneeId)?.name || '未分配';
         newActivities.push({
            id: Math.random().toString(), type: 'update', userId: resolveActivityUserId(currentUser?.id), timestamp: getBeijingNow(),
            field: '负责人', oldValue: oldName, newValue: newName
        });
    }

  // --- Auto-Assign Logic (Existing) ---
  // Scenario 1: Status moves to QA stage
  if ((updates.status === Status.CodeMerged || updates.status === Status.InQA) && localIssue.status !== updates.status) {
        const resolveQaAssigneeId = () => {
            if (currentUser?.id && localIssue.assigneeId === currentUser.id) return currentUser.id;
            if (currentUser?.role === UserRole.QA) return currentUser.id;
            const currentAssignee = users.find(u => u.id === localIssue.assigneeId);
            if (currentAssignee?.role === UserRole.QA) return currentAssignee.id;
            return users.find(u => u.role === UserRole.QA)?.id;
        };
        const qaAssigneeId = resolveQaAssigneeId();
        if (qaAssigneeId && localIssue.assigneeId !== qaAssigneeId) {
            if (localIssue.assigneeId) {
                updates.previousAssigneeId = localIssue.assigneeId;
            }
            updates.assigneeId = qaAssigneeId;
            const qaName = users.find(u => u.id === qaAssigneeId)?.name;
            newActivities.push({
                id: Math.random().toString(), type: 'update', userId: 'system', timestamp: getBeijingNow(),
                field: '负责人 (自动)', oldValue: users.find(u => u.id === localIssue.assigneeId)?.name, newValue: qaName || '未分配'
            });
        }
    }

    const previousIssue = localIssue;
    const updated = { 
        ...localIssue, 
        ...updates, 
        updatedAt: getBeijingNow(),
        activities: [...newActivities, ...(localIssue.activities || [])] // Prepend new activities
    };
    
    setLocalIssue(updated);
    try {
      const result = await onUpdate(updated);
      if (result && typeof result === 'object') {
        setLocalIssue(result as Issue);
        if (updates.customFields?.designAssets) {
          lastSavedAssetsRef.current = JSON.stringify((result as Issue).customFields?.designAssets || []);
        }
      }
    } catch (err: any) {
      setLocalIssue(previousIssue);
      alert('更新失败: ' + (err?.message || JSON.stringify(err)));
    }
  };

  const resolveEmbedUrl = (assetUrl: string, assetType: string) => {
    if (!assetUrl) return '';
    if (assetType === 'figma' || assetType === 'prototype') {
      if (assetUrl.includes('figma.com/embed')) return assetUrl;
      const normalizedUrl = assetUrl.includes('figma.com/design')
        ? assetUrl.replace('figma.com/design', 'figma.com/file')
        : assetUrl;
      if (normalizedUrl.includes('figma.com/file') || normalizedUrl.includes('figma.com/proto')) {
        return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(normalizedUrl)}`;
      }
    }
    return assetUrl;
  };

  const saveDesignAssets = async (nextAssets: Array<{ id?: string; type?: string; title?: string; url?: string }>) => {
    if (!localIssue) return;
    const serialized = JSON.stringify(nextAssets);
    if (serialized === lastSavedAssetsRef.current) return;

    const optimistic = { ...localIssue, customFields: { ...localIssue.customFields, designAssets: nextAssets } };
    setLocalIssue(optimistic);
    setIsSavingAssets(true);
    setAssetSaveError(null);

    try {
      const timeoutPromise = new Promise<Issue>((_, reject) => {
        setTimeout(() => reject(new Error('保存超时，请检查网络或权限配置。')), 12000);
      });
      const result = await Promise.race([Promise.resolve(onUpdate(optimistic)) as Promise<Issue>, timeoutPromise]);
      if (result && typeof result === 'object') {
        setLocalIssue(result as Issue);
      }
      lastSavedAssetsRef.current = serialized;
    } catch (error: any) {
      const message = error?.message || '保存失败';
      setAssetSaveError(message);
      console.warn('Auto-save design assets failed', error);
    } finally {
      setIsSavingAssets(false);
    }
  };

  const handleAddAsset = async () => {
    const trimmedUrl = newAssetUrl.trim();
    if (!trimmedUrl) return;
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      alert('请填写以 http:// 或 https:// 开头的链接。');
      return;
    }
    const nextAssets = [
      ...designAssets,
      {
        id: `asset_${Date.now()}`,
        type: newAssetType,
        title: newAssetTitle.trim() || undefined,
        url: trimmedUrl,
      },
    ];
    await saveDesignAssets(nextAssets);
    setNewAssetTitle('');
    setNewAssetUrl('');
  };

  const handleRemoveAsset = async (index: number) => {
    const nextAssets = designAssets.filter((_, idx) => idx !== index);
    await saveDesignAssets(nextAssets);
  };

  const handleAiEnrichment = async () => {
    if (!localIssue.title) return;
    setIsAnalysing(true);
    try {
      const currentProject = projects?.find(p => p.id === localIssue.projectId);
      const relatedTasks = (issues || [])
        .filter(i => i.projectId === localIssue.projectId && i.id !== localIssue.id)
        .map(i => `${i.identifier} ${i.title}`);
      const result = await enrichTaskDetails(
        localIssue.title,
        currentProject?.name,
        currentProject?.description,
        relatedTasks
      );
      
      if (result) {
          const newSubtasks = result.subtasks.map(t => ({ id: Math.random().toString(36).substr(2,9), title: t, completed: false }));
          handleUpdate({ 
              description: result.description,
              subtasks: [...(localIssue.subtasks || []), ...newSubtasks],
              customFields: { ...localIssue.customFields, englishSlug: result.englishSlug }
          });
      } else {
          alert('AI 补全失败：未返回结果，请稍后重试。');
      }
    } catch (error: any) {
      console.error('AI 补全失败:', error);
      alert('AI 补全失败: ' + (error?.message || JSON.stringify(error)));
    } finally {
      setIsAnalysing(false);
    }
  };

  const ensureQAPermission = (action: () => void) => {
      if (!canExecuteQaAction(currentUser?.role)) {
          alert(`权限不足：只有测试专员才能执行此操作。\n当前身份: ${currentUser?.role || '未知'}`);
          return;
      }
      action();
  };

  // --- QA Workflow Actions ---
  const startTesting = () => handleUpdate({ status: Status.InQA });
  const passTesting = () => ensureQAPermission(() => handleUpdate({ status: Status.Done }));

  const rejectTesting = () => ensureQAPermission(() => {
      const hasBugLabel = localIssue.labels.includes('Bug');
      const newLabels = hasBugLabel ? localIssue.labels : ['Bug', ...localIssue.labels];
      
      const updates: Partial<Issue> = {
        status: Status.InProgress,
        labels: newLabels,
        customFields: incrementReopenCount({ ...localIssue.customFields }),
      };
      // Scenario 2: QA Rejects -> Auto-assign back to previous developer
      if (localIssue.previousAssigneeId) updates.assigneeId = localIssue.previousAssigneeId;

      handleUpdate(updates);
  });

  // --- Handover to Engineering ---
  const handleHandoverToEng = () => {
      if (!engineeringTeamId) {
          alert('未找到研发团队，请先确认团队配置。');
          return;
      }
      handleUpdate({
          teamId: engineeringTeamId,
          status: Status.Todo, 
      });
  };

  // --- Business Inbox Rejection ---
  const handleInboxReject = () => {
      const reason = window.prompt("请输入驳回/拒绝的理由：", "业务价值不明确");
      if (reason !== null) {
          handleUpdate({
              status: Status.Canceled,
              customFields: { ...localIssue.customFields, rejectionReason: reason || "无详细理由" }
          });
      }
  };

  // --- Dev Kit Helpers ---
  const generateBranchName = () => {
    const customBranchValue = localIssue.customFields?.branchName;
    const customBranch = typeof customBranchValue === 'string' ? customBranchValue.trim() : '';
    if (customBranch) {
      return customBranch.includes('/') ? customBranch : `feat/${customBranch}`;
    }
    const slugValue = localIssue.customFields?.englishSlug;
    const slug = typeof slugValue === 'string'
      ? slugValue
      : localIssue.title.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '');
    return `feat/${localIssue.identifier.toLowerCase()}-${slug}`;
  };

  const copyBranchName = () => {
      const name = generateBranchName();
      navigator.clipboard.writeText(name);
      setCopiedBranch(true);
      setTimeout(() => setCopiedBranch(false), 2000);
  };

  const copyIssueLink = () => {
      const url = new URL(window.location.href);
      url.searchParams.set('issue', localIssue.id);
      navigator.clipboard.writeText(url.toString());
      setCopiedIssueLink(true);
      setTimeout(() => setCopiedIssueLink(false), 2000);
  };

  const buildCompactPrompt = () => {
    return `
Task: ${localIssue.identifier} - ${localIssue.title}
Priority: ${localIssue.priority}

Description:
${localIssue.description}

Subtasks:
${(localIssue.subtasks || []).map(s => `- [${s.completed ? 'x' : ' '}] ${s.title}`).join('\n')}
    `.trim();
  };

  const buildExpandedPrompt = () => {
    const projectContext = projects?.find(p => p.id === localIssue.projectId)?.description || '无';
    const related = (issues || [])
      .filter(i => i.projectId === localIssue.projectId && i.id !== localIssue.id)
      .map(i => `- ${i.identifier} ${i.title}`)
      .join('\n') || '无';

    return `
${buildCompactPrompt()}

Project Context:
${projectContext}

Related Tasks:
${related}
    `.trim();
  };

  const copyCursorPrompt = () => {
      const prompt = buildCompactPrompt();
      navigator.clipboard.writeText(prompt);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const requirementPoolId = teams.find(t => t.icon === 'Inbox' || t.name.includes('收件箱'))?.id;
  const engineeringTeamId = teams.find(t => t.icon === 'Zap' || t.name.includes('研发'))?.id;
  const safeSubtasks = localIssue.subtasks || [];
  const currentTeam = teams.find(t => t.id === localIssue.teamId);
  const isQAStage = localIssue.status === Status.InQA || localIssue.status === Status.CodeMerged;
  const isInboxStage = Boolean(requirementPoolId && localIssue.teamId === requirementPoolId);
  const isRejected = localIssue.status === Status.Canceled;
  const isBug = localIssue.labels.includes('Bug');
  const rejectionReason = localIssue.customFields?.rejectionReason;
  
  // Deployment Status Logic
  const parentCycle = cycles.find(c => c.id === localIssue.cycleId);
  const isDone = localIssue.status === Status.Done || localIssue.status === Status.Closed;
  const isDeployed = isDone && parentCycle?.isReleased;

  // Sort activities: Newest first
  const sortedActivities = [...(localIssue.activities || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const visibleActivities = showAllActivities ? sortedActivities : sortedActivities.slice(0, 3);
  const hasHiddenActivities = sortedActivities.length > 3;

  return (
    <div className="h-full flex flex-col bg-surface-glass backdrop-blur-3xl border-l border-white/20 dark:border-white/10 rounded-l-3xl overflow-hidden relative">
      
      {/* Document Header Actions */}
      <div className="flex items-center justify-between px-8 py-6 shrink-0">
         <div className="flex items-center gap-3 text-muted text-xs font-mono tracking-wide">
              <button
                type="button"
                onClick={copyIssueLink}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/10 dark:hover:bg-white/10"
                title="复制任务链接"
              >
                 {currentTeam && <TeamIcon name={currentTeam.name} />}
                 <span className="font-semibold">{localIssue.identifier}</span>
                 {copiedIssueLink && <span className="text-[10px] text-accent">已复制</span>}
              </button>

             <span className="text-muted/60">上次编辑 {formatBeijingTime(localIssue.updatedAt, { hour: '2-digit', minute:'2-digit' })}</span>
         </div>
         <div className="flex items-center gap-2">
             <button onClick={() => { if(confirm('确认删除?')) { onDelete(localIssue.id); } }} className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all">
                <Trash2 size={18} />
             </button>
             <button onClick={onClose} className="p-2 text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-all">
                <X size={20} />
             </button>
         </div>
      </div>

      {/* Document Canvas */}
      <div className="flex-1 overflow-y-auto px-8 pb-12">
         
         {/* Title Area with AI Button */}
         <div className="flex gap-4 mb-6 items-start group/title">
             <textarea
                value={localIssue.title}
                onChange={(e) => handleUpdate({ title: e.target.value })}
                className="flex-1 bg-transparent text-3xl font-bold text-main placeholder-muted/50 focus:outline-none resize-none leading-tight"
                rows={1}
                style={{ minHeight: '3rem' }}
             />
             <button 
                onClick={handleAiEnrichment}
                disabled={isAnalysing}
                className={`mt-1 p-2 rounded-xl transition-all bg-accent/5 text-accent hover:bg-accent/10 border border-accent/10 hover:border-accent/30 ${isAnalysing ? 'animate-pulse' : ''}`}
                title="AI 智能补全"
             >
                <Sparkles size={18} className={isAnalysing ? 'animate-spin' : ''} />
             </button>
         </div>
         
         {/* PRODUCTION STATUS BANNER */}
         {isDeployed && (
             <div className="mb-8 flex items-center gap-3 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 px-4 py-3 rounded-xl animate-fade-in">
                 <div className="bg-green-500 rounded-full p-1.5 text-white shadow-sm shadow-green-500/30">
                     <Rocket size={14} fill="currentColor" />
                 </div>
                 <div className="flex-1">
                     <p className="font-bold text-sm">已上线 (Deployed to Production)</p>
                     <p className="text-xs opacity-80">此任务包含在已发布的迭代版本 {parentCycle?.name} 中。</p>
                 </div>
             </div>
         )}
         
         {/* REJECTED STATUS BANNER */}
         {isRejected && (
             <div className="mb-8 flex flex-col gap-2 bg-red-500/5 border border-red-500/10 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl animate-fade-in">
                 <div className="flex items-center gap-2 font-bold text-sm">
                     <XCircle size={16} />
                     <span>已驳回 (Rejected)</span>
                 </div>
                  {rejectionReason && (
                     <div className="text-xs opacity-80 pl-6">
                         理由: {String(rejectionReason)}
                     </div>
                  )}

             </div>
         )}

         {/* --- BUSINESS INBOX DECISION PANEL --- */}
         {isInboxStage && !isRejected && (
             <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 shadow-lg relative overflow-hidden">
                 <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-500 flex items-center justify-center">
                             <Inbox size={20} />
                         </div>
                         <div>
                             <h3 className="font-bold text-lg text-main">业务收件箱 (Business Inbox)</h3>
                             <p className="text-xs text-muted">此需求待审核。请选择采纳并移交研发，或驳回。</p>
                         </div>
                     </div>
                 </div>
                 
                 <div className="flex gap-3 justify-end mt-4">
                     <button 
                        onClick={handleInboxReject}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 px-4 py-3 rounded-xl font-bold transition-all border border-red-500/10"
                     >
                         <XCircle size={16} />
                         <span>驳回 (Reject)</span>
                     </button>
                     <button 
                        onClick={handleHandoverToEng}
                        className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-3 rounded-xl font-bold shadow-md hover:shadow-lg transition-all active:scale-[0.98]"
                     >
                         <Check size={16} strokeWidth={3} />
                         <span>采纳 (Accept)</span>
                     </button>
                 </div>
             </div>
         )}

         {/* QA Workflow Panel (Context Aware) */}
         {isQAStage && !isInboxStage && (
             <div className="mb-8 p-4 rounded-2xl bg-orange-500/5 dark:bg-orange-500/10 border border-orange-500/20 shadow-sm relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                     <Shield size={64} className="text-orange-500" />
                 </div>
                 
                 <div className="flex items-center gap-2 mb-4 relative z-10">
                    <div className="w-6 h-6 rounded-lg bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                        <Shield size={14} />
                    </div>
                    <h3 className="text-sm font-bold text-orange-700 dark:text-orange-300 uppercase tracking-wide">QA 验收流程</h3>
                 </div>

                 <div className="flex flex-col sm:flex-row gap-3 relative z-10">
                     {localIssue.status === Status.CodeMerged && (
                         <button 
                            onClick={startTesting}
                            className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-[0.98]"
                         >
                             <Play size={16} fill="currentColor" />
                             <span>开始测试 (Start QA)</span>
                         </button>
                     )}

                     {localIssue.status === Status.InQA && (
                         <>
                             <button 
                                onClick={passTesting}
                                className="flex-1 flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-[0.98]"
                             >
                                 <ThumbsUp size={16} />
                                 <span>验证通过 (Pass)</span>
                             </button>
                             <button 
                                onClick={rejectTesting}
                                className="flex-1 flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-all active:scale-[0.98]"
                             >
                                 <div className="relative">
                                     <ThumbsDown size={16} />
                                     <div className="absolute -top-1 -right-1">
                                         <Bug size={8} fill="currentColor" />
                                     </div>
                                 </div>
                                 <span>驳回修复 (Reject)</span>
                             </button>
                         </>
                     )}
                 </div>
             </div>
         )}

         {/* Properties Grid */}
         <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-8 p-4 bg-black/5 dark:bg-white/5 rounded-2xl border border-black/5 dark:border-white/5">
             <PropertySelect 
                label="状态" 
                icon={<StatusIcon status={localIssue.status} />} 
                value={localIssue.status}
                options={Object.values(Status)}
                onChange={(v) => handleUpdate({ status: v as Status })}
             />
             <PropertySelect 
                label="优先级" 
                icon={<PriorityIcon priority={localIssue.priority} />} 
                value={localIssue.priority}
                options={Object.values(Priority)}
                onChange={(v) => handleUpdate({ priority: v as Priority })}
             />
             <PropertySelect 
                label="负责人" 
                icon={<UserIcon size={14} />} 
                value={localIssue.assigneeId || ''}
                options={users.map(u => ({ label: u.name, value: u.id }))}
                placeholder="未分配"
                onChange={(v) => handleUpdate({ assigneeId: v || null })}
                extraAction={
                  <button
                      onClick={() => { if(!localIssue.assigneeId && currentUser?.id) handleUpdate({ assigneeId: currentUser.id }) }}
                      disabled={!!localIssue.assigneeId}
                      className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded transition-all border
                          ${localIssue.assigneeId 
                              ? 'text-muted/40 cursor-not-allowed border-transparent' 
                              : 'text-accent hover:bg-accent/10 border-accent/20 hover:shadow-sm cursor-pointer'
                          }
                      `}
                  >
                      <UserPlus size={10} />
                      <span>{localIssue.assigneeId ? '已认领' : '认领'}</span>
                  </button>
                }
             />
             
             {/* PROJECT SELECTOR */}
             <PropertySelect 
                label="所属项目" 
                icon={<Briefcase size={14} />} 
                value={localIssue.projectId || ''}
                options={projects.map(p => ({ label: `${p.icon} ${p.name}`, value: p.id }))}
                placeholder="无 (No Project)"
                onChange={(v) => handleUpdate({ projectId: v || null })}
             />

             {/* Only show Cycle selector if not in requirement pool (or allow it for planning) */}
             <PropertySelect 
                label="所属迭代" 
                icon={<CalendarRange size={14} />} 
                value={localIssue.cycleId || ''}
                options={cycles.map(c => ({ label: c.name, value: c.id }))}
                placeholder="无 (Backlog)"
                onChange={(v) => handleUpdate({ cycleId: v || null })}
             />
         </div>
         
         {/* Dev Kit / Engineer Bridge - Hide in Business Inbox */}
         {!isInboxStage && (
             <div className="mb-8 p-4 bg-gradient-to-br from-indigo-50/50 to-blue-50/50 dark:from-indigo-900/10 dark:to-blue-900/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20">
                 <div className="flex items-center gap-2 mb-3">
                     <div className="w-5 h-5 rounded-md bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                        <Terminal size={12} />
                     </div>
                     <h3 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">开发工具箱 (Dev Kit)</h3>
                 </div>
                 
                 {/* Git Branch */}
                 <div className="group flex items-center justify-between p-2 bg-white/60 dark:bg-black/20 rounded-lg border border-indigo-200/50 dark:border-indigo-500/20 mb-3 hover:border-indigo-300 dark:hover:border-indigo-500/40 transition-colors cursor-pointer" onClick={copyBranchName}>
                    <div className="flex items-center gap-2.5 overflow-hidden">
                        <GitBranch size={14} className="text-muted group-hover:text-indigo-500 transition-colors shrink-0" />
                        <code className="text-xs font-mono text-main truncate select-all">{generateBranchName()}</code>
                    </div>
                    <div className="text-muted group-hover:text-indigo-500 transition-colors p-1">
                        {copiedBranch ? <Check size={14} /> : <Copy size={14} />}
                    </div>
                 </div>

                 {/* Cursor Prompt */}
                 <div className="w-full flex items-center gap-2">
                    <button 
                      onClick={copyCursorPrompt} 
                      className="flex-1 flex items-center justify-center gap-2 p-2 bg-indigo-500 text-white rounded-lg shadow-sm hover:bg-indigo-600 hover:shadow-md active:scale-[0.98] transition-all text-xs font-semibold"
                    >
                      {copiedPrompt ? <Check size={14} /> : <Sparkles size={14} />}
                      <span>复制指令（精简）</span>
                    </button>
                    <button
                      onClick={() => {
                        const prompt = buildExpandedPrompt();
                        navigator.clipboard.writeText(prompt);
                        setCopiedPrompt(true);
                        setTimeout(() => setCopiedPrompt(false), 2000);
                      }}
                      className="px-3 py-2 text-xs font-semibold rounded-lg border border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10 transition-colors"
                    >
                      扩展
                    </button>
                 </div>
             </div>
         )}

         {/* Description */}
         <div className="w-full mb-8">
            {isEditingDesc || !localIssue.description ? (
                <textarea
                    ref={textareaRef}
                    value={draftDescription}
                    onChange={(e) => setDraftDescription(e.target.value)}
                    onBlur={() => {
                      handleUpdate({ description: draftDescription });
                      if (draftDescription) setIsEditingDesc(false);
                    }}
                    className="w-full bg-transparent text-sm text-main placeholder-muted focus:outline-none resize-none leading-7 min-h-[100px] h-[60vh] max-h-[60vh] p-0"
                    placeholder="输入描述内容 (支持 Markdown)..."
                />
            ) : (
                <div 
                    onClick={() => {
                      setDraftDescription(localIssue.description);
                      setIsEditingDesc(true);
                    }}
                    className="min-h-[100px] cursor-text text-sm"
                >
                    <ReactMarkdown components={markdownComponents}>
                      {localIssue.description.replace(/\n/g, '\n')}
                    </ReactMarkdown>
                </div>
            )}
         </div>

         <div className="w-full mb-8">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-main">
                <Layers size={16} className="text-muted" />
                设计与原型
              </div>
              <span className="text-xs text-muted">支持图片、Figma、原型与链接</span>
            </div>
            {isSavingAssets && (
              <div className="mb-3 flex items-center gap-2 text-xs text-muted">
                <Loader2 size={12} className="animate-spin" />
                正在保存链接...
              </div>
            )}
            {assetSaveError && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-red-500">
                <span>保存失败：{assetSaveError}</span>
                <button
                  type="button"
                  onClick={() => saveDesignAssets(designAssets)}
                  disabled={isSavingAssets}
                  className="rounded-full border border-red-200 px-2 py-0.5 text-[11px] text-red-500 hover:bg-red-50 disabled:opacity-50"
                >
                  重新保存
                </button>
              </div>
            )}

            {designAssets.length > 0 ? (
              <div className="space-y-4">
                {designAssets.map((asset, index) => {
                  const assetUrl = asset.url || '';
                      const assetTitle = asset.title || '未命名链接';
                      const assetType = asset.type || 'link';
                      const isEmbed = assetType === 'figma' || assetType === 'prototype';
                      const embedUrl = resolveEmbedUrl(assetUrl, assetType);
                      const assetKey = asset.id || `${assetType}-${index}`;
                      const viewMode = embedViewModes[assetKey] || 'mobile';
                      const isDesktop = viewMode === 'desktop';
                      return (
                        <div key={assetKey} className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-main">{assetTitle}</span>
                              <span className="text-xs text-muted break-all">{assetUrl}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isEmbed && (
                                <div className="flex items-center rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 p-0.5 text-[11px]">
                                  {(['mobile', 'desktop'] as const).map(mode => (
                                    <button
                                      key={mode}
                                      type="button"
                                      onClick={() => setEmbedViewModes(prev => ({ ...prev, [assetKey]: mode }))}
                                      className={`px-2.5 py-1 rounded-full transition-colors ${viewMode === mode ? 'bg-white dark:bg-black text-main shadow-sm' : 'text-muted hover:text-main'}`}
                                    >
                                      {mode === 'mobile' ? 'Mobile' : 'Desktop'}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => handleRemoveAsset(index)}
                                className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                title="移除链接"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                      {assetType === 'image' && assetUrl && (
                        <img
                          src={assetUrl}
                          alt={assetTitle}
                          className="w-full rounded-xl border border-black/5 dark:border-white/10"
                        />
                      )}
                      {isEmbed && embedUrl && (
                        <div className="rounded-xl border border-black/5 dark:border-white/10 overflow-hidden bg-black/5 dark:bg-white/5">
                          <div className={`relative ${!isDesktop ? 'flex justify-center py-4' : 'overflow-hidden'} ${isDesktop ? 'h-[432px]' : ''}`}>
                            {embedLoading[assetKey] && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/5 dark:bg-white/5">
                                <div className="flex items-center gap-2 text-xs text-muted">
                                  <Loader2 size={14} className="animate-spin" />
                                  加载中...
                                </div>
                              </div>
                            )}
                            <iframe
                              src={embedUrl}
                              title={assetTitle}
                              className={viewMode === 'mobile' ? 'w-[360px] h-[640px] rounded-xl bg-white' : 'w-full h-[864px]'}
                              style={isDesktop ? { width: '200%', transform: 'scale(0.5)', transformOrigin: 'top left' } : undefined}
                              allow="fullscreen; clipboard-write"
                              loading="lazy"
                              onLoad={() => {
                                setEmbedLoading(prev => ({ ...prev, [assetKey]: false }));
                              }}
                              onError={() => {
                                setEmbedLoading(prev => ({ ...prev, [assetKey]: false }));
                              }}
                            />
                          </div>
                          <div className="px-3 py-2 text-[11px] text-muted border-t border-black/5 dark:border-white/10">
                            如无法预览，请确认 Figma 链接已开启「任何知道链接的人可查看」。
                          </div>
                        </div>
                      )}
                      {!isEmbed && assetType === 'link' && assetUrl && (
                        <a
                          href={assetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm text-accent hover:underline"
                        >
                          打开链接
                        </a>
                      )}
                      {isEmbed && assetUrl && (
                        <a
                          href={assetUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex text-xs text-muted hover:text-main"
                        >
                          在新窗口打开
                        </a>
                      )}
                    </div>
                  );
                })}

              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-black/10 dark:border-white/10 text-sm text-muted px-4 py-6 text-center">
                暂无设计稿或原型链接
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-4 space-y-3">
              <div className="text-xs font-semibold text-muted uppercase tracking-wider">添加链接</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={newAssetTitle}
                  onChange={(e) => setNewAssetTitle(e.target.value)}
                  placeholder="标题（可选）"
                  className="w-full bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2 text-sm text-main focus:outline-none"
                />
                <select
                  value={newAssetType}
                  onChange={(e) => setNewAssetType(e.target.value as typeof newAssetType)}
                  className="w-full bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2 text-sm text-main focus:outline-none"
                >
                  <option value="figma">Figma</option>
                  <option value="prototype">原型</option>
                  <option value="image">图片</option>
                  <option value="link">链接</option>
                </select>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  value={newAssetUrl}
                  onChange={(e) => setNewAssetUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2 text-sm text-main focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddAsset}
                  disabled={isSavingAssets}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold ${isSavingAssets ? 'bg-black/10 text-muted cursor-not-allowed' : 'bg-main text-surface hover:opacity-90'}`}
                >
                  添加
                </button>
              </div>
            </div>
         </div>

         {isBug && (

           <div className="mb-8 p-4 rounded-2xl bg-rose-500/5 border border-rose-500/10">
             <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-rose-600">
               <AlertCircle size={14} />
               Bug 信息
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               <label className="text-xs text-muted">
                 严重度
                 <select
                   value={(localIssue.customFields?.severity as string) || 'S2'}
                   onChange={(e) => handleUpdate({ customFields: { ...localIssue.customFields, severity: e.target.value } })}
                   className="mt-1 w-full bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 text-sm text-main focus:outline-none"
                 >
                   {['S0','S1','S2','S3'].map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
               </label>
               <label className="text-xs text-muted">
                 环境
                 <select
                   value={(localIssue.customFields?.environment as string) || 'prod'}
                   onChange={(e) => handleUpdate({ customFields: { ...localIssue.customFields, environment: e.target.value } })}
                   className="mt-1 w-full bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1 text-sm text-main focus:outline-none"
                 >
                   {['prod','staging','dev'].map(env => <option key={env} value={env}>{env}</option>)}
                 </select>
               </label>
             </div>
             <div className="mt-3 space-y-3">
               <textarea
                 value={(localIssue.customFields?.reproSteps as string) || ''}
                 onChange={(e) => handleUpdate({ customFields: { ...localIssue.customFields, reproSteps: e.target.value } })}
                 rows={3}
                 placeholder="复现步骤"
                 className="w-full bg-black/5 dark:bg-white/5 rounded-lg p-3 text-sm text-main placeholder-muted/50 resize-none focus:outline-none"
               />
               <textarea
                 value={(localIssue.customFields?.expectedResult as string) || ''}
                 onChange={(e) => handleUpdate({ customFields: { ...localIssue.customFields, expectedResult: e.target.value } })}
                 rows={2}
                 placeholder="期望结果"
                 className="w-full bg-black/5 dark:bg-white/5 rounded-lg p-3 text-sm text-main placeholder-muted/50 resize-none focus:outline-none"
               />
               <textarea
                 value={(localIssue.customFields?.actualResult as string) || ''}
                 onChange={(e) => handleUpdate({ customFields: { ...localIssue.customFields, actualResult: e.target.value } })}
                 rows={2}
                 placeholder="实际结果"
                 className="w-full bg-black/5 dark:bg-white/5 rounded-lg p-3 text-sm text-main placeholder-muted/50 resize-none focus:outline-none"
               />
               <textarea
                 value={(localIssue.customFields?.closeReason as string) || ''}
                 onChange={(e) => handleUpdate({ customFields: { ...localIssue.customFields, closeReason: e.target.value } })}
                 rows={2}
                 placeholder="关闭原因（重复/无效/不修）"
                 className="w-full bg-black/5 dark:bg-white/5 rounded-lg p-3 text-sm text-main placeholder-muted/50 resize-none focus:outline-none"
               />
            </div>
          </div>
         )}

          {/* Checklist / Subtasks */}
          <div className="mb-8">
             <div className="flex items-center justify-between mb-4">
                 <h3 className="text-sm font-bold text-muted uppercase tracking-wider">子任务</h3>
             </div>

            
             <div className="space-y-1">
                 {safeSubtasks.map(st => (
                     <div key={st.id} className="group flex items-start gap-3 p-2 -ml-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                         <button 
                             onClick={() => {
                                 const newSubtasks = safeSubtasks.map(t => t.id === st.id ? { ...t, completed: !t.completed } : t);
                                 handleUpdate({ subtasks: newSubtasks });
                             }}
                             className="mt-0.5 text-muted hover:text-accent transition-colors"
                         >
                             {st.completed ? <CheckCircle2 size={18} className="text-accent" /> : <Circle size={18} />}
                         </button>
                         {editingSubtaskId === st.id ? (
                           <input
                             value={editingSubtaskTitle}
                             onChange={(e) => setEditingSubtaskTitle(e.target.value)}
                             onBlur={() => {
                               const nextTitle = editingSubtaskTitle.trim();
                               setEditingSubtaskId(null);
                               if (!nextTitle || nextTitle === st.title) return;
                               const newSubtasks = safeSubtasks.map(t => t.id === st.id ? { ...t, title: nextTitle } : t);
                               handleUpdate({ subtasks: newSubtasks });
                             }}
                             onKeyDown={(e) => {
                               if (e.key === 'Enter') {
                                 e.currentTarget.blur();
                               }
                               if (e.key === 'Escape') {
                                 setEditingSubtaskId(null);
                                 setEditingSubtaskTitle(st.title);
                               }
                             }}
                             autoFocus
                             className="flex-1 bg-transparent text-sm text-main focus:outline-none"
                           />
                         ) : (
                           <button
                             type="button"
                             onClick={() => {
                               setEditingSubtaskId(st.id);
                               setEditingSubtaskTitle(st.title);
                             }}
                             className={`flex-1 text-left text-sm ${st.completed ? 'text-muted line-through decoration-muted/50' : 'text-main'}`}
                           >
                             {st.title}
                           </button>
                         )}
                         <button 
                             onClick={() => handleUpdate({ subtasks: safeSubtasks.filter(t => t.id !== st.id) })}
                             className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-500 transition-opacity"
                         >
                             <X size={14} />
                         </button>
                     </div>
                 ))}
             </div>


            <form onSubmit={(e) => { e.preventDefault(); if(newSubtaskTitle.trim()) {
                 handleUpdate({ subtasks: [...safeSubtasks, { id: Math.random().toString(), title: newSubtaskTitle, completed: false }]});
                 setNewSubtaskTitle('');
            }}} className="flex items-center gap-3 mt-2 p-2 -ml-2 text-muted">
                <Plus size={18} />
                <input 
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    placeholder="添加子任务..."
                    className="bg-transparent text-sm focus:outline-none flex-1 text-main"
                />
            </form>
         </div>
         
          {/* COMMENTS */}
          <div className="pt-8 border-t border-black/5 dark:border-white/5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-muted uppercase tracking-wider">评论</h3>
            </div>
            <div className="relative">
              <textarea
                ref={commentInputRef}
                value={commentDraft}
                onChange={(event) => handleCommentInput(event.target.value)}
                onKeyDown={handleCommentKeyDown}
                placeholder="写下评论，支持 @ 提及"
                className="w-full min-h-[96px] resize-none rounded-2xl border border-black/5 dark:border-white/10 bg-surface/70 px-4 py-3 text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              {mentionState && mentionCandidates.length > 0 && (
                <div className="absolute z-20 mt-2 w-72 rounded-xl border border-black/10 dark:border-white/10 bg-surface shadow-lg">
                  {mentionCandidates.map((user, index) => (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => applyMention(user)}
                      className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-black/5 dark:hover:bg-white/5 ${index === mentionIndex ? 'bg-black/5 dark:bg-white/5' : ''}`}
                    >
                      <img
                        src={resolveAvatarUrl(user.name || user.email, user.avatarUrl)}
                        alt={user.name}
                        className="w-6 h-6 rounded-full"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-main truncate">{user.name || user.email}</div>
                        <div className="text-[11px] text-muted truncate">{user.email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between text-xs text-muted">
                <span>Enter 发送，Shift + Enter 换行</span>
                <button
                  type="button"
                  onClick={sendComment}
                  className="px-3 py-1 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition"
                >
                  发送
                </button>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              {sortedActivities.filter(activity => activity.type === 'comment').map(activity => {
                const user = users.find(u => u.id === activity.userId) || { name: 'System', email: '', avatarUrl: '', role: 'Bot' };
                const canDelete = currentUser?.id && currentUser.id === activity.userId;
                return (
                  <div key={activity.id} className="flex items-start gap-3">
                    <img
                      src={resolveAvatarUrl(user.name || user.email, user.avatarUrl)}
                      alt={user.name}
                      className="w-8 h-8 rounded-full"
                    />
                    <div className="flex-1 rounded-2xl border border-black/5 dark:border-white/10 bg-surface/70 px-4 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2 text-xs text-muted">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-main">{user.name}</span>
                          <span>{formatBeijingDateTime(activity.timestamp, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</span>
                          {activity.oldValue && (
                            <span className="text-[10px] text-accent">提及 {activity.oldValue.split(',').length} 人</span>
                          )}
                        </div>
                        {canDelete && (
                          <button
                            type="button"
                            className="text-[11px] text-muted hover:text-red-500"
                            onClick={async () => {
                              if (!onDeleteComment || !currentUser || !localIssue) return;
                              if (!confirm('确认删除该评论？')) return;
                              const previousActivities = localIssue.activities || [];
                              setLocalIssue({
                                ...localIssue,
                                activities: previousActivities.filter(item => item.id !== activity.id),
                              });
                              try {
                                await onDeleteComment(localIssue.id, activity.id, currentUser.id);
                              } catch (err) {
                                setLocalIssue({ ...localIssue, activities: previousActivities });
                                alert('评论删除失败，请重试。');
                              }
                            }}
                          >
                            删除
                          </button>
                        )}
                      </div>
                      <div className="mt-2 text-main/80 leading-6">
                        {activity.newValue ? renderCommentBody(activity.newValue) : '（空）'}
                      </div>
                    </div>
                  </div>
                );
              })}
              {sortedActivities.filter(activity => activity.type === 'comment').length === 0 && (
                <div className="text-xs text-muted">暂无评论</div>
              )}
            </div>
          </div>

          {/* ACTIVITY LOG */}
          <div className="pt-8 border-t border-black/5 dark:border-white/5">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xs font-bold text-muted uppercase tracking-wider">动态日志</h3>
                 {hasHiddenActivities && (
                     <button 
                         onClick={() => setShowAllActivities(!showAllActivities)} 
                         className="text-xs text-muted hover:text-main flex items-center gap-1 transition-colors"
                     >
                         {showAllActivities ? (
                             <>
                                 <ChevronUp size={12} /> 收起
                             </>
                         ) : (
                             <>
                                 <ChevronDown size={12} /> 显示更多 ({sortedActivities.length - 3})
                             </>
                         )}
                     </button>
                 )}
              </div>
              
              <div className="space-y-4 pl-2 relative">
                  {/* Timeline Line */}
                  <div className="absolute left-[15px] top-2 bottom-2 w-[1px] bg-black/5 dark:bg-white/5"></div>
                  
                  {visibleActivities.map(act => {
                       const user = users.find(u => u.id === act.userId) || { name: 'System', email: '', avatarUrl: '', role: 'Bot' };
                      return (
                          <div key={act.id} className="relative flex items-start gap-3 text-sm group animate-fade-in">
                              <div className="relative z-10 shrink-0 mt-0.5">
                                  {act.userId === 'system' ? (
                                      <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent ring-4 ring-surface dark:ring-surface-glass">
                                          <Terminal size={14} />
                                      </div>
                                  ) : (
                                      <img src={resolveAvatarUrl(user.name || user.email, user.avatarUrl)} alt={user.name} className="w-7 h-7 rounded-full ring-4 ring-surface dark:ring-surface-glass" />
                                  )}
                              </div>
                              
                              <div className="flex-1 pt-1">
                                  <div className="flex items-center gap-2 mb-0.5">
                                      <span className="font-semibold text-main">{user.name}</span>
                                       <span className="text-muted text-xs">{formatBeijingDateTime(act.timestamp, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</span>
 
                                  </div>
                                  <div className="text-main/80">
                                      {act.type === 'create' && (
                                          <span>创建了任务</span>
                                      )}
                                      {act.type === 'update' && act.field && (
                                          <span className="flex items-center gap-1.5 flex-wrap">
                                              将 <span className="font-medium text-muted">{act.field}</span> 
                                              {act.oldValue && (
                                                  <>从 <span className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 text-muted decoration-slate-400 line-through text-xs">{act.oldValue}</span></>
                                              )}
                                              变更为了
                                              <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent font-medium text-xs">{act.newValue}</span>
                                          </span>
                                      )}
                                      {act.type === 'comment' && (
                                          <span>评论：{act.newValue ? renderCommentBody(act.newValue) : '（空）'}</span>
                                      )}
                                  </div>
                              </div>
                          </div>
                      )
                  })}
                  
                  {/* Only show 'Start Point' if showing all history or if history is short */}
                  {(showAllActivities || !hasHiddenActivities) && (
                      <div className="relative flex items-start gap-3 text-sm animate-fade-in">
                           <div className="relative z-10 shrink-0 mt-0.5 w-7 h-7 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-muted ring-4 ring-surface dark:ring-surface-glass">
                               <Plus size={14} />
                           </div>
                           <div className="pt-1.5 text-muted text-xs">任务创建起点</div>
                      </div>
                  )}
                  
                  {/* If hidden, show a small indicator that there is more history below visually */}
                  {hasHiddenActivities && !showAllActivities && (
                     <div className="relative flex items-start gap-3 text-sm opacity-50">
                         <div className="relative z-10 shrink-0 mt-0.5 w-7 h-7 flex items-center justify-center text-muted">
                             <div className="w-1 h-1 rounded-full bg-muted/50"></div>
                             <div className="w-1 h-1 rounded-full bg-muted/50 mx-0.5"></div>
                             <div className="w-1 h-1 rounded-full bg-muted/50"></div>
                         </div>
                     </div>
                  )}
              </div>
          </div>


         {/* Meta Footer */}
         <div className="pt-8 mt-4 border-t border-black/5 dark:border-white/5 text-xs text-muted">
             <div className="flex gap-4">
                 <span>ID: {localIssue.id}</span>
                  {Object.entries(localIssue.customFields || {}).map(([k, v]) => (
                      <span key={k}>{k}: {String(v)}</span>
                  ))}

             </div>
         </div>

      </div>
    </div>
  );
};

// Helper Component for Property Selectors
const PropertySelect = ({ label, icon, value, options, onChange, placeholder, extraAction }: any) => (
    <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider">{label}</span>
            {extraAction}
        </div>
        <div className="relative group">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none text-muted group-hover:text-main transition-colors">
                {icon}
            </div>
            <select 
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-transparent pl-6 pr-2 py-1 text-sm font-medium text-main focus:outline-none cursor-pointer appearance-none"
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options.map((o: any) => {
                    const val = typeof o === 'string' ? o : o.value;
                    const lab = typeof o === 'string' ? o : o.label;
                    return <option key={val} value={val}>{lab}</option>
                })}
            </select>
        </div>
    </div>
);

export default IssueDetailPane;
