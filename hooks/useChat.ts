import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatChannel, ChatMessage, ChatRead } from '../types';
import * as chatService from '../services/chatService';

interface UseChatOptions {
  orgId: string | null;
  userId: string | null;
}

interface UseChatReturn {
  // Channels
  channels: ChatChannel[];
  currentChannelId: string | null;
  setCurrentChannelId: (id: string | null) => void;
  currentChannel: ChatChannel | null;

  // Messages
  messages: ChatMessage[];
  loadingMessages: boolean;
  hasMoreMessages: boolean;
  loadMoreMessages: () => Promise<void>;

  // Actions
  sendMessage: (body: string) => Promise<void>;
  sendTyping: (isTyping: boolean) => void;

  // Unread
  unreadByChannel: Record<string, number>;
  totalUnread: number;

  // Presence & Typing
  onlineUserIds: string[];
  typingUserIds: string[];

  // State
  loading: boolean;
  error: string | null;

  // Utils
  refreshChannels: () => Promise<void>;
}

const MESSAGE_PAGE_SIZE = 50;

export const useChat = ({ orgId, userId }: UseChatOptions): UseChatReturn => {
  // Channels
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [currentChannelId, setCurrentChannelId] = useState<string | null>(null);

  // Messages per channel (only current channel loaded)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  // Reads & Unread
  const [reads, setReads] = useState<ChatRead[]>([]);
  const [unreadByChannel, setUnreadByChannel] = useState<Record<string, number>>({});

  // Presence & Typing
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs for cleanup
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const typingTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Derived
  const currentChannel = channels.find((c) => c.id === currentChannelId) || null;
  const totalUnread = Object.values(unreadByChannel).reduce((sum, n) => sum + n, 0);

  // ============ Load Channels ============
  const loadChannels = useCallback(async () => {
    if (!orgId || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const chs = await chatService.ensureDefaultChannels(orgId, userId);
      setChannels(chs);
      // Auto-select first channel if none selected
      if (!currentChannelId && chs.length > 0) {
        setCurrentChannelId(chs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load channels:', err);
      setError(err.message || 'Failed to load channels');
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, currentChannelId]);

  // ============ Load Reads ============
  const loadReads = useCallback(async () => {
    if (!userId) return;
    try {
      const r = await chatService.fetchReads(userId);
      setReads(r);
    } catch (err) {
      console.error('Failed to load reads:', err);
    }
  }, [userId]);

  // ============ Load Messages ============
  const loadMessages = useCallback(
    async (channelId: string, before?: Date) => {
      setLoadingMessages(true);
      try {
        const msgs = await chatService.fetchMessages(channelId, {
          limit: MESSAGE_PAGE_SIZE,
          before,
        });
        if (before) {
          // Prepend older messages
          setMessages((prev) => [...msgs, ...prev]);
        } else {
          setMessages(msgs);
        }
        setHasMoreMessages(msgs.length === MESSAGE_PAGE_SIZE);
      } catch (err: any) {
        console.error('Failed to load messages:', err);
        setError(err.message || 'Failed to load messages');
      } finally {
        setLoadingMessages(false);
      }
    },
    []
  );

  const loadMoreMessages = useCallback(async () => {
    if (!currentChannelId || loadingMessages || !hasMoreMessages) return;
    const oldest = messages[0];
    if (oldest) {
      await loadMessages(currentChannelId, oldest.createdAt);
    }
  }, [currentChannelId, loadingMessages, hasMoreMessages, messages, loadMessages]);

  // ============ Subscribe to Channel ============
  useEffect(() => {
    if (!currentChannelId || !orgId || !userId) return;

    // Cleanup previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    // Clear messages and reload
    setMessages([]);
    setHasMoreMessages(true);
    loadMessages(currentChannelId);

    // Subscribe to realtime
    const unsub = chatService.subscribeToChannel(
      currentChannelId,
      orgId,
      userId,
      {
        onMessage: (msg) => {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          // Update unread for other channels (not current)
          // For current channel, mark as read
          if (msg.userId !== userId) {
            chatService.markChannelRead(currentChannelId, userId, new Date()).catch(() => {});
          }
        },
        onMessageUpdate: (msg) => {
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        },
        onMessageDelete: (msgId) => {
          setMessages((prev) => prev.filter((m) => m.id !== msgId));
        },
        onTyping: (typingUserId, isTyping) => {
          // Clear existing timeout for this user
          const existingTimeout = typingTimeoutRef.current.get(typingUserId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            typingTimeoutRef.current.delete(typingUserId);
          }

          if (isTyping) {
            setTypingUserIds((prev) =>
              prev.includes(typingUserId) ? prev : [...prev, typingUserId]
            );
            // Auto-remove after 3s
            const timeout = setTimeout(() => {
              setTypingUserIds((prev) => prev.filter((id) => id !== typingUserId));
              typingTimeoutRef.current.delete(typingUserId);
            }, 3000);
            typingTimeoutRef.current.set(typingUserId, timeout);
          } else {
            setTypingUserIds((prev) => prev.filter((id) => id !== typingUserId));
          }
        },
        onPresence: (ids) => {
          setOnlineUserIds(ids);
        },
      }
    );

    unsubscribeRef.current = unsub;

    // Mark channel as read on enter
    chatService.markChannelRead(currentChannelId, userId).catch(() => {});

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      // Clear typing timeouts
      typingTimeoutRef.current.forEach((t) => clearTimeout(t));
      typingTimeoutRef.current.clear();
      setTypingUserIds([]);
    };
  }, [currentChannelId, orgId, userId, loadMessages]);

  // ============ Compute Unread Counts ============
  useEffect(() => {
    // For MVP, we compute unread based on reads and a simple heuristic
    // In production, you'd query message counts server-side
    const unread: Record<string, number> = {};
    channels.forEach((ch) => {
      const read = reads.find((r) => r.channelId === ch.id);
      // For now, set to 0 if we don't have message counts
      // This will be enhanced when we have proper unread tracking
      unread[ch.id] = 0;
    });
    setUnreadByChannel(unread);
  }, [channels, reads]);

  // ============ Initial Load ============
  useEffect(() => {
    if (orgId && userId) {
      loadChannels();
      loadReads();
    }
  }, [orgId, userId, loadChannels, loadReads]);

  // ============ Send Message ============
  const sendMessage = useCallback(
    async (body: string) => {
      if (!orgId || !currentChannelId || !userId || !body.trim()) return;
      try {
        await chatService.sendMessage(orgId, currentChannelId, userId, body.trim());
        // Stop typing indicator
        chatService.sendTypingIndicator(userId, false);
      } catch (err: any) {
        console.error('Failed to send message:', err);
        setError(err.message || 'Failed to send message');
        throw err;
      }
    },
    [orgId, currentChannelId, userId]
  );

  // ============ Typing Indicator ============
  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!userId) return;
      chatService.sendTypingIndicator(userId, isTyping);
    },
    [userId]
  );

  // ============ Refresh ============
  const refreshChannels = useCallback(async () => {
    await loadChannels();
    await loadReads();
  }, [loadChannels, loadReads]);

  return {
    channels,
    currentChannelId,
    setCurrentChannelId,
    currentChannel,
    messages,
    loadingMessages,
    hasMoreMessages,
    loadMoreMessages,
    sendMessage,
    sendTyping,
    unreadByChannel,
    totalUnread,
    onlineUserIds,
    typingUserIds,
    loading,
    error,
    refreshChannels,
  };
};
