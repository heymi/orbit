
import React, { useState, useEffect } from 'react';
import { X, Briefcase, Trash2, Sparkles, RefreshCw, AlignLeft } from 'lucide-react';
import { Project } from '../types';
import { suggestProjectEmoji } from '../services/geminiService';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: Project) => void | Promise<void>;
  onDelete?: (id: string) => void | Promise<void>;
  existingProject?: Project | null;
}

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ 
  isOpen, onClose, onSave, onDelete, existingProject 
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('📁');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (existingProject) {
        setName(existingProject.name);
        setDescription(existingProject.description || '');
        setIcon(existingProject.icon || '📁');
      } else {
        // Reset for create mode
        setName('');
        setDescription('');
        setIcon('📁');
      }
    }
  }, [isOpen, existingProject]);

  const handleGenerateEmoji = async () => {
      if (!name) return;
      setIsGenerating(true);
      const emoji = await suggestProjectEmoji(name, description);
      if (emoji) setIcon(emoji);
      setIsGenerating(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave({
      id: existingProject ? existingProject.id : Math.random().toString(36).substr(2, 9),
      name,
      description,
      icon,
      // Color is removed
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface border border-black/5 dark:border-white/10 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/5 dark:border-white/5">
           <h2 className="text-lg font-bold text-main flex items-center gap-2">
               <Briefcase size={20} className="text-accent" />
               {existingProject ? '编辑项目' : '创建新项目'}
           </h2>
           <button onClick={onClose} className="text-muted hover:text-main transition-colors">
               <X size={20} />
           </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
            <div className="space-y-6">
                {/* Emoji Preview & Generator */}
                <div className="flex flex-col items-center justify-center mb-6">
                     <div className="w-24 h-24 rounded-3xl bg-black/5 dark:bg-white/5 flex items-center justify-center text-6xl shadow-inner border border-black/5 dark:border-white/5 relative group">
                         {icon}
                         {/* Manual Input Overlay */}
                         <input 
                            type="text" 
                            value={icon}
                            onChange={(e) => setIcon(e.target.value)}
                            maxLength={2}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer text-center bg-transparent"
                            title="点击手动修改"
                         />
                     </div>
                     <button 
                        type="button"
                        onClick={handleGenerateEmoji}
                        disabled={isGenerating || !name}
                        className="mt-3 flex items-center gap-2 text-xs font-medium text-accent hover:text-accent/80 bg-accent/5 hover:bg-accent/10 px-3 py-1.5 rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                     >
                        {isGenerating ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        {isGenerating ? 'AI 思考中...' : 'AI 智能匹配图标'}
                     </button>
                </div>

                {/* Name */}
                <div>
                    <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">项目名称</label>
                    <input 
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
                        placeholder="例如: iOS App 2.0"
                        autoFocus
                    />
                </div>

                {/* Description / Context */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-muted uppercase tracking-wider">项目背景 / 上下文</label>
                        <div className="flex items-center gap-1 text-[10px] text-accent bg-accent/5 px-1.5 py-0.5 rounded">
                            <Sparkles size={10} />
                            AI 将基于此优化任务分析
                        </div>
                    </div>
                    <textarea 
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={5}
                        className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-3 text-main focus:outline-none focus:ring-2 focus:ring-accent/20 resize-none text-sm leading-relaxed"
                        placeholder="描述项目的核心目标、技术栈 (例如: React, Supabase)、受众群体或任何特殊的业务规则。越详细，AI 生成的任务就越精准。"
                    />
                </div>
            </div>

            <div className="pt-8 flex items-center justify-between">
                {existingProject && onDelete ? (
                    <button 
                        type="button"
                        onClick={() => { if(confirm('确定删除此项目? 关联的任务将被保留但不再归属于此项目。')) onDelete(existingProject.id); }}
                        className="flex items-center gap-1.5 text-red-500 hover:text-red-600 text-sm font-medium px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 size={16} />
                        删除
                    </button>
                ) : <div></div>}
                
                <div className="flex items-center gap-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted hover:text-main">
                        取消
                    </button>
                    <button type="submit" className="bg-main text-surface px-6 py-2 rounded-xl font-semibold shadow-lg hover:scale-[1.02] active:scale-95 transition-all text-sm">
                        {existingProject ? '保存修改' : '创建项目'}
                    </button>
                </div>
            </div>
        </form>
      </div>
    </div>
  );
};

export default CreateProjectModal;
