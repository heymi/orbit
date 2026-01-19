import React, { useEffect, useState } from 'react';
import { X, Repeat } from 'lucide-react';
import { Cycle } from '../types';
import { BEIJING_TIME_ZONE, getBeijingNow } from '../constants';

interface CreateCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cycle: Cycle) => void | Promise<void>;
  existingCycle?: Cycle | null;
}

const toInputDate = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: BEIJING_TIME_ZONE });

const CreateCycleModal: React.FC<CreateCycleModalProps> = ({ isOpen, onClose, onSave, existingCycle }) => {
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [isReleased, setIsReleased] = useState(false);
  const [goals, setGoals] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isComposing, setIsComposing] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (existingCycle) {
      setName(existingCycle.name);
      setStartDate(toInputDate(existingCycle.startDate));
      setEndDate(toInputDate(existingCycle.endDate));
      setDescription(existingCycle.description || '');
      setIsReleased(!!existingCycle.isReleased);
      setGoals(existingCycle.goals || []);
    } else {
      const start = getBeijingNow();
      const end = getBeijingNow();
      end.setDate(start.getDate() + 13);
      setName('');
      setStartDate(toInputDate(start));
      setEndDate(toInputDate(end));
      setDescription('');
      setIsReleased(false);
      setGoals([]);
    }
  }, [isOpen, existingCycle]);

  const updateGoal = (index: number, value: string) => {
    setGoals(prev => prev.map((goal, i) => (i === index ? value : goal)));
  };

  const handleGoalKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      addGoal();
    }
  };

  const addGoal = () => {
    setGoals(prev => [...prev, '']);
  };

  const removeGoal = (index: number) => {
    setGoals(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!name.trim()) return;
    if (!startDate || !endDate) return;
    const parsedStart = new Date(`${startDate}T00:00:00+08:00`);
    const parsedEnd = new Date(`${endDate}T00:00:00+08:00`);
    if (parsedStart.getTime() > parsedEnd.getTime()) {
      alert('结束日期不能早于开始日期。');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        id: existingCycle ? existingCycle.id : Math.random().toString(36).slice(2, 9),
        name: name.trim(),
        startDate: parsedStart,
        endDate: parsedEnd,
        description: description.trim() || undefined,
        isReleased,
        goals: goals.map(goal => goal.trim()).filter(Boolean),
      });
      onClose();
    } catch (err: any) {
      alert(err?.message || '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface border border-black/5 dark:border-white/10 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5">
          <h2 className="text-lg font-bold text-main flex items-center gap-2">
            <Repeat size={18} className="text-accent" />
            {existingCycle ? '编辑迭代' : '创建迭代'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-main transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5">
          <div>
            <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">迭代名称</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
              placeholder="例如: Sprint 12"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">开始日期</label>
              <input
                required
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">结束日期</label>
              <input
                required
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">迭代说明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[90px]"
              placeholder="本迭代目标、范围或风险说明"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-muted uppercase tracking-wider">迭代目标</label>
              <button
                type="button"
                onClick={addGoal}
                className="text-xs font-medium text-accent hover:text-accent/80"
              >
                + 添加目标
              </button>
            </div>
            <div className="space-y-2">
              {goals.length === 0 && (
                <div className="text-xs text-muted bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2">
                  暂无目标，添加 2-4 条会更清晰。
                </div>
              )}
              {goals.map((goal, index) => (
                <div key={`${index}`} className="flex items-center gap-2">
                  <input
                     value={goal}
                     onChange={(e) => updateGoal(index, e.target.value)}
                     onKeyDown={handleGoalKeyDown}
                     onCompositionStart={() => setIsComposing(true)}
                     onCompositionEnd={(e) => {
                       setIsComposing(false);
                       updateGoal(index, (e.target as HTMLInputElement).value);
                     }}
                     className="flex-1 bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2 text-sm text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
                     placeholder={`目标 ${index + 1}`}
                   />

                  <button
                    type="button"
                    onClick={() => removeGoal(index)}
                    className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="删除目标"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={isReleased}
              onChange={(e) => setIsReleased(e.target.checked)}
              className="accent-accent"
            />
            标记为已发布
          </label>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 transition-colors">取消</button>
            <button type="submit" disabled={isSaving} className={`px-4 py-2 text-sm rounded-xl transition-all shadow ${isSaving ? 'bg-black/10 text-muted cursor-not-allowed' : 'bg-main text-surface hover:scale-[1.02] active:scale-95'}`}>保存</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCycleModal;
