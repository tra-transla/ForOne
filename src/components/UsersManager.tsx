import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2, Plus, ShieldAlert, UserPlus, Edit2, Save, X, Lock, Unlock } from 'lucide-react';
import {
  UserItem,
  fetchUsersSafe,
  addUserSafe,
  updateUserSafe,
  deleteUserSafe,
  toggleUserLockSafe
} from '../lib/schemaFallback';

interface User {
  id: string | number;
  username: string;
  role: string;
  is_locked?: boolean;
}

export default function UsersManager() {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('Điều hành');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState({ username: '', password: '', role: '' });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const data = await fetchUsersSafe();
      setUsers(data as User[]);
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) return;

    try {
      const created = await addUserSafe({
        username: newUsername.trim(),
        password: newPassword,
        role: newRole
      });

      setUsers([...users, created as User]);
      setNewUsername('');
      setNewPassword('');
      setNewRole('Điều hành');
    } catch (error: any) {
      alert('Lỗi khi thêm người dùng: ' + (error?.message || 'Vui lòng thử lại'));
    }
  };

  const handleDeleteUser = async (id: string | number, username: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa người dùng "${username}"?`)) return;

    try {
      await deleteUserSafe(id);
      setUsers(users.filter(u => u.id !== id));
    } catch (error: any) {
      alert('Lỗi khi xóa người dùng: ' + (error?.message || 'Vui lòng thử lại'));
    }
  };

  const handleEditClick = (user: User) => {
    setEditingId(user.id);
    setEditForm({ username: user.username, password: '', role: user.role });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ username: '', password: '', role: '' });
  };

  const handleSaveEdit = async (id: string | number) => {
    if (!editForm.username.trim()) {
      alert('Tên đăng nhập không được để trống');
      return;
    }

    try {
      const updateData: any = {
        role: editForm.role
      };
      if (editForm.password.trim()) {
        updateData.password = editForm.password;
      }

      await updateUserSafe(id, updateData);

      setUsers(users.map(u => 
        u.id === id ? { ...u, role: editForm.role } : u
      ));
      setEditingId(null);
    } catch (error: any) {
      alert('Lỗi khi cập nhật người dùng: ' + (error?.message || 'Vui lòng thử lại'));
    }
  };

  const toggleLock = async (id: string | number, currentStatus: boolean) => {
    try {
      const newStatus = await toggleUserLockSafe(id, currentStatus);
      setUsers(users.map(u => 
        u.id === id ? { ...u, is_locked: newStatus } : u
      ));
    } catch (error: any) {
      alert('Lỗi khi cập nhật trạng thái khóa: ' + (error?.message || 'Vui lòng thử lại'));
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-indigo-100 text-indigo-600 p-2 rounded-lg">
          <ShieldAlert size={20} />
        </div>
        <h2 className="text-xl font-bold text-zinc-900">Quản lý Người dùng</h2>
      </div>

      <form onSubmit={handleAddUser} className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <input
          type="text"
          value={newUsername}
          onChange={(e) => setNewUsername(e.target.value)}
          placeholder="Tên đăng nhập..."
          className="px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          required
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Mật khẩu..."
          className="px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
          required
        />
        <select
          value={newRole}
          onChange={(e) => setNewRole(e.target.value)}
          className="px-4 py-2 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
        >
          <option value="Điều hành">Điều hành</option>
          <option value="Quản trị">Quản trị</option>
        </select>
        <button
          type="submit"
          disabled={!newUsername.trim() || !newPassword.trim()}
          className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <UserPlus size={18} />
          Thêm
        </button>
      </form>

      {loading ? (
        <div className="text-center py-8 text-zinc-500">Đang tải...</div>
      ) : (
        <div className="border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-sm font-medium text-zinc-500 uppercase tracking-wider">
                <th className="px-6 py-4">Tên đăng nhập</th>
                <th className="px-6 py-4">Vai trò</th>
                <th className="px-6 py-4 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-zinc-500">
                    Chưa có người dùng nào
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className={`hover:bg-zinc-50 transition-colors ${u.is_locked ? 'opacity-60' : ''}`}>
                    {editingId === u.id ? (
                      <>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={editForm.username}
                            onChange={e => setEditForm({...editForm, username: e.target.value})}
                            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Tên đăng nhập"
                          />
                          <input
                            type="password"
                            value={editForm.password}
                            onChange={e => setEditForm({...editForm, password: e.target.value})}
                            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none mt-2"
                            placeholder="Mật khẩu mới (để trống nếu không đổi)"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={editForm.role}
                            onChange={e => setEditForm({...editForm, role: e.target.value})}
                            className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                          >
                            <option value="Điều hành">Điều hành</option>
                            <option value="Quản trị">Quản trị</option>
                          </select>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleSaveEdit(u.id)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors font-medium"
                              title="Lưu"
                            >
                              <Save size={16} />
                              <span>Lưu</span>
                            </button>
                            <button 
                              onClick={handleCancelEdit}
                              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 rounded-lg transition-colors font-medium"
                              title="Hủy"
                            >
                              <X size={16} />
                              <span>Hủy</span>
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 font-medium text-zinc-900 flex items-center gap-2">
                          {u.username}
                          {u.is_locked && <Lock size={14} className="text-red-500" title="Tài khoản đã bị khóa" />}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                            u.role === 'Quản trị' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => toggleLock(u.id, !!u.is_locked)}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors font-medium ${
                                u.is_locked 
                                  ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                                  : 'bg-amber-50 text-amber-600 hover:bg-amber-100'
                              }`}
                              title={u.is_locked ? "Mở khóa" : "Khóa tài khoản"}
                            >
                              {u.is_locked ? <Unlock size={16} /> : <Lock size={16} />}
                              <span className="hidden sm:inline">{u.is_locked ? "Mở khóa" : "Khóa"}</span>
                            </button>
                            <button 
                              onClick={() => handleEditClick(u)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors font-medium"
                              title="Chỉnh sửa"
                            >
                              <Edit2 size={16} />
                              <span className="hidden sm:inline">Sửa</span>
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors font-medium"
                              title="Xóa người dùng"
                            >
                              <Trash2 size={16} />
                              <span className="hidden sm:inline">Xóa</span>
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
