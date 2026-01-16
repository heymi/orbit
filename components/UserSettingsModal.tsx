import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { LayoutPreference, ThemePreference, UserRole } from '../types';
import { AVATAR_LIBRARY, resolveAvatarUrl } from '../services/avatar';

interface UserSettingsModalProps {
  isOpen: boolean;
  email?: string | null;
  role?: string | null;
  avatarUrl?: string | null;
  currentTheme?: ThemePreference | 'system' | null;
  currentLayout?: LayoutPreference | null;
  themePreference: ThemePreference | null | undefined;
  layoutPreference: LayoutPreference | null | undefined;
  onClose: () => void;
  onSavePreferences: (preferences: { themePreference: ThemePreference | null; layoutPreference: LayoutPreference | null; role: string | null; avatarUrl: string | null }) => Promise<void>;
}

const AI_MODEL_STORAGE_KEY = 'ai_model';
const AI_KEY_STORAGE_KEY = 'ai_api_key';
const AI_MODEL_OPTIONS = [
  { label: 'Gemini 3 Flash（内置）', value: 'gemini-3-flash-preview' },
  { label: '火山豆包（内置）', value: 'doubao-seed-1-8-251228' },
  { label: '自定义模型', value: 'custom' },
];
const AI_CUSTOM_MODEL_STORAGE_KEY = 'ai_custom_model';
const AI_CUSTOM_BASE_URL_STORAGE_KEY = 'ai_custom_base_url';

const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  email,
  role,
  avatarUrl,
  currentTheme,
  currentLayout,
  themePreference,
  layoutPreference,
  onClose,
  onSavePreferences,
}) => {
  const resolvedAvatar = resolveAvatarUrl(email || 'user', avatarUrl || undefined);
  const avatarOptions = [resolvedAvatar, ...AVATAR_LIBRARY.filter((avatar) => avatar !== resolvedAvatar)];
  const resolvedTheme = themePreference ?? currentTheme ?? 'system';
  const resolvedLayout = layoutPreference ?? currentLayout ?? 'board';
  const [themeChoice, setThemeChoice] = useState<'default' | ThemePreference>(resolvedTheme || 'default');
  const [layoutChoice, setLayoutChoice] = useState<'default' | LayoutPreference>(resolvedLayout || 'default');
  const [roleChoice, setRoleChoice] = useState<'default' | UserRole | string>(role || 'default');
  const [avatarChoice, setAvatarChoice] = useState<string>(resolvedAvatar);
  const [aiModelChoice, setAiModelChoice] = useState<string>('gemini-3-flash-preview');
  const [aiApiKey, setAiApiKey] = useState<string>('');
  const [customModelName, setCustomModelName] = useState<string>('');
  const [customBaseUrl, setCustomBaseUrl] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'display' | 'ai' | 'profile'>('display');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const nextTheme = themePreference ?? currentTheme ?? 'system';
    const nextLayout = layoutPreference ?? currentLayout ?? 'board';
    setThemeChoice(nextTheme || 'default');
    setLayoutChoice(nextLayout || 'default');
    setRoleChoice(role || 'default');
    setAvatarChoice(resolveAvatarUrl(email || 'user', avatarUrl || undefined));
    setActiveTab('display');
    if (typeof window !== 'undefined') {
      const storedModel = localStorage.getItem(AI_MODEL_STORAGE_KEY) || 'gemini-3-flash-preview';
      const storedKey = localStorage.getItem(AI_KEY_STORAGE_KEY) || '';
      const storedCustomModel = localStorage.getItem(AI_CUSTOM_MODEL_STORAGE_KEY) || '';
      const storedCustomBaseUrl = localStorage.getItem(AI_CUSTOM_BASE_URL_STORAGE_KEY) || '';
      setAiModelChoice(storedModel);
      setAiApiKey(storedKey);
      setCustomModelName(storedCustomModel);
      setCustomBaseUrl(storedCustomBaseUrl);
    }
    setError(null);
    setMessage(null);
  }, [isOpen, themePreference, layoutPreference, role, avatarUrl, email, currentTheme, currentLayout]);

  if (!isOpen) return null;


  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setSaving(true);

    try {
      if (aiModelChoice === 'custom') {
        if (!customModelName.trim()) {
          setError('自定义模型需要填写模型名称。');
          setSaving(false);
          return;
        }
        if (!aiApiKey.trim()) {
          setError('自定义模型需要填写 API Key（仅保存在本地）。');
          setSaving(false);
          return;
        }
        if (customBaseUrl.trim() && !/^https?:\/\//i.test(customBaseUrl.trim())) {
          setError('自定义 Base URL 需要以 http:// 或 https:// 开头。');
          setSaving(false);
          return;
        }
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem(AI_MODEL_STORAGE_KEY, aiModelChoice);
        if (aiModelChoice === 'custom') {
          localStorage.setItem(AI_KEY_STORAGE_KEY, aiApiKey.trim());
          localStorage.setItem(AI_CUSTOM_MODEL_STORAGE_KEY, customModelName.trim());
          if (customBaseUrl.trim()) {
            localStorage.setItem(AI_CUSTOM_BASE_URL_STORAGE_KEY, customBaseUrl.trim());
          } else {
            localStorage.removeItem(AI_CUSTOM_BASE_URL_STORAGE_KEY);
          }
        } else {
          localStorage.removeItem(AI_KEY_STORAGE_KEY);
          localStorage.removeItem(AI_CUSTOM_MODEL_STORAGE_KEY);
          localStorage.removeItem(AI_CUSTOM_BASE_URL_STORAGE_KEY);
        }
      }

      await onSavePreferences({
        themePreference: themeChoice === 'default' ? null : themeChoice,
        layoutPreference: layoutChoice === 'default' ? null : layoutChoice,
        role: roleChoice === 'default' ? null : roleChoice,
        avatarUrl: avatarChoice,
      });

      setMessage('设置已保存');
      setTimeout(() => setMessage(null), 2000);
    } catch (err: any) {
      setError(err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-surface border border-black/5 dark:border-white/10 shadow-2xl rounded-3xl w-full max-w-lg p-6 sm:p-7 relative animate-scale-in">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted hover:text-main">
          <X size={20} />
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 rounded-2xl overflow-hidden border border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5">
            <img src={resolvedAvatar} alt="当前头像" className="w-full h-full object-cover" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-main">个人设置</h2>
            <p className="text-xs text-muted truncate">{email || '更新你的账号偏好'}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-2xl border border-black/5 dark:border-white/10 bg-white/70 dark:bg-surface/60 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-black/5 dark:border-white/10 bg-black/5 dark:bg-white/5 px-2 py-2">
              {[
                { id: 'display', label: '显示偏好' },
                { id: 'ai', label: 'AI 设置' },
                { id: 'profile', label: '个人信息' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? 'bg-surface text-main shadow-sm' : 'text-muted hover:text-main'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-4">
              {activeTab === 'display' && (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1.5">默认列表布局</label>
                      <select
                        value={layoutChoice}
                        onChange={(event) => setLayoutChoice(event.target.value as typeof layoutChoice)}
                        className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-3.5 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none cursor-pointer"
                      >
                        <option value="default">默认（沿用当前逻辑）</option>
                        <option value="board">卡片</option>
                        <option value="list">列表</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1.5">主题模式</label>
                      <select
                        value={themeChoice}
                        onChange={(event) => setThemeChoice(event.target.value as typeof themeChoice)}
                        className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-3.5 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none cursor-pointer"
                      >
                        <option value="default">默认（沿用当前逻辑）</option>
                        <option value="light">浅色模式</option>
                        <option value="dark">深色模式</option>
                        <option value="system">自动</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'ai' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">AI 模型</label>
                    <select
                      value={aiModelChoice}
                      onChange={(event) => setAiModelChoice(event.target.value)}
                      className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-3.5 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none cursor-pointer"
                    >
                      {AI_MODEL_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-muted">内置模型使用 ARK_API_KEY，无需填写 Key。</p>
                  </div>

                  {aiModelChoice === 'custom' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1.5">自定义模型名称</label>
                        <input
                          type="text"
                          value={customModelName}
                          onChange={(event) => setCustomModelName(event.target.value)}
                          placeholder="例如：doubao-seed-1-8-251228"
                          className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-3.5 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1.5">自定义 Base URL</label>
                        <input
                          type="text"
                          value={customBaseUrl}
                          onChange={(event) => setCustomBaseUrl(event.target.value)}
                          placeholder="默认为豆包 OpenAI 接口地址"
                          className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-3.5 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                        <p className="mt-1 text-[11px] text-muted">留空将使用默认豆包地址。</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-muted mb-1.5">AI API Key（本地）</label>
                        <input
                          type="password"
                          value={aiApiKey}
                          onChange={(event) => setAiApiKey(event.target.value)}
                          placeholder="仅保存在本地浏览器"
                          className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-3.5 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20"
                        />
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                          <span>仅在本设备保存，不会上传服务器。</span>
                          <button
                            type="button"
                            onClick={() => {
                              setAiApiKey('');
                              if (typeof window !== 'undefined') {
                                localStorage.removeItem(AI_KEY_STORAGE_KEY);
                              }
                            }}
                            className="text-xs text-muted hover:text-main"
                          >
                            清除 Key
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">岗位</label>
                    <select
                      value={roleChoice}
                      onChange={(event) => setRoleChoice(event.target.value as typeof roleChoice)}
                      className="w-full bg-black/5 dark:bg-white/5 rounded-xl px-3.5 py-2.5 text-main focus:outline-none focus:ring-2 focus:ring-accent/20 appearance-none cursor-pointer"
                    >
                      <option value="default">默认（沿用当前岗位）</option>
                      {Object.values(UserRole).map(roleOption => (
                        <option key={roleOption} value={roleOption}>{roleOption}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted mb-2">头像</label>
                    <div className="grid grid-cols-5 gap-2">
                      {avatarOptions.map((avatar) => {
                        const isSelected = avatarChoice === avatar;
                        const isCurrent = avatar === resolvedAvatar;
                        return (
                          <button
                            key={avatar}
                            type="button"
                            onClick={() => setAvatarChoice(avatar)}
                            className={`relative rounded-full p-0.5 border transition-colors ${isSelected ? 'border-accent' : 'border-transparent hover:border-black/10 dark:hover:border-white/10'}`}
                            aria-pressed={isSelected}
                          >
                            <img
                              src={avatar}
                              alt={isCurrent ? '当前头像' : '头像'}
                              className={`w-10 h-10 rounded-full ${isSelected ? 'ring-2 ring-accent/40' : ''}`}
                            />
                            {isCurrent && (
                              <span className="absolute -bottom-1 right-0 text-[9px] bg-black/60 text-white px-1 rounded-full">
                                当前
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      onClick={() => setAvatarChoice(resolvedAvatar)}
                      className="mt-2 text-xs text-muted hover:text-main"
                    >
                      使用当前头像
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 text-sm">
              {message}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl font-semibold text-main bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl font-semibold text-surface bg-main hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserSettingsModal;
