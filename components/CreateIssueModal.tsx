
import React, { useState, useEffect, useRef } from 'react';
import { X, Sparkles, Plus, ArrowRight, FileText, CheckSquare, Trash2, RotateCcw, Inbox, Briefcase } from 'lucide-react';
import { analyzeIssueInput, analyzeProjectNote, AIAnalysisResult, AIDraftTask } from '../services/geminiService';
import { Priority, Status, Team, User, DraftIssue, Project } from '../types';
import { PriorityIcon, TeamIcon } from './Icons';
import { applyBugLabel } from '../services/bugHelpers';

interface CreateIssueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: any[]) => void | Promise<void>;
  teams: Team[];
  users: User[];
  currentTeamId?: string;
  projects: Project[];
  currentProjectId?: string;
}

const CreateIssueModal: React.FC<CreateIssueModalProps> = ({ 
  isOpen, onClose, onCreate, teams, users, currentTeamId, projects, currentProjectId 
}) => {
  const [mode, setMode] = useState<'single' | 'note'>('single');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Single Mode State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const getRequirementPoolId = () => {
    const inboxTeam = teams.find(t => t.icon === 'Inbox' || t.name.includes('收件箱'));
    return inboxTeam?.id || currentTeamId || teams[0]?.id || '';
  };

  // Default Team ID to Requirement Pool (dynamic per org)
  const [teamId, setTeamId] = useState(getRequirementPoolId());
  const [projectId, setProjectId] = useState<string>('');
  const [priority, setPriority] = useState<Priority>(Priority.NoPriority);
  const [aiSuggestions, setAiSuggestions] = useState<AIAnalysisResult | null>(null);
  const [isBug, setIsBug] = useState(false);
  const [severity, setSeverity] = useState('S2');
  const [environment, setEnvironment] = useState('prod');
  const [reproSteps, setReproSteps] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [actualResult, setActualResult] = useState('');

  // Note Mode State
  const [noteContent, setNoteContent] = useState('');
  const [draftTasks, setDraftTasks] = useState<DraftIssue[]>([]);
  const [previewMode, setPreviewMode] = useState(false); // If true, showing drafts

  const [isAnalysing, setIsAnalysing] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
        if (mode === 'single') setTimeout(() => titleInputRef.current?.focus(), 50);
        else setTimeout(() => noteInputRef.current?.focus(), 50);
        
        // Ensure we are always targeting the pool for Team
        setTeamId(getRequirementPoolId());
        // Default project to current view if available
        setProjectId(currentProjectId || '');
    } else {
        // Reset state on close
        setTitle(''); setDescription(''); setAiSuggestions(null);
        setNoteContent(''); setDraftTasks([]); setPreviewMode(false); setIsAnalysing(false);
        setIsBug(false); setSeverity('S2'); setEnvironment('prod'); setReproSteps(''); setExpectedResult(''); setActualResult('');
    }
  }, [isOpen, mode, currentProjectId]);

  // --- Single Task Logic ---
  const handleSingleAIAnalyze = async () => {
    if (!title.trim()) return;
    setIsAnalysing(true);
    
    // Get Project Context if a project is selected
    const selectedProject = projects.find(p => p.id === projectId);
    const projectContext = selectedProject?.description;

    const result = await analyzeIssueInput(`${title} ${description}`, projectContext);
    
    setIsAnalysing(false);
    if (result) {
      setAiSuggestions(result);
      setTitle(result.title);
      setDescription(result.description);
      setPriority(result.priority);
    }
  };

  const handleSingleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!title.trim()) return;
    if (!teamId) {
      alert('未找到有效团队，请先创建团队或刷新后重试。');
      return;
    }
    setIsSubmitting(true);
    try {
      const bugLabels = isBug ? applyBugLabel(aiSuggestions?.suggestedLabels || []) : (aiSuggestions?.suggestedLabels || []);
      await onCreate([{
        title, description, 
        teamId, // STRICT ENFORCEMENT
        projectId: projectId || null,
        priority, status: Status.Backlog, // Always Backlog for requirements
        labels: bugLabels,
        subtasks: aiSuggestions?.subtasks.map(t => ({ id: Math.random().toString(), title: t, completed: false })) || [],
        customFields: isBug ? {
          severity,
          environment,
          reproSteps,
          expectedResult,
          actualResult,
        } : {}
      }]);
      onClose();
    } catch (err: any) {
      alert('创建需求失败: ' + (err?.message || JSON.stringify(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Note Mode Logic ---
  const handleNoteAnalyze = async () => {
      if (!noteContent.trim()) return;
      if (!projectId) {
        alert('请先选择要拆解到的项目。');
        return;
      }
      setIsAnalysing(true);
      const selectedProject = projects.find(p => p.id === projectId);
      const drafts: AIDraftTask[] | null = await analyzeProjectNote(
        noteContent,
        teams,
        selectedProject?.name,
        selectedProject?.description
      );
      setIsAnalysing(false);

      if (drafts) {
          const mappedDrafts: DraftIssue[] = drafts.map(d => {
              return {
                  tempId: Math.random().toString(36).substr(2, 9),
                  title: d.title,
                  description: d.description,
                  teamId: getRequirementPoolId(), // STRICT ENFORCEMENT
                  projectId: projectId || null, // Inherit selected project (if note mode supports it later, currently note mode UI doesn't allow select project, assume global or none)
                  priority: d.priority as Priority,
                  status: Status.Backlog,
                  labels: d.labels || [],
                  subtasks: (d.subtasks || []).map(st => ({ id: Math.random().toString(), title: st, completed: false })),
                  assigneeId: null,
                  customFields: { branchName: d.branchName },
                  cycleId: null
              };
          });
          setDraftTasks(mappedDrafts);
          setPreviewMode(true);
      }
  };

  const handleBatchCreate = async () => {
      setIsSubmitting(true);
      try {
        await onCreate(draftTasks);
        onClose();
      } catch (err: any) {
        alert('创建需求失败: ' + (err?.message || JSON.stringify(err)));
      } finally {
        setIsSubmitting(false);
      }
  };

  const removeDraft = (tempId: string) => {
      setDraftTasks(prev => prev.filter(d => d.tempId !== tempId));
      if (draftTasks.length <= 1) setPreviewMode(false); // Go back if empty
  };

  const updateDraft = (tempId: string, updates: Partial<DraftIssue>) => {
      setDraftTasks(prev => prev.map(d => d.tempId === tempId ? { ...d, ...updates } : d));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] p-4 bg-background/40 backdrop-blur-sm transition-all duration-300">
      <div className={`w-full ${previewMode ? 'max-w-4xl' : 'max-w-2xl'} bg-surface-glass backdrop-blur-3xl border border-white/20 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[85vh] min-h-0`}>
        
        {/* Tab Switcher (Only when not in preview) */}
        {!previewMode && (
             <div className="flex border-b border-black/5 dark:border-white/5 px-6 pt-4 pb-0 gap-6">
                <button 
                    onClick={() => setMode('single')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${mode === 'single' ? 'border-accent text-main' : 'border-transparent text-muted hover:text-main'}`}
                >
                    <CheckSquare size={16} />
                    提交单个需求
                </button>
                <button 
                    onClick={() => setMode('note')}
                    className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${mode === 'note' ? 'border-accent text-main' : 'border-transparent text-muted hover:text-main'}`}
                >
                    <FileText size={16} />
                    智能拆解模式
                </button>
            </div>
        )}

        {/* --- SINGLE MODE --- */}
        {mode === 'single' && (
             <form onSubmit={handleSingleSubmit} className="flex flex-col h-full">
                <div className="relative border-b border-black/5 dark:border-white/5">
                    <input
                        ref={titleInputRef}
                        type="text"
                        placeholder="需求标题..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-transparent text-xl font-medium text-main placeholder-muted/50 px-6 py-5 focus:outline-none"
                    />
                    <button type="button" onClick={onClose} className="absolute right-4 top-5 text-muted hover:text-main">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                    {/* Team Indicator */}
                    <div className="flex flex-wrap items-center gap-2">
                         <div className="flex items-center gap-2 text-sm text-muted bg-black/5 dark:bg-white/5 px-3 py-2 rounded-lg self-start">
                             <Inbox size={14} />
                             <span>需求池 (Requirement Pool)</span>
                         </div>
                    </div>

                    <textarea
                        placeholder="描述需求背景、目标用户及核心价值..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={5}
                        className="w-full bg-transparent text-base text-main placeholder-muted/50 resize-none focus:outline-none"
                    />

                    <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-muted">
                          <input type="checkbox" checked={isBug} onChange={(e) => setIsBug(e.target.checked)} />
                          这是 Bug
                        </label>
                        {isBug && (
                          <>
                            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="bg-black/5 dark:bg-white/5 text-xs text-main px-2 py-1 rounded-lg border-none focus:ring-2 focus:ring-accent/20 cursor-pointer appearance-none">
                              {['S0','S1','S2','S3'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <select value={environment} onChange={(e) => setEnvironment(e.target.value)} className="bg-black/5 dark:bg-white/5 text-xs text-main px-2 py-1 rounded-lg border-none focus:ring-2 focus:ring-accent/20 cursor-pointer appearance-none">
                              {['prod','staging','dev'].map(env => <option key={env} value={env}>{env}</option>)}
                            </select>
                          </>
                        )}
                    </div>

                    {isBug && (
                      <div className="space-y-3">
                        <textarea value={reproSteps} onChange={(e) => setReproSteps(e.target.value)} rows={3} placeholder="复现步骤" className="w-full bg-black/5 dark:bg-white/5 rounded-lg p-3 text-sm text-main placeholder-muted/50 resize-none focus:outline-none" />
                        <textarea value={expectedResult} onChange={(e) => setExpectedResult(e.target.value)} rows={2} placeholder="期望结果" className="w-full bg-black/5 dark:bg-white/5 rounded-lg p-3 text-sm text-main placeholder-muted/50 resize-none focus:outline-none" />
                        <textarea value={actualResult} onChange={(e) => setActualResult(e.target.value)} rows={2} placeholder="实际结果" className="w-full bg-black/5 dark:bg-white/5 rounded-lg p-3 text-sm text-main placeholder-muted/50 resize-none focus:outline-none" />
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3">
                        {/* Project Selector */}
                        <div className="relative">
                             <div className="absolute left-2.5 top-1.5 pointer-events-none text-muted">
                                 <Briefcase size={14} />
                             </div>
                             <select 
                                value={projectId} 
                                onChange={(e) => setProjectId(e.target.value)} 
                                className="pl-8 bg-black/5 dark:bg-white/5 text-sm text-main px-3 py-1.5 rounded-lg border-none focus:ring-2 focus:ring-accent/20 cursor-pointer appearance-none min-w-[120px]"
                             >
                                <option value="">无项目</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Priority Selector */}
                        <div className="relative">
                             <div className="absolute left-2.5 top-1.5 pointer-events-none"><PriorityIcon priority={priority} /></div>
                             <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="pl-8 bg-black/5 dark:bg-white/5 text-sm text-main px-3 py-1.5 rounded-lg border-none focus:ring-2 focus:ring-accent/20 cursor-pointer appearance-none">
                                {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        
                        <button type="button" onClick={handleSingleAIAnalyze} disabled={isAnalysing || isSubmitting || !title} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ml-auto ${isAnalysing ? 'text-accent animate-pulse' : 'text-muted hover:text-accent hover:bg-accent/5'} ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            <Sparkles size={14} />
                            <span>AI 优化需求</span>
                        </button>
                    </div>

                    {/* AI Preview */}
                    {aiSuggestions && (
                        <div className="p-4 bg-accent/5 rounded-xl border border-accent/10 animate-fade-in">
                            <div className="flex flex-wrap gap-2">
                                {aiSuggestions.suggestedLabels.map(l => (
                                    <span key={l} className="text-xs font-semibold px-2 py-1 rounded-md bg-white dark:bg-white/10 text-accent shadow-sm">{l}</span>
                                ))}
                            </div>
                            {aiSuggestions.subtasks.length > 0 && (
                                <div className="mt-3 text-xs text-muted">
                                    + 已生成 {aiSuggestions.subtasks.length} 个建议拆解项
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 bg-black/5 dark:bg-white/5 flex justify-between items-center shrink-0">
                    <span className="text-xs text-muted">Cmd+Enter 提交</span>
                    <button type="submit" disabled={isSubmitting} className="flex items-center gap-2 bg-main text-surface px-6 py-2 rounded-xl font-semibold shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                        <Inbox size={16} />
                        <span>{isSubmitting ? '提交中...' : '提交需求'}</span>
                    </button>
                </div>
            </form>
        )}

        {/* --- NOTE MODE --- */}
        {mode === 'note' && !previewMode && (
             <div className="flex flex-col h-full p-6">
                 <button onClick={onClose} className="absolute right-4 top-4 text-muted hover:text-main">
                    <X size={20} />
                </button>
                 <h3 className="text-lg font-medium text-main mb-2">智能需求拆解</h3>
                 <p className="text-sm text-muted mb-4">输入会议纪要或粗略想法，AI 将自动分析并整理到需求池。</p>
                 
                 <div className="flex items-center gap-3 mb-4">
                    <div className="relative">
                        <div className="absolute left-2.5 top-1.5 pointer-events-none text-muted">
                            <Briefcase size={14} />
                        </div>
                        <select 
                            value={projectId} 
                            onChange={(e) => setProjectId(e.target.value)} 
                            className="pl-8 bg-black/5 dark:bg-white/5 text-sm text-main px-3 py-1.5 rounded-lg border-none focus:ring-2 focus:ring-accent/20 cursor-pointer appearance-none min-w-[160px]"
                        >
                            <option value="">请选择项目</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.icon} {p.name}</option>
                            ))}
                        </select>
                    </div>
                    <span className="text-xs text-muted">拆解将绑定所选项目</span>
                 </div>
                 
                 <textarea
                    ref={noteInputRef}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="例如：落地页改版项目..."
                    className="flex-1 w-full bg-black/5 dark:bg-white/5 rounded-xl p-4 text-base text-main placeholder-muted/50 resize-none focus:outline-none focus:ring-2 focus:ring-accent/20 mb-4"
                 />

                 <div className="flex justify-end">
                     <button 
                        onClick={handleNoteAnalyze}
                        disabled={isAnalysing || isSubmitting || !noteContent.trim() || !projectId}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold shadow-lg transition-all ${
                            isAnalysing ? 'bg-accent/10 text-accent cursor-not-allowed' : 'bg-main text-surface hover:scale-[1.02]'
                        }`}
                     >
                        <Sparkles size={16} className={isAnalysing ? 'animate-spin' : ''} />
                        <span>{isAnalysing ? '正在分析...' : '开始拆解'}</span>
                     </button>
                 </div>
             </div>
        )}

        {/* --- NOTE PREVIEW MODE --- */}
        {mode === 'note' && previewMode && (
             <div className="flex flex-col flex-1 min-h-0">
                 <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5">
                     <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent">
                             <Sparkles size={16} />
                         </div>
                         <div>
                            <h3 className="text-base font-semibold text-main">已识别 {draftTasks.length} 个需求项</h3>
                            <p className="text-xs text-muted">已绑定项目：{projects.find(p => p.id === projectId)?.name || '未选择'}</p>
                         </div>
                     </div>
                     <button onClick={() => setPreviewMode(false)} className="text-sm text-muted hover:text-main flex items-center gap-1">
                        <RotateCcw size={14} />
                        重新编辑
                     </button>
                 </div>

                 <div className="flex-1 min-h-0 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-background/50">
                     {draftTasks.map((draft) => (
                         <div key={draft.tempId} className="bg-surface border border-black/5 dark:border-white/10 rounded-xl p-4 shadow-sm group hover:border-accent/30 transition-all">
                             <div className="flex justify-between items-start mb-2">
                                <input 
                                    value={draft.title}
                                    onChange={(e) => updateDraft(draft.tempId, { title: e.target.value })}
                                    className="bg-transparent font-medium text-main text-sm w-full focus:outline-none focus:underline"
                                />
                                <button onClick={() => removeDraft(draft.tempId)} className="text-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                    <Trash2 size={14} />
                                </button>
                             </div>
                            
                             <textarea
                                value={draft.description}
                                onChange={(e) => updateDraft(draft.tempId, { description: e.target.value })}
                                rows={2}
                                className="w-full bg-transparent text-xs text-muted resize-none focus:outline-none mb-3"
                             />

                             <input
                                value={(draft.customFields?.branchName || '') as string}
                                onChange={(e) => updateDraft(draft.tempId, { customFields: { ...draft.customFields, branchName: e.target.value } })}
                                placeholder="分支名 (kebab-case)"
                                className="w-full bg-transparent text-[11px] text-main placeholder-muted/50 border border-black/5 dark:border-white/10 rounded-lg px-2 py-1 mb-3 focus:outline-none focus:ring-2 focus:ring-accent/20"
                             />

                             <div className="flex items-center gap-2">
                                 {/* Locked to Requirement Pool visually */}
                                 <div className="flex items-center gap-1 text-[10px] bg-black/5 dark:bg-white/5 px-2 py-1 rounded text-muted">
                                     <Inbox size={10} />
                                     需求池
                                 </div>

                                 <select 
                                    value={draft.priority}
                                    onChange={(e) => updateDraft(draft.tempId, { priority: e.target.value as Priority })}
                                    className="bg-black/5 dark:bg-white/5 text-[10px] text-main px-2 py-1 rounded border-none cursor-pointer"
                                 >
                                     {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                                 </select>
                                 
                                 {draft.subtasks.length > 0 && (
                                     <span className="text-[10px] text-muted flex items-center gap-1 ml-auto">
                                         <CheckSquare size={10} /> {draft.subtasks.length}
                                     </span>
                                 )}
                             </div>
                         </div>
                     ))}
                 </div>

                 <div className="px-6 py-4 bg-surface border-t border-black/5 dark:border-white/5 flex justify-end gap-3 shrink-0">
                     <button onClick={() => setPreviewMode(false)} className="px-4 py-2 text-sm text-muted hover:text-main">
                         返回
                     </button>
                     <button onClick={handleBatchCreate} disabled={isSubmitting} className="bg-main text-surface px-6 py-2 rounded-xl font-semibold shadow-lg text-sm hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                         {isSubmitting ? '提交中...' : `确认提交全部 (${draftTasks.length})`}
                     </button>
                 </div>
             </div>
        )}
      </div>
    </div>
  );
};

export default CreateIssueModal;
