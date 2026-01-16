import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

const MAX_SIDEBAR_WIDTH = 560;
const MIN_SIDEBAR_WIDTH = 320;
const SIDEBAR_NARROW_BREAKPOINT = 1800;
const SIDEBAR_NARROW_RATIO = 0.8;
import { Sparkles, Send, MessageSquare } from 'lucide-react';
import { Issue, Project, User } from '../types';
import { getBeijingNow } from '../constants';
import { answerWorkspaceQuestion, recommendWorkspaceTasks } from '../services/geminiService';

interface WorkspaceAiPanelProps {
  variant: 'sidebar' | 'inline';
  currentUser: User;
  myIssues: Issue[];
  availableIssues: Issue[];
  projects: Project[];
  onSelectIssue?: (issueId: string) => void;
  onClaimIssue?: (issue: Issue) => void | Promise<void>;
}

type ChatMessage = {
  role: 'user' | 'ai';
  content: string;
  createdAt: string;
};

type RecommendedTask = {
  issue: Issue;
  reason: string;
};

const markdownComponents = {
  p: (props: any) => <p className="mb-2 leading-6 text-sm" {...props} />,
  ul: (props: any) => <ul className="list-disc list-outside ml-5 mb-2 space-y-1" {...props} />,
  ol: (props: any) => <ol className="list-decimal list-outside ml-5 mb-2 space-y-1" {...props} />,
  li: (props: any) => <li className="leading-6" {...props} />,
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeStoredMessages = (raw: Array<Partial<ChatMessage>>): ChatMessage[] => (
  raw
    .filter(item => item.role && item.content)
    .map(item => ({
      role: item.role as ChatMessage['role'],
      content: item.content as string,
      createdAt: item.createdAt || getBeijingNow().toISOString(),
    }))
);

const WorkspaceAiPanel: React.FC<WorkspaceAiPanelProps> = ({
  variant,
  currentUser,
  myIssues,
  availableIssues,
  projects,
  onSelectIssue,
  onClaimIssue,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);
  const [recommendedTasks, setRecommendedTasks] = useState<RecommendedTask[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    const isXl = window.matchMedia('(min-width: 1280px)').matches;
    return variant === 'sidebar' ? isXl : !isXl;
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    if (variant !== 'sidebar') return 380;
    const stored = localStorage.getItem('workspace_ai_width');
    const parsed = stored ? Number(stored) : 380;
    return Number.isFinite(parsed) ? parsed : 380;
  });
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== 'undefined' && window.innerWidth < SIDEBAR_NARROW_BREAKPOINT
  ));
  const [contentPadding, setContentPadding] = useState(120);
  const isResizing = useRef(false);
  const inputContainerRef = useRef<HTMLDivElement | null>(null);

  const quickActions = useMemo(
    () => [
      { label: '生成我的今日计划', prompt: '请基于我的任务列表生成今日行动计划，列出优先顺序与具体下一步。' },
      { label: '列出最高风险任务', prompt: '从我的任务中识别风险最高的事项，并给出需要立即处理的原因。' },
      { label: '推荐未认领任务', prompt: '请推荐与我当前任务强关联、但尚未认领的任务，并解释推荐原因。' },
    ],
    []
  );

  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);
  const issueLookup = useMemo(() => {
    const map = new Map<string, Issue>();
    [...myIssues, ...availableIssues].forEach(issue => {
      map.set(issue.identifier, issue);
    });
    return map;
  }, [myIssues, availableIssues]);
  const hasConversation = messages.length > 0 || isLoading || recommendedTasks.length > 0;
  const storageKey = useMemo(() => `workspace_ai_chat_v1:${currentUser.id}`, [currentUser.id]);

  const resolveMessageIssues = (content: string) => {
    const results: Issue[] = [];
    issueLookup.forEach((issue, identifier) => {
      const pattern = new RegExp(`\\b${escapeRegExp(identifier)}\\b`);
      if (pattern.test(content)) {
        results.push(issue);
      }
    });
    return results;
  };

  useEffect(() => {
    if (!isVisible) return;
    const stored = localStorage.getItem(storageKey);
    const legacyKey = `workspace_ai_${currentUser.id}`;
    const legacyStored = stored ? null : localStorage.getItem(legacyKey);

    if (stored || legacyStored) {
      try {
        const parsed = JSON.parse(stored || legacyStored || '[]') as Array<Partial<ChatMessage>>;
        const hydrated = normalizeStoredMessages(parsed).slice(-200);
        setMessages(hydrated);
        if (!stored && legacyStored) {
          localStorage.setItem(storageKey, JSON.stringify(hydrated));
        }
      } catch {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
    setRecommendedTasks([]);
    setIsHydrated(true);
  }, [storageKey, currentUser.id, isVisible]);

  useEffect(() => {
    if (!isHydrated || !isVisible) return;
    const trimmed = messages.slice(-200);
    localStorage.setItem(storageKey, JSON.stringify(trimmed));
  }, [messages, storageKey, isHydrated, isVisible]);

  useEffect(() => {
    if (variant !== 'sidebar') return;
    localStorage.setItem('workspace_ai_width', String(panelWidth));
  }, [panelWidth, variant]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const handleChange = () => {
      const isXl = mediaQuery.matches;
      setIsVisible(variant === 'sidebar' ? isXl : !isXl);
    };
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [variant]);

  useEffect(() => {
    if (variant !== 'sidebar') return;
    const handleResize = () => {
      setIsNarrow(window.innerWidth < SIDEBAR_NARROW_BREAKPOINT);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [variant]);

  useEffect(() => {
    if (variant !== 'sidebar') return;
    const handleMove = (event: MouseEvent) => {
      if (!isResizing.current) return;
      const baseWidth = window.innerWidth - event.clientX;
      const scaledWidth = isNarrow ? baseWidth / SIDEBAR_NARROW_RATIO : baseWidth;
      const nextWidth = Math.min(Math.max(scaledWidth, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH);
      setPanelWidth(nextWidth);
    };
    const handleUp = () => {
      isResizing.current = false;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [variant, isNarrow]);

  useEffect(() => {
    const container = inputContainerRef.current;
    if (!container) return;
    const updatePadding = () => {
      const height = container.getBoundingClientRect().height;
      setContentPadding(Math.ceil(height + 40));
    };
    updatePadding();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updatePadding);
      return () => window.removeEventListener('resize', updatePadding);
    }

    const observer = new ResizeObserver(() => updatePadding());
    observer.observe(container);
    return () => observer.disconnect();
  }, [variant]);

  const handleRecommendTasks = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: '推荐与我强关联的未认领任务。', createdAt: getBeijingNow().toISOString() }]);

    if (availableIssues.length === 0) {
      setRecommendedTasks([]);
      setMessages(prev => [...prev, { role: 'ai', content: '当前没有可认领的任务。', createdAt: getBeijingNow().toISOString() }]);
      setIsLoading(false);
      setActiveQuickAction(null);
      return;
    }

    try {
      const recommendations = await recommendWorkspaceTasks({
        user: currentUser,
        myIssues,
        availableIssues,
        projects,
      });
      const mapped = recommendations
        .map(rec => {
          const issue = availableIssues.find(item => item.identifier === rec.identifier);
          return issue ? { issue, reason: rec.reason } : null;
        })
        .filter((item): item is RecommendedTask => Boolean(item));
      setRecommendedTasks(mapped);
      setMessages(prev => [
        ...prev,
        { role: 'ai', content: mapped.length ? '已整理强关联任务，见下方卡片。' : '暂时没有合适的未认领任务。', createdAt: getBeijingNow().toISOString() },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: 'ai', content: `推荐失败：${err?.message || '未知错误'}`, createdAt: getBeijingNow().toISOString() },
      ]);
    } finally {
      setIsLoading(false);
      setActiveQuickAction(null);
    }
  };

  const handleSend = async (question?: string) => {
    const query = (question ?? input).trim();
    if (!query || isLoading) return;
    setInput('');

    if (query.includes('未认领') && query.includes('推荐')) {
      await handleRecommendTasks();
      return;
    }

    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: query, createdAt: getBeijingNow().toISOString() }]);

    try {
      const answer = await answerWorkspaceQuestion({
        question: query,
        user: currentUser,
        issues: myIssues,
        projects,
      });
      setMessages(prev => [...prev, { role: 'ai', content: answer, createdAt: getBeijingNow().toISOString() }]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: 'ai', content: `请求失败：${err?.message || '未知错误'}`, createdAt: getBeijingNow().toISOString() },
      ]);
    } finally {
      setIsLoading(false);
      setActiveQuickAction(null);
    }
  };


  const containerClassName =
    variant === 'sidebar'
      ? 'shrink-0 flex flex-col border-l border-black/5 dark:border-white/10 bg-surface/60 backdrop-blur-xl rounded-r-3xl overflow-hidden relative'
      : 'w-full rounded-2xl border border-black/5 dark:border-white/10 bg-surface/70 backdrop-blur-xl shadow-sm';

  const sidebarStyle =
    variant === 'sidebar'
      ? { width: `${panelWidth * (isNarrow ? SIDEBAR_NARROW_RATIO : 1)}px` }
      : undefined;

  if (!isVisible) return null;

  return (
    <aside className={containerClassName} style={sidebarStyle}>
      {variant === 'sidebar' && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-accent/20 transition"
          onMouseDown={() => {
            isResizing.current = true;
          }}
        />
      )}
      <div className={`px-4 py-4 border-b border-black/5 dark:border-white/10 flex items-center gap-2 ${variant === 'inline' ? 'rounded-t-2xl' : ''}`}>
        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
          <MessageSquare size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-main truncate">AI 工作助手</div>
          <div className="text-[11px] text-muted truncate">为你生成可执行的行动建议</div>
        </div>
      </div>

      <div className="px-4 py-3 flex flex-wrap gap-2">
        {quickActions.map(action => (
          <button
            key={action.label}
            onClick={() => {
              if (isLoading) return;
              setActiveQuickAction(action.label);
              if (action.label === '推荐未认领任务') {
                handleRecommendTasks();
              } else {
                handleSend(action.prompt);
              }
            }}
            disabled={isLoading}
            className="text-xs px-3 py-1 rounded-full bg-accent/10 text-accent hover:bg-accent/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && activeQuickAction === action.label ? '处理中...' : action.label}
          </button>
        ))}
      </div>

      <div
        className={`flex-1 min-h-0 overflow-y-auto px-4 space-y-4 flex flex-col ${hasConversation ? 'justify-end' : 'justify-start'} ${variant === 'inline' ? 'max-h-[280px]' : ''}`}
        style={{ paddingBottom: `${contentPadding}px`, scrollPaddingBottom: `${contentPadding}px` }}
      >
        {!hasConversation && (
          <div className="text-xs text-muted leading-relaxed">
            试试让 AI 输出你的今日计划或风险提醒。所有建议都基于你当前的任务列表。
          </div>
        )}

        {messages.map((msg, idx) => {
          const referencedIssues = resolveMessageIssues(msg.content);
          return (
            <div
              key={idx}
              className={`rounded-2xl px-4 py-3 text-sm leading-6 ${msg.role === 'user' ? 'bg-accent/10 text-main ml-6' : 'bg-black/5 dark:bg-white/5 text-main mr-6'}`}
            >
              <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
              {referencedIssues.length > 0 && (
                <div className="mt-3 space-y-2">
                  {referencedIssues.map(issue => (
                    <button
                      key={issue.id}
                      onClick={() => onSelectIssue?.(issue.id)}
                      className="w-full text-left rounded-xl border border-black/5 dark:border-white/10 bg-surface/80 px-3 py-2 hover:border-accent/30 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-main truncate">{issue.title}</div>
                          <div className="text-[11px] text-muted">{projectMap.get(issue.projectId || '')?.name || '未归类'} · {issue.status} · {issue.priority}</div>
                        </div>
                        <span className="text-[10px] text-muted font-mono">{issue.identifier}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {recommendedTasks.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-muted uppercase tracking-wider">推荐任务</div>
            {recommendedTasks.map(({ issue, reason }) => (
              <div
                key={issue.id}
                className="w-full text-left border border-black/5 dark:border-white/10 rounded-xl px-3 py-2 hover:border-accent/30 transition"
              >
                <button
                  onClick={() => onSelectIssue?.(issue.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-main truncate">{issue.title}</div>
                      <div className="text-[11px] text-muted">{projectMap.get(issue.projectId || '')?.name || '未归类'} · {issue.status} · {issue.priority}</div>
                    </div>
                    <span className="text-[10px] text-muted font-mono">{issue.identifier}</span>
                  </div>
                </button>
                {reason && (
                  <div className="mt-2">
                    <div className="inline-flex max-w-full rounded-2xl border border-accent/30 bg-accent/10 text-accent px-3 py-1.5 text-[11px] font-medium leading-5 break-words shadow-sm">
                      {reason}
                    </div>
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full">强关联推荐</span>
                  <button
                    onClick={async (event) => {
                      event.stopPropagation();
                      if (!onClaimIssue) return;
                      await onClaimIssue(issue);
                      setRecommendedTasks(prev => prev.filter(item => item.issue.id !== issue.id));
                    }}
                    disabled={!onClaimIssue}
                    className="text-[10px] font-semibold text-main bg-black/5 dark:bg-white/10 px-2.5 py-1 rounded-full hover:bg-black/10 dark:hover:bg-white/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    立即认领
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="rounded-2xl px-4 py-3 text-sm text-muted bg-black/5 dark:bg-white/5 mr-6 flex items-center gap-2">
            <Sparkles size={14} className="animate-pulse" />
            正在整理建议...
          </div>
        )}
      </div>

      <div
        ref={inputContainerRef}
        className={`sticky bottom-0 p-4 pb-8 border-t border-black/5 dark:border-white/10 bg-surface/80 backdrop-blur-xl ${variant === 'inline' ? 'rounded-b-2xl' : ''}`}
      >
        <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-2xl px-3 py-2 shadow-sm">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="问 AI 你的优先事项..."
            className="flex-1 bg-transparent text-sm text-main placeholder:text-muted focus:outline-none"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-xl bg-main text-surface disabled:opacity-50 disabled:cursor-not-allowed"
            title="发送"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default WorkspaceAiPanel;
