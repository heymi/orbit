import React, { useState } from 'react';
import { InviteResult, User, UserRole, PermissionRole } from '../types';
import { getAvatarUrl, resolveAvatarUrl } from '../services/avatar';
import { Mail, Edit3, X, Check, Trash2, Plus, Users, Shield } from 'lucide-react';

interface TeamMembersViewProps {
  users: User[];
  currentUser?: User | null;
  onAddUser: (user: User) => Promise<InviteResult | null>;
  onUpdateUser: (user: User) => void | Promise<void>;
  onDeleteUser: (id: string) => void | Promise<void>;
}

const TeamMembersView: React.FC<TeamMembersViewProps> = ({ users, currentUser, onAddUser, onUpdateUser, onDeleteUser }) => {
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  
  // Invite Form State
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState(UserRole.Development);
  const [invitePermissionRole, setInvitePermissionRole] = useState<PermissionRole>(PermissionRole.Member);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  const isAdmin =
    currentUser?.permissionRole === PermissionRole.Admin ||
    String(currentUser?.permissionRole || currentUser?.role || '').toLowerCase() === 'admin';

  // Edit Form State
  const [editRole, setEditRole] = useState('');
  const [editPermissionRole, setEditPermissionRole] = useState<PermissionRole>(PermissionRole.Member);
  const [editAvatarUrl, setEditAvatarUrl] = useState('');

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    if (!inviteName || !inviteEmail) return;

    const newUser: User = {
        id: `u_${Math.random().toString(36).substr(2, 9)}`,
        name: inviteName,
        email: inviteEmail,
        role: inviteRole,
        permissionRole: invitePermissionRole,
        avatarUrl: getAvatarUrl(inviteName || inviteEmail),
    };

    const result = await onAddUser(newUser);
    if (!result) return;

    setInviteResult(result);

    setInviteName('');
    setInviteEmail('');
    setInviteRole(UserRole.Development);
    setInvitePermissionRole(PermissionRole.Member);

    if (result.mode === 'added') {
      closeInviteModal();
    }
  };

  const startEdit = (user: User) => {
      if (!isAdmin) return;
      setEditingUserId(user.id);
      setEditRole(user.role);
      setEditPermissionRole((user.permissionRole as PermissionRole) || PermissionRole.Member);
      setEditAvatarUrl(user.avatarUrl || '');
  };

  const saveEdit = async (user: User) => {
      if (!isAdmin) return;
      try {
          setUpdateError(null);
          await onUpdateUser({ ...user, role: editRole, permissionRole: editPermissionRole, avatarUrl: editAvatarUrl });
          setEditingUserId(null);
      } catch (err: any) {
          const message = err?.message || JSON.stringify(err);
          setUpdateError(`更新失败：${message}`);
          alert('更新失败: ' + message);
      }
  };

  const closeInviteModal = () => {
    setIsInviteModalOpen(false);
    setInviteResult(null);
  };

  const copyInviteLink = async () => {
    if (!inviteResult?.inviteLink) return;
    await navigator.clipboard.writeText(inviteResult.inviteLink);
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden p-8 animate-fade-in">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
            <h1 className="text-2xl font-bold text-main flex items-center gap-3">
                <Users size={28} className="text-muted" />
                团队成员
            </h1>
            <p className="text-muted text-sm mt-1">
              {isAdmin ? '管理成员权限与岗位，并邀请新同事' : '只读模式：仅管理员可管理成员'}
            </p>
        </div>
        <button 
            onClick={() => { if (!isAdmin) return; setInviteResult(null); setIsInviteModalOpen(true); }}
            disabled={!isAdmin}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${isAdmin ? 'bg-main text-surface hover:scale-[1.02] active:scale-95 shadow-lg' : 'bg-black/5 text-muted cursor-not-allowed'}`}
        >
            <Plus size={16} />
            邀请成员
        </button>
      </div>

      {updateError && (
        <div className="mb-6 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm px-4 py-3">
          {updateError}
        </div>
      )}

      {/* Members Grid/List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto pb-20">
          {users.map(user => (
              <div key={user.id} className="bg-surface-glass border border-black/5 dark:border-white/5 p-4 rounded-2xl flex items-center justify-between group hover:border-accent/20 transition-all shadow-sm">
                  <div className="flex items-center gap-4">
                      <img src={resolveAvatarUrl(user.name || user.email, user.avatarUrl)} alt={user.name} className="w-12 h-12 rounded-full shadow-sm" />
                      <div>
                          <h3 className="font-semibold text-main text-base">{user.name}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-muted">
                              <Mail size={12} />
                              {user.email}
                          </div>
                          
                          {editingUserId === user.id ? (
                              <div className="flex flex-wrap items-center gap-2 mt-2">
                                  <select 
                                    value={editPermissionRole}
                                    onChange={(e) => setEditPermissionRole(e.target.value as PermissionRole)}
                                    className="bg-black/5 dark:bg-white/10 rounded px-2 py-1 text-xs text-main focus:outline-none border border-transparent focus:border-accent cursor-pointer appearance-none"
                                    autoFocus
                                  >
                                      <option value={PermissionRole.Member}>成员</option>
                                      <option value={PermissionRole.Admin}>管理员</option>
                                  </select>
                                  <select 
                                    value={editRole}
                                    onChange={(e) => setEditRole(e.target.value)}
                                    className="bg-black/5 dark:bg-white/10 rounded px-2 py-1 text-xs text-main focus:outline-none border border-transparent focus:border-accent cursor-pointer appearance-none"
                                  >
                                      {Object.values(UserRole).map(role => (
                                          <option key={role} value={role}>{role}</option>
                                      ))}
                                  </select>
                                  <input
                                    value={editAvatarUrl}
                                    onChange={(e) => setEditAvatarUrl(e.target.value)}
                                    placeholder="头像 URL (可选)"
                                    className="bg-black/5 dark:bg-white/10 rounded px-2 py-1 text-xs text-main focus:outline-none border border-transparent focus:border-accent w-44"
                                  />
                                  <button onClick={() => saveEdit(user)} className="text-green-500 hover:bg-green-500/10 p-1 rounded">
                                      <Check size={14} />
                                  </button>
                                  <button onClick={() => setEditingUserId(null)} className="text-muted hover:bg-black/5 p-1 rounded">
                                      <X size={14} />
                                  </button>
                              </div>
                          ) : (
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-medium">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 ${user.permissionRole === PermissionRole.Admin ? 'bg-accent/10 text-accent' : 'bg-black/5 dark:bg-white/10 text-muted'}`}>
                                    <Shield size={12} />
                                    {user.permissionRole === PermissionRole.Admin ? '管理员' : '成员'}
                                  </span>
                                  <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 bg-black/5 dark:bg-white/10 text-muted">
                                    <Users size={12} />
                                    {user.role}
                                  </span>
                              </div>
                          )}
                      </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {editingUserId !== user.id && (
                          <button onClick={() => startEdit(user)} className="p-2 text-muted hover:text-main hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors" title="修改角色">
                              <Edit3 size={16} />
                          </button>
                        )}
                        <button 
                          onClick={async () => {
                            const input = window.prompt(`请输入成员邮箱以确认移除：${user.email}`);
                            if (!input || input.trim().toLowerCase() !== user.email.toLowerCase()) {
                              setUpdateError('邮箱不匹配，已取消移除。');
                              return;
                            }
                            try {
                              await onDeleteUser(user.id);
                            } catch (err: any) {
                              const message = err?.message || JSON.stringify(err);
                              setUpdateError(`移除失败：${message}`);
                            }
                          }} 
                          className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors" title="移除成员"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                  )}
              </div>
          ))}
      </div>

      {/* Invite Modal Overlay */}
      {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-sm p-4 animate-fade-in">
              <div className="bg-surface border border-black/5 dark:border-white/10 shadow-2xl rounded-2xl w-full max-w-md p-6 relative animate-scale-in">
                  <button onClick={closeInviteModal} className="absolute right-4 top-4 text-muted hover:text-main">
                      <X size={20} />
                  </button>
                  
                  <h2 className="text-lg font-bold text-main mb-6 flex items-center gap-2">
                      <Mail size={20} className="text-accent" />
                      邀请新成员
                  </h2>

                  <form onSubmit={handleInvite} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">姓名</label>
                          <input 
                             required
                             value={inviteName}
                             onChange={e => setInviteName(e.target.value)}
                             className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
                             placeholder="例如: 张三"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">邮箱地址</label>
                          <input 
                             required
                             type="email"
                             value={inviteEmail}
                             onChange={e => setInviteEmail(e.target.value)}
                             className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
                             placeholder="zhangsan@company.com"
                          />
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">权限级别</label>
                          <div className="relative">
                            <select 
                                required
                                value={invitePermissionRole}
                                onChange={e => setInvitePermissionRole(e.target.value as PermissionRole)}
                                className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none cursor-pointer"
                            >
                                <option value={PermissionRole.Member}>成员（只读）</option>
                                <option value={PermissionRole.Admin}>管理员</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                                <Shield size={14} />
                            </div>
                          </div>
                      </div>
                      <div>
                          <label className="block text-xs font-bold text-muted uppercase tracking-wider mb-1.5">岗位</label>
                          <div className="relative">
                            <select 
                                required
                                value={inviteRole}
                                onChange={e => setInviteRole(e.target.value as UserRole)}
                                className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-4 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none cursor-pointer"
                            >
                                {Object.values(UserRole).map(role => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                                <Users size={14} />
                            </div>
                          </div>
                      </div>

                      <div className="pt-4 flex justify-end">
                          <button type="submit" className="bg-main text-surface px-6 py-2.5 rounded-xl font-semibold shadow-lg hover:scale-[1.02] active:scale-95 transition-all w-full">
                              发送邀请
                          </button>
                      </div>
                  </form>

                  {inviteResult?.mode === 'invited' && (
                      <div className="mt-5 rounded-xl border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 p-4 space-y-3">
                          <div className="text-xs font-semibold text-muted uppercase tracking-wider">邀请链接</div>
                          <div className="flex items-center gap-2">
                              <input
                                readOnly
                                value={inviteResult.inviteLink || ''}
                                className="flex-1 bg-black/5 dark:bg-white/10 rounded-lg px-3 py-2 text-xs text-main focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={copyInviteLink}
                                className="px-3 py-2 text-xs font-semibold text-accent bg-accent/10 rounded-lg hover:bg-accent/20 transition-colors"
                              >
                                复制
                              </button>
                          </div>
                          <p className="text-xs text-muted">将链接发送给对方，对方完成设置密码后自动加入组织。</p>
                          <button
                            type="button"
                            onClick={closeInviteModal}
                            className="w-full text-xs font-semibold text-main bg-black/10 dark:bg-white/10 rounded-lg py-2 hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
                          >
                            完成
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

    </div>
  );
};

export default TeamMembersView;
