import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../services/supabaseClient';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 同步 Auth 用户到 users 表
const syncUserToDatabase = async (authUser: User) => {
  if (!authUser.email) return;

  const metadataAvatar = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture;
  const name = authUser.user_metadata?.name || authUser.email.split('@')[0];

  // 检查用户是否已存在
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, avatar_url')
    .eq('id', authUser.id)
    .maybeSingle();

  if (!existingUser) {
    // 创建新用户记录
    await supabase.from('users').insert({
      id: authUser.id,
      name: name,
      email: authUser.email,
      avatar_url: metadataAvatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
      role: '其他成员',
    });
    return;
  }

  if (metadataAvatar && metadataAvatar !== existingUser.avatar_url) {
    await supabase
      .from('users')
      .update({ avatar_url: metadataAvatar })
      .eq('id', authUser.id);
  }
};

const getInviteOrgId = (authUser: User) => {
  const metadataOrgId = authUser.user_metadata?.invited_org_id;
  if (typeof metadataOrgId === 'string' && metadataOrgId) {
    return metadataOrgId;
  }

  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  return params.get('invite_org');
};

const clearInviteParams = () => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const keysToClear = ['invite_org', 'invite_token', 'invite_type'];
  let changed = false;
  keysToClear.forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (changed) {
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  }
};

const acceptInviteIfNeeded = async (authUser: User) => {
  const orgId = getInviteOrgId(authUser);
  if (!orgId) return false;

  const { data: existingMember } = await supabase
    .from('org_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (existingMember) {
    clearInviteParams();
    return false;
  }

  const { error } = await supabase
    .from('org_members')
    .insert({ org_id: orgId, user_id: authUser.id, role: 'member' });

  if (error) throw error;

  await supabase.auth.updateUser({
    data: {
      invited_org_id: null,
      invited_org_role: null,
    },
  });

  clearInviteParams();
  return true;
};

const getInviteTokenParams = () => {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite_token');
  const type = params.get('invite_type');
  if (!token || !type) return null;
  return { token, type };
};

const verifyInviteToken = async () => {
  const params = getInviteTokenParams();
  if (!params) return;
  await supabase.auth.verifyOtp({
    token_hash: params.token,
    type: params.type as 'invite',
  });
  clearInviteParams();
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeSession = async () => {
      try {
        await verifyInviteToken();
        const { data: { session } } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await syncUserToDatabase(session.user);
          const joined = await acceptInviteIfNeeded(session.user);
          if (joined && typeof window !== 'undefined') {
            window.location.reload();
            return;
          }
        }
      } catch (err) {
        console.error('Failed to initialize session:', err);
      } finally {
        setLoading(false);
      }
    };

    initializeSession();

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        setSession(session);
        setUser(session?.user ?? null);
        
        // 用户登录或注册时同步到 users 表
        if (session?.user && (event === 'SIGNED_IN' || event === 'USER_UPDATED')) {
          await syncUserToDatabase(session.user);
          const joined = await acceptInviteIfNeeded(session.user);
          if (joined && typeof window !== 'undefined') {
            window.location.reload();
            return;
          }
        }
      } catch (err) {
        console.error('Failed to handle auth state change:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({ email });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
