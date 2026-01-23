import React, { useState, useEffect, useRef, useCallback } from 'react';
import { User, ChatChannel, ChatMessage } from '../types';
import { Hash, Send, Loader2, MessageSquare } from './Icons';
import { resolveAvatarUrl } from '../services/avatar';
import { formatBeijingTime, formatBeijingDate } from '../constants';

interface ChatMessagesPaneProps {
  channel: ChatChannel | null;
  messages: ChatMessage[];
  users: User[];
  currentUserId: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSend: (body: string) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  typingUserIds: string[];
  onlineUserIds: string[];
}

// ============ Message List ============

interface MessageListProps {
  messages: ChatMessage[];
  users: User[];
  currentUserId: string;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  typingUserIds: string[];
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  users,
  currentUserId,
  loading,
  hasMore,
  onLoadMore,
  typingUserIds,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevMessagesLengthRef = useRef(messages.length);

  const getUserById = useCallback(
    (id: string) => users.find((u) => u.id === id),
    [users]
  );

  // Auto-scroll to bottom on new messages if already at bottom
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, isAtBottom]);

  // Track scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 50;
    setIsAtBottom(atBottom);

    // Load more when scrolled to top
    if (scrollTop < 100 && hasMore && !loading) {
      onLoadMore();
    }
  }, [hasMore, loading, onLoadMore]);

  // Group messages by date
  const groupedMessages: { date: string; messages: ChatMessage[] }[] = [];
  let currentDate = '';
  messages.forEach((msg) => {
    const dateStr = formatBeijingDate(msg.createdAt);
    if (dateStr !== currentDate) {
      currentDate = dateStr;
      groupedMessages.push({ date: dateStr, messages: [] });
    }
    groupedMessages[groupedMessages.length - 1].messages.push(msg);
  });

  const typingUsers = typingUserIds
    .map((id) => getUserById(id))
    .filter(Boolean)
    .map((u) => u!.name);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-4 space-y-4"
    >
      {loading && messages.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-muted" />
        </div>
      )}

      {hasMore && messages.length > 0 && (
        <div className="flex justify-center py-2">
          <button
            onClick={onLoadMore}
            disabled={loading}
            className="text-xs text-muted hover:text-main transition-colors"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              'Load more'
            )}
          </button>
        </div>
      )}

      {groupedMessages.map((group) => (
        <div key={group.date}>
          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-black/5 dark:bg-white/10" />
            <span className="text-xs text-muted font-medium">{group.date}</span>
            <div className="flex-1 h-px bg-black/5 dark:bg-white/10" />
          </div>

          <div className="space-y-3">
            {group.messages.map((msg, idx) => {
              const user = getUserById(msg.userId);
              const isMe = msg.userId === currentUserId;
              const prevMsg = idx > 0 ? group.messages[idx - 1] : null;
              const isSameUser = prevMsg?.userId === msg.userId;
              const timeDiff = prevMsg
                ? msg.createdAt.getTime() - prevMsg.createdAt.getTime()
                : Infinity;
              const showHeader = !isSameUser || timeDiff > 5 * 60 * 1000; // 5 minutes

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${showHeader ? 'mt-4' : 'mt-0.5'}`}
                >
                  {showHeader ? (
                    <img
                      src={resolveAvatarUrl(user?.name || 'User', user?.avatarUrl)}
                      alt=""
                      className="w-8 h-8 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    {showHeader && (
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span
                          className={`text-sm font-medium ${
                            isMe ? 'text-accent' : 'text-main'
                          }`}
                        >
                          {user?.name || 'Unknown User'}
                        </span>
                        <span className="text-xs text-muted">
                          {formatBeijingTime(msg.createdAt)}
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-main whitespace-pre-wrap break-words">
                      {msg.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {typingUsers.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted animate-pulse">
          <span>
            {typingUsers.length === 1
              ? `${typingUsers[0]} is typing...`
              : `${typingUsers.slice(0, 2).join(', ')} are typing...`}
          </span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
};

// ============ Composer ============

interface ComposerProps {
  onSend: (body: string) => Promise<void>;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}

const Composer: React.FC<ComposerProps> = ({ onSend, onTyping, disabled }) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // Typing indicator
    if (value.trim()) {
      onTyping(true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    } else {
      onTyping(false);
    }
  };

  const handleSend = async () => {
    if (!text.trim() || sending || disabled) return;
    setSending(true);
    try {
      await onSend(text);
      setText('');
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      onTyping(false);
      textareaRef.current?.focus();
    } catch (err) {
      console.error('Send failed:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        120
      )}px`;
    }
  }, [text]);

  return (
    <div className="p-4 border-t border-black/5 dark:border-white/10 bg-surface/50">
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
            disabled={disabled || sending}
            rows={1}
            className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-background text-main placeholder:text-muted resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
            style={{ minHeight: '44px', maxHeight: '120px' }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending || disabled}
          className={`p-3 rounded-xl transition-all ${
            text.trim() && !sending && !disabled
              ? 'bg-accent text-white hover:bg-accent/90'
              : 'bg-black/5 dark:bg-white/5 text-muted cursor-not-allowed'
          }`}
        >
          {sending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Send size={18} />
          )}
        </button>
      </div>
    </div>
  );
};

// ============ Main Messages Pane ============

const ChatMessagesPane: React.FC<ChatMessagesPaneProps> = ({
  channel,
  messages,
  users,
  currentUserId,
  loading,
  hasMore,
  onLoadMore,
  onSend,
  onTyping,
  typingUserIds,
  onlineUserIds,
}) => {
  if (!channel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted bg-background">
        <div className="text-center">
          <MessageSquare size={48} className="mx-auto mb-4 text-muted/50" />
          <p>Select a channel to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Channel Header */}
      <div className="h-14 px-4 flex items-center gap-3 border-b border-black/5 dark:border-white/10 bg-surface/50 shrink-0">
        <Hash size={18} className="text-accent" />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-main truncate">
            {channel.name}
          </h2>
          {channel.description && (
            <p className="text-xs text-muted truncate">
              {channel.description}
            </p>
          )}
        </div>
        {onlineUserIds.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted shrink-0">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span>{onlineUserIds.length} online</span>
          </div>
        )}
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        users={users}
        currentUserId={currentUserId}
        loading={loading}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        typingUserIds={typingUserIds}
      />

      {/* Composer */}
      <Composer onSend={onSend} onTyping={onTyping} disabled={!channel} />
    </div>
  );
};

export default ChatMessagesPane;
