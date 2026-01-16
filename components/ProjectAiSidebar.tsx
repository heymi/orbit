import React, { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, Send, Sparkles } from 'lucide-react';
import { Issue, Project, User } from '../types';
import { answerProjectQuestion } from '../services/geminiService';

interface ProjectAiSidebarProps {
  project: Project;
  issues: Issue[];
  users: User[];
}

type ChatMessage = {
  role: 'user' | 'ai';
  content: string;
};

const ProjectAiSidebar: React.FC<ProjectAiSidebarProps> = ({ project, issues, users }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const projectIssues = useMemo(
    () => issues.filter(i => i.projectId === project.id),
    [issues, project.id]
  );

  useEffect(() => {
    const stored = localStorage.getItem(`project_chat_${project.id}`);
    if (stored) {
      try {
        setMessages(JSON.parse(stored) as ChatMessage[]);
      } catch {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [project.id]);

  useEffect(() => {
    localStorage.setItem(`project_chat_${project.id}`, JSON.stringify(messages));
  }, [messages, project.id]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isLoading) return;
    setInput('');
    setIsLoading(true);
    setMessages(prev => [...prev, { role: 'user', content: question }]);

    try {
      const answer = await answerProjectQuestion({
        question,
        project,
        issues: projectIssues,
        users,
      });
      setMessages(prev => [...prev, { role: 'ai', content: answer }]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: 'ai', content: `请求失败：${err?.message || '未知错误'}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <aside className="hidden xl:flex w-[340px] max-[1800px]:w-[272px] shrink-0 flex-col border-l border-black/5 dark:border-white/10 bg-surface/60 backdrop-blur-xl rounded-r-3xl overflow-hidden">
      <div className="px-4 py-4 border-b border-black/5 dark:border-white/10 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
          <MessageSquare size={16} />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-main truncate">项目问答</div>
          <div className="text-[11px] text-muted truncate">{project.name}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-xs text-muted leading-relaxed">
            可提问本项目需求、状态、范围等。回答仅基于项目背景与任务信息，未知会明确说明。
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`rounded-2xl px-3 py-2 text-sm leading-6 ${msg.role === 'user' ? 'bg-accent/10 text-main ml-6' : 'bg-black/5 dark:bg-white/5 text-main mr-6'}`}>
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ))}

        {isLoading && (
          <div className="rounded-2xl px-3 py-2 text-sm text-muted bg-black/5 dark:bg-white/5 mr-6 flex items-center gap-2">
            <Sparkles size={14} className="animate-pulse" />
            正在思考...
          </div>
        )}
      </div>

      <div className="p-3 border-t border-black/5 dark:border-white/10">
        <div className="flex items-center gap-2 bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="针对项目提问..."
            className="flex-1 bg-transparent text-sm text-main placeholder:text-muted focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 rounded-lg bg-main text-surface disabled:opacity-50 disabled:cursor-not-allowed"
            title="发送"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default ProjectAiSidebar;
