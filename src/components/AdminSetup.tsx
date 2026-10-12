import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, User, Lock, UserPlus, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { fetchUsersSafe, addUserSafe } from '../lib/schemaFallback';

export default function AdminSetup() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [hasAdmin, setHasAdmin] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    checkExistingAdmin();
  }, []);

  const checkExistingAdmin = async () => {
    try {
      const users = await fetchUsersSafe();
      if (users && users.length > 0) {
        setHasAdmin(true);
      }
    } catch {
      // ignore
    } finally {
      setIsChecking(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (username.length < 4) {
      setError('Tên đăng nhập phải có ít nhất 4 ký tự');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự');
      setLoading(false);
      return;
    }

    try {
      await addUserSafe({
        username: username.trim(),
        password,
        role: 'Quản trị'
      });

      setSuccess(true);
    } catch (err: any) {
      setError('Lỗi tạo tài khoản: ' + (err.message || 'Unknown error'));
      setLoading(false);
    }
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-500">Đang kiểm tra hệ thống...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-zinc-900 p-8 rounded-2xl shadow-xl border border-zinc-800 max-w-sm w-full text-center"
        >
          <div className="w-16 h-16 bg-emerald-900/30 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Thiết Lập Thành Công!</h2>
          <p className="text-zinc-400 text-sm mb-6">
            Tài khoản Quản trị cấp cao <strong className="text-emerald-400">{username}</strong> đã được khởi tạo thành công.
          </p>
          <button
            onClick={() => navigate('/admin/login')}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            Đến Trang Đăng Nhập
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900 p-8 rounded-2xl shadow-xl border border-zinc-800 max-w-sm w-full"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl">
            <Shield size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Khởi Tạo Quản Trị Viên</h2>
            <p className="text-xs text-zinc-400">Tạo tài khoản admin đầu tiên</p>
          </div>
        </div>

        {hasAdmin && (
          <div className="mb-4 p-3 bg-amber-950/40 border border-amber-800/40 rounded-xl text-xs text-amber-300">
            Hệ thống đã có tài khoản quản trị hoạt động. Bạn có thể đăng nhập hoặc khởi tạo thêm tài khoản quản trị mới bên dưới.
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-xs text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSetup} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Tên đăng nhập</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-3 text-zinc-500" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ví dụ: admin_root"
                className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-1">Mật khẩu</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-3 text-zinc-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Ít nhất 6 ký tự"
                className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-sm transition-all mt-2 cursor-pointer flex items-center justify-center gap-2"
          >
            <UserPlus size={16} />
            <span>{loading ? 'Đang tạo...' : 'Tạo Tài Khoản Admin'}</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}
