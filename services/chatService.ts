import { supabase } from './supabaseClient';
import { ChatChannel, ChatMessage, ChatRead } from '../types';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============ Database Row Types ============

interface DbChatChannel {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

interface DbChatMessage {
  id: string;
  org_id: string;
  channel_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
}

interface DbChatRead {
  channel_id: string;
  user_id: string;
  last_read_at: string;
  updated_at: string;
}

// ============ Converters ============

const toChannel = (row: DbChatChannel): ChatChannel => ({
  id: row.id,
  orgId: row.org_id,
  name: row.name,
  slug: row.slug,
  description: row.description || undefined,
  createdBy: row.created_by || undefined,
  createdAt: new Date(row.created_at),
});

const toMessage = (row: DbChatMessage): ChatMessage => ({
  id: row.id,
  orgId: row.org_id,
  channelId: row.channel_id,
  userId: row.user_id,
  body: row.body,
  createdAt: new Date(row.created_at),
  updatedAt: new Date(row.updated_at),
});

const toRead = (row: DbChatRead): ChatRead => ({
  channelId: row.channel_id,
  userId: row.user_id,
  lastReadAt: new Date(row.last_read_at),
  updatedAt: new Date(row.updated_at),
});

// ============ Channel Operations ============

export const fetchChannels = async (orgId: string): Promise<ChatChannel[]> => {
  const { data, error } = await supabase
    .from('chat_channels')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(toChannel);
};

export const createChannel = async (
  orgId: string,
  channel: { name: string; slug: string; description?: string },
  userId: string
): Promise<ChatChannel> => {
  const { data, error } = await supabase
    .from('chat_channels')
    .insert({
      org_id: orgId,
      name: channel.name,
      slug: channel.slug,
      description: channel.description || null,
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return toChannel(data);
};

export const ensureDefaultChannels = async (
  orgId: string,
  userId: string
): Promise<ChatChannel[]> => {
  const existing = await fetchChannels(orgId);
  if (existing.length > 0) return existing;

  const defaults = [
    { name: 'General', slug: 'general', description: '团队公共讨论' },
    { name: 'Random', slug: 'random', description: '闲聊灌水' },
  ];

  const channels: ChatChannel[] = [];
  for (const def of defaults) {
    try {
      const ch = await createChannel(orgId, def, userId);
      channels.push(ch);
    } catch (err: any) {
      // Ignore duplicate slug errors (23505)
      if (err?.code !== '23505') {
        console.warn('Failed to create default channel:', def.slug, err);
      }
    }
  }

  return channels.length > 0 ? channels : fetchChannels(orgId);
};

// ============ Message Operations ============

export const fetchMessages = async (
  channelId: string,
  options: { limit?: number; before?: Date } = {}
): Promise<ChatMessage[]> => {
  const limit = options.limit || 50;
  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (options.before) {
    query = query.lt('created_at', options.before.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  // Reverse to get oldest first for display
  return (data || []).map(toMessage).reverse();
};

export const sendMessage = async (
  orgId: string,
  channelId: string,
  userId: string,
  body: string
): Promise<ChatMessage> => {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      org_id: orgId,
      channel_id: channelId,
      user_id: userId,
      body,
    })
    .select()
    .single();
  if (error) throw error;
  return toMessage(data);
};

export const deleteMessage = async (messageId: string): Promise<void> => {
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('id', messageId);
  if (error) throw error;
};

// ============ Read Tracking ============

export const fetchReads = async (userId: string): Promise<ChatRead[]> => {
  const { data, error } = await supabase
    .from('chat_reads')
    .select('*')
    .eq('user_id', userId);
  if (error) throw error;
  return (data || []).map(toRead);
};

export const markChannelRead = async (
  channelId: string,
  userId: string,
  lastReadAt: Date = new Date()
): Promise<void> => {
  const { error } = await supabase.from('chat_reads').upsert(
    {
      channel_id: channelId,
      user_id: userId,
      last_read_at: lastReadAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'channel_id,user_id' }
  );
  if (error) throw error;
};

// ============ Unread Count Helper ============

export const computeUnreadCount = (
  messages: ChatMessage[],
  lastReadAt: Date | null
): number => {
  if (!lastReadAt) return messages.length;
  return messages.filter((m) => m.createdAt > lastReadAt).length;
};

// ============ Realtime Subscription ============

interface ChannelSubscriptionCallbacks {
  onMessage?: (message: ChatMessage) => void;
  onMessageUpdate?: (message: ChatMessage) => void;
  onMessageDelete?: (messageId: string) => void;
  onTyping?: (userId: string, isTyping: boolean) => void;
  onPresence?: (onlineUserIds: string[]) => void;
}

let activeChannel: RealtimeChannel | null = null;

export const subscribeToChannel = (
  channelId: string,
  orgId: string,
  userId: string,
  callbacks: ChannelSubscriptionCallbacks
): (() => void) => {
  // Cleanup previous subscription
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }

  const channelName = `chat_${channelId}`;
  activeChannel = supabase
    .channel(channelName)
    // Listen for new messages
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        if (payload.new) {
          callbacks.onMessage?.(toMessage(payload.new as DbChatMessage));
        }
      }
    )
    // Listen for message updates
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        if (payload.new) {
          callbacks.onMessageUpdate?.(toMessage(payload.new as DbChatMessage));
        }
      }
    )
    // Listen for message deletes
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'chat_messages',
        filter: `channel_id=eq.${channelId}`,
      },
      (payload) => {
        if (payload.old) {
          callbacks.onMessageDelete?.((payload.old as DbChatMessage).id);
        }
      }
    )
    // Typing broadcast (non-persistent)
    .on('broadcast', { event: 'typing' }, (payload) => {
      const { userId: typingUserId, isTyping } = payload.payload as {
        userId: string;
        isTyping: boolean;
      };
      if (typingUserId !== userId) {
        callbacks.onTyping?.(typingUserId, isTyping);
      }
    })
    // Presence tracking
    .on('presence', { event: 'sync' }, () => {
      const state = activeChannel?.presenceState() || {};
      const onlineIds = Object.values(state)
        .flat()
        .map((p: any) => p.userId as string)
        .filter((id) => id !== userId);
      callbacks.onPresence?.([...new Set(onlineIds)]);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Track presence
        await activeChannel?.track({ userId });
      }
    });

  return () => {
    if (activeChannel) {
      supabase.removeChannel(activeChannel);
      activeChannel = null;
    }
  };
};

export const broadcastTyping = (isTyping: boolean): void => {
  if (!activeChannel) return;
  activeChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: {
      userId: '', // Will be set by caller with actual userId
      isTyping,
    },
  });
};

export const sendTypingIndicator = (userId: string, isTyping: boolean): void => {
  if (!activeChannel) return;
  activeChannel.send({
    type: 'broadcast',
    event: 'typing',
    payload: { userId, isTyping },
  });
};

export const unsubscribeFromChannel = (): void => {
  if (activeChannel) {
    supabase.removeChannel(activeChannel);
    activeChannel = null;
  }
};
