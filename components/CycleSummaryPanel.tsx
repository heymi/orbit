import React from 'react';
import { CalendarRange, Target } from 'lucide-react';
import { Cycle, Issue, Status } from '../types';
import { formatBeijingDate } from '../constants';
import { buildBurndownSeries } from '../services/burndown';

interface CycleSummaryPanelProps {
  cycle: Cycle;
  issues: Issue[];
}

const CycleSummaryPanel: React.FC<CycleSummaryPanelProps> = ({ cycle, issues }) => {
  const cycleIssues = issues.filter(issue => issue.cycleId === cycle.id);
  const doneCount = cycleIssues.filter(i => i.status === Status.Done || i.status === Status.Closed).length;
  const totalCount = cycleIssues.length;
  const progress = totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100);
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
    <div className="mx-2 mb-4 rounded-2xl border border-black/5 dark:border-white/10 bg-surface-glass backdrop-blur-xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-muted uppercase tracking-wider">
            <Target size={14} />
            迭代目标
          </div>
          {cycle.goals && cycle.goals.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-main">
              {cycle.goals.slice(0, 3).map((goal, index) => (
                <li key={`${cycle.id}-goal-${index}`} className="flex items-start gap-2">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-accent/70"></span>
                  <span className="line-clamp-2">{goal}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 text-xs text-muted">暂无目标</div>
          )}
        </div>
        <div className="text-right text-xs text-muted">
          <div className="flex items-center justify-end gap-2">
            <CalendarRange size={14} />
            <span>
              {formatBeijingDate(cycle.startDate, { month: '2-digit', day: '2-digit' }, 'zh-CN')} - {formatBeijingDate(cycle.endDate, { month: '2-digit', day: '2-digit' }, 'zh-CN')}
            </span>
          </div>
          <div className="mt-2 text-sm text-main font-medium">{doneCount}/{totalCount} 完成</div>
          <div className="mt-1 h-1.5 w-40 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>

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
    </div>
  );
};

export default CycleSummaryPanel;
