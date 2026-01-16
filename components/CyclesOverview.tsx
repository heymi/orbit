import React from 'react';
import { CalendarRange, ChevronRight, Edit3, Plus, Repeat } from 'lucide-react';
import { Cycle, Issue, Status } from '../types';
import { buildBurndownSeries } from '../services/burndown';

interface CyclesOverviewProps {
  cycles: Cycle[];
  issues: Issue[];
  onCreate: () => void;
  onEdit: (cycle: Cycle) => void;
  onSelect: (cycleId: string) => void;
}

const CyclesOverview: React.FC<CyclesOverviewProps> = ({ cycles, issues, onCreate, onEdit, onSelect }) => {
  const sortedCycles = [...cycles].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const now = new Date();

  const formatRange = (cycle: Cycle) => {
    const start = cycle.startDate.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    const end = cycle.endDate.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
    return `${start} - ${end}`;
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="h-16 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Repeat size={20} className="text-accent" />
          <h1 className="text-2xl font-bold tracking-tight text-main">迭代</h1>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 bg-main text-surface hover:scale-[1.02] active:scale-95 transition-all px-4 py-2 rounded-xl shadow-lg font-medium text-sm"
        >
          <Plus size={16} />
          新建迭代
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {sortedCycles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted animate-fade-in">
            <CalendarRange size={48} className="opacity-20 mb-4" />
            <p>暂无迭代</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sortedCycles.map(cycle => {
              const cycleIssues = issues.filter(i => i.cycleId === cycle.id);
              const doneCount = cycleIssues.filter(i => i.status === Status.Done || i.status === Status.Closed).length;
              const totalCount = cycleIssues.length;
              const progress = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
              const phase = now < cycle.startDate ? '未开始' : now > cycle.endDate ? '已结束' : '进行中';
              const phaseStyle = phase === '进行中' ? 'bg-accent/10 text-accent' : phase === '未开始' ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600';
              const burndown = buildBurndownSeries(cycle, issues);
              const maxValue = Math.max(totalCount, 1);
              const buildPath = (key: 'remaining' | 'ideal') => {
                if (burndown.length < 2) return '';
                return burndown.map((point, index) => {
                  const x = (index / (burndown.length - 1)) * 100;
                  const value = point[key];
                  const y = 100 - (value / maxValue) * 100;
                  return `${index === 0 ? 'M' : 'L'} ${x},${y}`;
                }).join(' ');
              };

              return (
                <div key={cycle.id} className="group relative rounded-2xl border border-black/5 dark:border-white/10 bg-surface-glass backdrop-blur-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-main">{cycle.name}</h2>
                        {cycle.isReleased && (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            已发布
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                        <CalendarRange size={14} />
                        <span>{formatRange(cycle)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${phaseStyle}`}>
                          {phase}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onEdit(cycle)}
                        className="p-2 rounded-lg text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        title="编辑迭代"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => onSelect(cycle.id)}
                        className="p-2 rounded-lg text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                        title="打开迭代"
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>

                  {cycle.description && (
                    <p className="mt-3 text-sm text-muted leading-relaxed line-clamp-2">{cycle.description}</p>
                  )}

                  <div className="mt-4 rounded-xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-white/5 p-3">
                    <div className="flex items-center justify-between text-xs text-muted mb-2">
                      <span>燃尽趋势</span>
                      <span>{doneCount}/{totalCount}</span>
                    </div>
                    <div className="h-16 w-full">
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <path d="M 0,100 L 100,100" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
                        <path d="M 0,0 L 0,100" stroke="rgba(0,0,0,0.04)" strokeWidth="1" />
                        {burndown.length > 1 && (
                          <>
                            <path d={buildPath('ideal')} fill="none" stroke="rgba(0,0,0,0.18)" strokeDasharray="4 4" strokeWidth="2" />
                            <path d={buildPath('remaining')} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
                          </>
                        )}
                      </svg>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-accent"></span>实际</span>
                      <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-black/30"></span>理想</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">迭代目标</div>
                    {cycle.goals && cycle.goals.length > 0 ? (
                      <ul className="space-y-1 text-sm text-main">
                        {cycle.goals.slice(0, 4).map((goal, index) => (
                          <li key={`${cycle.id}-goal-${index}`} className="flex items-start gap-2">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent/70"></span>
                            <span className="line-clamp-2">{goal}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-xs text-muted bg-black/5 dark:bg-white/5 rounded-lg px-2 py-1.5">暂无目标</div>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted mb-2">
                      <span>完成进度</span>
                      <span>{doneCount}/{totalCount}</span>
                    </div>
                    <div className="h-2 rounded-full bg-black/5 dark:bg-white/10 overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default CyclesOverview;
