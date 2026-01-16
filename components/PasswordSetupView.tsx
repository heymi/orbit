import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface PasswordSetupViewProps {
  email?: string | null;
  onComplete: () => void;
}

const PasswordSetupView: React.FC<PasswordSetupViewProps> = ({ email, onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          needs_password_setup: false,
        },
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      if (typeof window !== 'undefined') {
        localStorage.removeItem('needsPasswordSetup');
      }

      setMessage('密码已设置，正在进入工作区...');
      onComplete();
    } catch (err: any) {
      setError(err?.message || '设置密码失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-accent/30">
            O
          </div>
          <span className="ml-3 text-3xl font-bold tracking-tight text-main">Orbit</span>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl p-8 border border-black/5 dark:border-white/10">
          <h2 className="text-2xl font-bold text-center text-main mb-2">设置登录密码</h2>
          <p className="text-center text-muted mb-8">
            {email ? `邀请已接受：${email}` : '完成设置后即可进入工作区'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-main mb-2">
                新密码
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="至少 6 位"
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-slate-700/50 text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-main mb-2">
                确认密码
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="再次输入密码"
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-black/10 dark:border-white/10 bg-slate-50 dark:bg-slate-700/50 text-main placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-all"
              />
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl bg-main text-surface font-medium hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            >
              {loading ? '设置中...' : '设置密码'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PasswordSetupView;
