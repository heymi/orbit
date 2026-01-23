import { describe, it, expect } from 'vitest';
import { computeUnreadCount } from '../services/chatService';
import { ChatMessage } from '../types';

const makeMessage = (id: string, createdAt: Date): ChatMessage => ({
  id,
  orgId: 'org-1',
  channelId: 'ch-1',
  userId: 'user-1',
  body: 'test',
  createdAt,
  updatedAt: createdAt,
});

describe('computeUnreadCount', () => {
  it('returns total message count when lastReadAt is null', () => {
    const messages = [
      makeMessage('1', new Date('2025-01-01T10:00:00Z')),
      makeMessage('2', new Date('2025-01-01T11:00:00Z')),
      makeMessage('3', new Date('2025-01-01T12:00:00Z')),
    ];
    expect(computeUnreadCount(messages, null)).toBe(3);
  });

  it('returns 0 when all messages are before lastReadAt', () => {
    const messages = [
      makeMessage('1', new Date('2025-01-01T10:00:00Z')),
      makeMessage('2', new Date('2025-01-01T11:00:00Z')),
    ];
    const lastReadAt = new Date('2025-01-01T12:00:00Z');
    expect(computeUnreadCount(messages, lastReadAt)).toBe(0);
  });

  it('returns correct count of messages after lastReadAt', () => {
    const messages = [
      makeMessage('1', new Date('2025-01-01T10:00:00Z')),
      makeMessage('2', new Date('2025-01-01T11:00:00Z')),
      makeMessage('3', new Date('2025-01-01T12:00:00Z')),
      makeMessage('4', new Date('2025-01-01T13:00:00Z')),
    ];
    const lastReadAt = new Date('2025-01-01T11:30:00Z');
    // Messages 3 and 4 are after lastReadAt
    expect(computeUnreadCount(messages, lastReadAt)).toBe(2);
  });

  it('returns 0 for empty messages array', () => {
    expect(computeUnreadCount([], null)).toBe(0);
    expect(computeUnreadCount([], new Date())).toBe(0);
  });

  it('handles exact timestamp boundary correctly', () => {
    const timestamp = new Date('2025-01-01T12:00:00Z');
    const messages = [
      makeMessage('1', timestamp),
      makeMessage('2', new Date('2025-01-01T12:00:01Z')),
    ];
    // Only message 2 is strictly after lastReadAt
    expect(computeUnreadCount(messages, timestamp)).toBe(1);
  });
});
