import React from 'react';
import { ChatChannel } from '../types';
import { Hash, MessageSquare, Plus } from './Icons';

interface ChatChannelsPaneProps {
  channels: ChatChannel[];
  currentChannelId: string | null;
  onSelect: (id: string) => void;
  unreadByChannel: Record<string, number>;
  loading?: boolean;
}

const ChatChannelsPane: React.FC<ChatChannelsPaneProps> = ({
  channels,
  currentChannelId,
  onSelect,
  unreadByChannel,
  loading,
}) => {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider">
            Channels
          </h2>
          <button
            className="text-muted hover:text-main transition-colors opacity-0 group-hover:opacity-100"
            title="Create channel"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Channel List */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {loading && channels.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted text-center">
            Loading channels...
          </div>
        ) : channels.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted text-center">
            No channels yet
          </div>
        ) : (
          channels.map((channel) => {
            const isActive = channel.id === currentChannelId;
            const unread = unreadByChannel[channel.id] || 0;
            return (
              <button
                key={channel.id}
                onClick={() => onSelect(channel.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-accent/10 text-accent font-medium'
                    : 'text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-main'
                }`}
              >
                <Hash size={16} className={isActive ? 'text-accent' : 'text-muted'} />
                <span className="truncate flex-1 text-left">{channel.name.toLowerCase()}</span>
                {unread > 0 && (
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-accent text-white rounded-full min-w-[20px] text-center">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            );
          })
        )}
      </nav>
    </div>
  );
};

export default ChatChannelsPane;
