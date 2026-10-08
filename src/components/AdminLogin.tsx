import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, User } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';
import { getLocalUsers } from '../lib/schemaFallback';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const cleanUsername = username.trim();
      let matchedUser: any = null;

      try {
        const { data: user, error: supabaseError } = await supabase
          .from('users')
          .select('*')
          .eq('username', cleanUsername)
          .eq('password', password)
          .maybeSingle();

        if (!supabaseError && user) {
          matchedUser = user;
        }
      } catch {
        // remote error, proceed to local check
      }

      // If not found in remote or remote failed, check local users
      if (!matchedUser) {
        const localUsers = getLocalUsers();
        const foundLocal = localUsers.find(
          u => u.username.toLowerCase() === cleanUsername.toLowerCase() && u.password === password
        );
        if (foundLocal) {
          matchedUser = foundLocal;
        }
      }

      if (!matchedUser) {
        setError('Tên đăng nhập hoặc mật khẩu không đúng');
        setLoading(false);
        return;
      }

      if (matchedUser.is_locked) {
        setError('Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Quản trị viên.');
        setLoading(false);
        return;
      }

      login({
        id: matchedUser.id,
        username: matchedUser.username,
        role: matchedUser.role
      });
      navigate('/admin/dashboard');
    } catch (err: any) {
      setError('Lỗi kết nối máy chủ: ' + (err.message || 'Unknown error'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900 p-8 rounded-2xl shadow-xl border border-zinc-800 max-w-sm w-full"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400">
            <Shield size={32} />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white text-center mb-2">Quản Trị Hệ Thống</h2>
        <p className="text-zinc-400 text-center mb-8 text-sm">Đăng nhập để quản lý Campaign 2026</p>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <User size={18} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tên đăng nhập"
                className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-zinc-600"
                required
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <Lock size={18} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder-zinc-600"
                required
              />
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-950/30 py-2 rounded-lg border border-red-900/50">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-500 transition-colors disabled:opacity-70 mt-2"
          >
            {loading ? 'Đang xử lý...' : 'Đăng Nhập'}
          </button>
        </form>
      </motion.div>
      
      <div className="mt-8 text-sm text-zinc-600 flex flex-col items-center gap-2">
            <a href="/" className="hover:text-zinc-400 transition-colors">← Quay lại trang đăng ký</a>
      </div>
    </div>
  );
}
