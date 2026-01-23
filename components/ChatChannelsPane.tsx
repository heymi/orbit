import React, { useMemo, useState } from 'react';
import { ChatChannel, User } from '../types';
import { Hash, MessageSquare, Plus } from './Icons';
import { resolveAvatarUrl } from '../services/avatar';

interface ChatChannelsPaneProps {
  publicChannels: ChatChannel[];
  directMessages: ChatChannel[];
  currentChannelId: string | null;
  onSelect: (id: string) => void;
  unreadByChannel: Record<string, number>;
  loading?: boolean;
  users: User[];
  currentUserId: string;
  onStartDm: (userId: string) => void;
  onCreateChannel: (name: string, slug: string, description?: string) => Promise<void>;
}

const ChatChannelsPane: React.FC<ChatChannelsPaneProps> = ({
  publicChannels,
  directMessages,
  currentChannelId,
  onSelect,
  unreadByChannel,
  loading,
  users,
  currentUserId,
  onStartDm,
  onCreateChannel,
}) => {
  const [showDmPicker, setShowDmPicker] = useState(false);
  const [dmSearch, setDmSearch] = useState('');
  const [showChannelForm, setShowChannelForm] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelSlug, setChannelSlug] = useState('');

  const slugify = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

  const handleChannelNameChange = (value: string) => {
    setChannelName(value);
    setChannelSlug(slugify(value));
  };

  const handleCreateChannel = async () => {
    if (!channelName.trim() || !channelSlug.trim()) return;
    await onCreateChannel(channelName.trim(), channelSlug.trim());
    setChannelName('');
    setChannelSlug('');
    setShowChannelForm(false);
  };

  const dmCandidates = useMemo(() => {
    const query = dmSearch.trim().toLowerCase();
    return users
      .filter((user) => user.id !== currentUserId)
      .filter((user) => {
        if (!query) return true;
        return (
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query)
        );
      })
      .slice(0, 8);
  }, [users, currentUserId, dmSearch]);

  const getDmLabel = (channel: ChatChannel) => {
    const peer = users.find((u) => u.id === channel.dmPeerId);
    return peer?.name || peer?.email || 'Direct message';
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider">
            Channels
          </h2>
          <button
            className="text-muted hover:text-main transition-colors"
            title="Create channel"
            onClick={() => setShowChannelForm((prev) => !prev)}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {showChannelForm && (
        <div className="px-4 pb-3">
          <div className="rounded-xl border border-black/10 dark:border-white/10 bg-surface/80 p-3">
            <div className="text-xs font-semibold text-main mb-2">New channel</div>
            <input
              value={channelName}
              onChange={(event) => handleChannelNameChange(event.target.value)}
              placeholder="Channel name"
              className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-background text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
            <div className="mt-2 text-[11px] text-muted">Slug: {channelSlug || 'auto'}</div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowChannelForm(false)}
                className="text-xs text-muted hover:text-main"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateChannel}
                disabled={!channelName.trim() || !channelSlug.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent text-white disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Channel List */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {loading && publicChannels.length === 0 && directMessages.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted text-center">
            Loading channels...
          </div>
        ) : publicChannels.length === 0 && directMessages.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted text-center">
            No channels yet
          </div>
        ) : (
          <>
            {publicChannels.map((channel) => {
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
                  <span className="truncate flex-1 text-left">
                    {channel.name.toLowerCase()}
                  </span>
                  {unread > 0 && (
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-accent text-white rounded-full min-w-[20px] text-center">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                </button>
              );
            })}

            <div className="px-3 pt-4 pb-1 text-[11px] font-bold text-muted uppercase tracking-wider">
              Direct messages
            </div>

            {directMessages.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">No direct messages</div>
            ) : (
              directMessages.map((channel) => {
                const isActive = channel.id === currentChannelId;
                const unread = unreadByChannel[channel.id] || 0;
                const peer = users.find((u) => u.id === channel.dmPeerId);
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
                    <img
                      src={resolveAvatarUrl(peer?.name || 'User', peer?.avatarUrl)}
                      alt=""
                      className="w-5 h-5 rounded-full"
                    />
                    <span className="truncate flex-1 text-left">
                      {getDmLabel(channel)}
                    </span>
                    {unread > 0 && (
                      <span className="px-1.5 py-0.5 text-xs font-medium bg-accent text-white rounded-full min-w-[20px] text-center">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </button>
                );
              })
            )}

            <div className="px-3 pt-4 pb-1 text-[11px] font-bold text-muted uppercase tracking-wider">
              <div className="flex items-center justify-between">
                <span>People</span>
                <button
                  onClick={() => setShowDmPicker((prev) => !prev)}
                  className="text-muted hover:text-main transition-colors"
                  title="Start a direct message"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
            {showDmPicker && (
              <div className="px-1 pb-2">
                <div className="rounded-xl border border-black/10 dark:border-white/10 bg-surface/80 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare size={14} className="text-muted" />
                    <span className="text-xs font-semibold text-main">Start a DM</span>
                  </div>
                  <input
                    value={dmSearch}
                    onChange={(event) => setDmSearch(event.target.value)}
                    placeholder="Search teammates..."
                    className="w-full px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 bg-background text-sm text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
                    {dmCandidates.length === 0 ? (
                      <div className="text-xs text-muted px-2 py-2">No matches</div>
                    ) : (
                      dmCandidates.map((user) => (
                        <button
                          key={user.id}
                          onClick={() => {
                            onStartDm(user.id);
                            setShowDmPicker(false);
                            setDmSearch('');
                          }}
                          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-main hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <img
                            src={resolveAvatarUrl(user.name || user.email, user.avatarUrl)}
                            alt=""
                            className="w-6 h-6 rounded-full"
                          />
                          <div className="flex-1 text-left">
                            <div className="font-medium text-sm text-main">{user.name}</div>
                            <div className="text-[11px] text-muted">{user.email}</div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
            {users.filter((u) => u.id !== currentUserId).length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted">No teammates yet</div>
            ) : (
              users
                .filter((user) => user.id !== currentUserId)
                .slice(0, 12)
                .map((user) => (
                  <button
                    key={user.id}
                    onClick={() => onStartDm(user.id)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted hover:bg-black/5 dark:hover:bg-white/5 hover:text-main"
                  >
                    <img
                      src={resolveAvatarUrl(user.name || user.email, user.avatarUrl)}
                      alt=""
                      className="w-5 h-5 rounded-full"
                    />
                    <span className="truncate flex-1 text-left">{user.name}</span>
                  </button>
                ))
            )}
          </>
        )}
      </nav>
    </div>
  );
};

export default ChatChannelsPane;
