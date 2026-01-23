import React from 'react';
import { Project } from '../types';
import { MessageSquare, Layers, Plus, ProjectIcon } from './Icons';

export type SidebarMode = 'project' | 'chat';

interface NarrowSidebarProps {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  projects: Project[];
  currentProjectId: string | null;
  onProjectSelect: (projectId: string) => void;
  onCreateProject: () => void;
  orgInitial: string;
  totalUnread?: number;
}

const NarrowSidebar: React.FC<NarrowSidebarProps> = ({
  mode,
  onModeChange,
  projects,
  currentProjectId,
  onProjectSelect,
  onCreateProject,
  orgInitial,
  totalUnread = 0,
}) => {
  return (
    <div className="w-16 flex-shrink-0 flex flex-col items-center py-4 bg-black/5 dark:bg-white/5 rounded-2xl">
      {/* Org Avatar */}
      <div className="mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-lg font-bold shadow-md">
          {orgInitial}
        </div>
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-black/10 dark:bg-white/10 mb-4" />

      {/* Mode Switchers */}
      <div className="flex flex-col items-center gap-2 mb-4">
        {/* Project Mode */}
        <button
          onClick={() => onModeChange('project')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            mode === 'project'
              ? 'bg-accent text-white shadow-md'
              : 'text-muted hover:bg-black/5 dark:hover:bg-white/10 hover:text-main'
          }`}
          title="Projects"
        >
          <Layers size={20} />
        </button>

        {/* Chat Mode */}
        <button
          onClick={() => onModeChange('chat')}
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all relative ${
            mode === 'chat'
              ? 'bg-accent text-white shadow-md'
              : 'text-muted hover:bg-black/5 dark:hover:bg-white/10 hover:text-main'
          }`}
          title="Chat"
        >
          <MessageSquare size={20} />
          {totalUnread > 0 && mode !== 'chat' && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="w-8 h-px bg-black/10 dark:bg-white/10 mb-4" />

      {/* Project Shortcuts (only in project mode) */}
      {mode === 'project' && (
        <div className="flex-1 flex flex-col items-center gap-2 overflow-y-auto w-full px-3">
          {projects.slice(0, 8).map((project) => {
            const isActive = project.id === currentProjectId;
            return (
              <button
                key={project.id}
                onClick={() => onProjectSelect(project.id)}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all ${
                  isActive
                    ? 'bg-accent/20 ring-2 ring-accent shadow-sm'
                    : 'bg-surface hover:bg-black/5 dark:hover:bg-white/10'
                }`}
                title={project.name}
              >
                <ProjectIcon icon={project.icon} className="w-5 h-5" />
              </button>
            );
          })}

          {/* Add Project Button */}
          <button
            onClick={onCreateProject}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/10 transition-all border-2 border-dashed border-black/10 dark:border-white/10"
            title="Create project"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {/* Spacer for chat mode */}
      {mode === 'chat' && <div className="flex-1" />}
    </div>
  );
};

export default NarrowSidebar;
