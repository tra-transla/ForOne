import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, User, Lock, UserPlus, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabase';

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
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      if (error) {
        // Nếu lỗi do RLS hoặc kết nối, cứ cho phép thử tạo
      }

      if (count && count > 0) {
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
      const { error: insertError } = await supabase
        .from('users')
        .insert([{ 
          username, 
          password, 
          role: 'Quản trị' 
        }]);

      if (insertError) {
        if (insertError.code === '23505') { // Unique violation
          setError('Tên đăng nhập này đã tồn tại!');
        } else {
          throw insertError;
        }
        setLoading(false);
        return;
      }

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
          <h2 className="text-2xl font-bold text-white mb-2">Tạo Thành Công!</h2>
          <p className="text-zinc-400 mb-8 text-sm">Tài khoản quản trị đã được tạo.</p>
          <button 
            onClick={() => navigate('/admin/login')}
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-500 transition-colors"
          >
            Đến trang Đăng Nhập
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-zinc-900 p-8 rounded-2xl shadow-xl border border-zinc-800 max-w-sm w-full"
      >
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400">
            <UserPlus size={32} />
          </div>
        </div>
        
        <h2 className="text-2xl font-bold text-white text-center mb-2">Khởi Tạo Quản Trị</h2>
        <p className="text-zinc-400 text-center mb-8 text-sm">
          {hasAdmin 
            ? "Hệ thống đã có tài khoản. Bạn có thể tạo thêm tài khoản quản trị mới." 
            : "Tạo tài khoản quản trị đầu tiên cho hệ thống"}
        </p>

        <form onSubmit={handleSetup} className="space-y-5">
          <div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <User size={18} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tên đăng nhập mới"
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
                placeholder="Mật khẩu mới"
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
            {loading ? 'Đang xử lý...' : 'Tạo Tài Khoản'}
          </button>
        </form>
      </motion.div>
      
      <div className="mt-8 text-sm text-zinc-600">
        <a href="/admin/login" className="hover:text-zinc-400 transition-colors">← Quay lại trang đăng nhập</a>
      </div>
    </div>
  );
}
