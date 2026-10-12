import React, { useState, useEffect } from 'react';
import { Trash2, Plus, ShieldAlert, UserPlus, Edit2, Save, X, Lock, Unlock, CheckCircle2, AlertTriangle } from 'lucide-react';
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

  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      setFeedbackMsg({ type: 'success', text: `Đã tạo tài khoản "${newUsername.trim()}" thành công!` });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (error: any) {
      setFeedbackMsg({ type: 'error', text: 'Lỗi khi thêm người dùng: ' + (error?.message || 'Vui lòng thử lại') });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleDeleteUser = (user: User) => {
    setDeletingUser(user);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      await deleteUserSafe(deletingUser.id);
      setUsers(prev => prev.filter(u => u.id !== deletingUser.id));
      setFeedbackMsg({ type: 'success', text: `Đã xóa tài khoản "${deletingUser.username}" thành công!` });
      setDeletingUser(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (error: any) {
      setFeedbackMsg({ type: 'error', text: 'Lỗi khi xóa người dùng: ' + (error?.message || 'Vui lòng thử lại') });
    } finally {
      setIsDeleting(false);
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
      setFeedbackMsg({ type: 'error', text: 'Tên đăng nhập không được để trống' });
      setTimeout(() => setFeedbackMsg(null), 4000);
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
      setFeedbackMsg({ type: 'success', text: 'Đã cập nhật thông tin người dùng!' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (error: any) {
      setFeedbackMsg({ type: 'error', text: 'Lỗi khi cập nhật người dùng: ' + (error?.message || 'Vui lòng thử lại') });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const toggleLock = async (id: string | number, currentStatus: boolean) => {
    try {
      const newStatus = await toggleUserLockSafe(id, currentStatus);
      setUsers(users.map(u => 
        u.id === id ? { ...u, is_locked: newStatus } : u
      ));
      setFeedbackMsg({ type: 'success', text: newStatus ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (error: any) {
      setFeedbackMsg({ type: 'error', text: 'Lỗi khi cập nhật trạng thái khóa: ' + (error?.message || 'Vui lòng thử lại') });
      setTimeout(() => setFeedbackMsg(null), 4000);
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

      {feedbackMsg && (
        <div className={`mb-6 p-4 rounded-2xl border text-sm flex items-center justify-between shadow-sm ${
          feedbackMsg.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle size={18} className="text-red-600 shrink-0" />
            )}
            <span className="font-medium">{feedbackMsg.text}</span>
          </div>
          <button 
            onClick={() => setFeedbackMsg(null)}
            className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg"
          >
            <X size={16} />
          </button>
        </div>
      )}

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
                              onClick={() => handleDeleteUser(u)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors font-medium cursor-pointer"
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

      {/* Modal Xác nhận Xóa User */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Xác nhận xóa tài khoản</h3>
                <p className="text-xs text-zinc-500">Xóa vĩnh viễn tài khoản quản trị</p>
              </div>
            </div>

            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 text-xs text-zinc-700 space-y-2 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Tên đăng nhập:</span>
                <strong className="text-zinc-900 text-sm font-mono">{deletingUser.username}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Vai trò:</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                  {deletingUser.role}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingUser(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={14} />
                <span>{isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
