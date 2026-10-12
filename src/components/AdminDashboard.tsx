import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { LogOut, Edit2, Trash2, Search, Users, Shield, Save, X, Settings, UserCog, User, Swords, Megaphone, Trophy, Calendar, Database, CheckCircle2, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';
import TeamsManager from './TeamsManager';
import UsersManager from './UsersManager';
import NewsManager from './NewsManager';
import CampaignSettingsManager from './CampaignSettingsManager';
import DatabaseManager from './DatabaseManager';
import {
  fetchTeamsSafe,
  fetchRegistrationsSafe,
  toggleWinnerSafe,
  updateRegistrationSafe,
  deleteRegistrationSafe
} from '../lib/schemaFallback';

interface Registration {
  id: string | number;
  team: string;
  in_game_name: string;
  tanks: string;
  is_winner?: boolean;
  created_at: string;
}

interface TeamOption {
  name: string;
  is_locked: boolean;
}

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'registrations' | 'teams' | 'users' | 'news' | 'campaign' | 'database'>('registrations');
  
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editForm, setEditForm] = useState({ team: '', inGameName: '', tanks: '' });

  const [deletingReg, setDeletingReg] = useState<Registration | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchRegistrations();
    fetchTeams();

    const handleTeamsUpdate = () => fetchTeams();
    const handleRegistrationsUpdate = () => fetchRegistrations();

    window.addEventListener('teams_updated', handleTeamsUpdate);
    window.addEventListener('registrations_updated', handleRegistrationsUpdate);

    const interval = setInterval(() => {
      fetchRegistrations();
      fetchTeams();
    }, 15000);

    return () => {
      clearInterval(interval);
      window.removeEventListener('teams_updated', handleTeamsUpdate);
      window.removeEventListener('registrations_updated', handleRegistrationsUpdate);
    };
  }, []);

  const fetchRegistrations = async () => {
    try {
      const { data } = await fetchRegistrationsSafe();
      const sorted = [...(data || [])].sort((a, b) => {
        if (a.team !== b.team) return (a.team || '').localeCompare(b.team || '');
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setRegistrations(sorted);
    } catch {
      // safe fallback already handled
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const { data } = await fetchTeamsSafe();
      if (data) setTeams(data.map(t => ({ name: t.name, is_locked: t.is_locked || false })));
    } catch {
      // safe fallback already handled
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const handleEditClick = (reg: Registration) => {
    setEditingId(reg.id);
    setEditForm({
      team: reg.team,
      inGameName: reg.in_game_name,
      tanks: reg.tanks
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id: string | number) => {
    if (!editForm.team.trim() || !editForm.inGameName.trim() || !editForm.tanks.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Vui lòng điền đầy đủ thông tin' });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }

    try {
      await updateRegistrationSafe(id, {
        team: editForm.team.trim(),
        in_game_name: editForm.inGameName.trim(),
        tanks: editForm.tanks.trim()
      });

      setRegistrations(registrations.map(reg => 
        reg.id === id ? { ...reg, team: editForm.team.trim(), in_game_name: editForm.inGameName.trim(), tanks: editForm.tanks.trim() } : reg
      ));
      setEditingId(null);
      setFeedbackMsg({ type: 'success', text: 'Cập nhật thành công thông tin đăng ký!' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (error: any) {
      setFeedbackMsg({ type: 'error', text: 'Lỗi khi cập nhật: ' + (error?.message || 'Vui lòng thử lại') });
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const toggleWinner = async (id: string | number, currentStatus: boolean) => {
    const target = registrations.find(r => r.id === id);
    try {
      const newStatus = await toggleWinnerSafe(id, currentStatus, target?.in_game_name);
      setRegistrations(registrations.map(reg => 
        reg.id === id ? { ...reg, is_winner: newStatus } : reg
      ));
    } catch {
      // safe fallback
    }
  };

  const isAdmin = Boolean(
    user?.role === 'Quản trị' ||
    user?.role === 'Admin' ||
    user?.role === 'admin' ||
    (user?.role && user.role.toLowerCase().includes('quản')) ||
    (user?.role && user.role.toLowerCase().includes('admin'))
  );

  const canManage = Boolean(
    isAdmin ||
    !user?.role ||
    user.role === 'Điều hành' ||
    (user?.role && user.role.toLowerCase().includes('điều'))
  );

  useEffect(() => {
    if (activeTab === 'database' && !isAdmin) {
      setActiveTab('registrations');
    }
  }, [activeTab, isAdmin]);

  const handleDeleteClick = (reg: Registration) => {
    if (!canManage) {
      setFeedbackMsg({ type: 'error', text: 'Chỉ Quản trị viên và Điều hành mới có quyền xóa đăng ký.' });
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }
    setDeletingReg(reg);
  };

  const handleConfirmDelete = async () => {
    if (!deletingReg) return;
    setIsDeleting(true);
    try {
      await deleteRegistrationSafe(deletingReg.id, {
        in_game_name: deletingReg.in_game_name,
        team: deletingReg.team
      });
      // Immediately remove from local state
      setRegistrations(prev => prev.filter(r => String(r.id) !== String(deletingReg.id) && r.in_game_name !== deletingReg.in_game_name));
      setFeedbackMsg({
        type: 'success',
        text: `Đã xóa thành công đăng ký của chiến binh "${deletingReg.in_game_name}"!`
      });
      setDeletingReg(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
      // Refresh to ensure database consistency
      fetchRegistrations();
    } catch (error: any) {
      setFeedbackMsg({
        type: 'error',
        text: 'Lỗi khi xóa đăng ký: ' + (error?.message || 'Vui lòng thử lại')
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRegistrations = registrations
    .filter(reg => 
      (reg.team || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (reg.in_game_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (reg.tanks || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const teamA = a.team || '';
      const teamB = b.team || '';
      return teamA.localeCompare(teamB);
    });

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-zinc-900 text-white p-2 rounded-lg">
                <Shield size={20} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-zinc-900">Campaign 2026</h1>
                <p className="text-xs text-zinc-500 font-medium">Bảng Điều Khiển</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden md:flex items-center gap-2 text-sm text-zinc-600 bg-zinc-100 px-3 py-1.5 rounded-full">
                <User size={16} />
                <span className="font-medium">{user?.username}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  user?.role === 'Quản trị' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {user?.role}
                </span>
              </div>
              <button 
                onClick={handleLogout}
                className="text-zinc-500 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                title="Đăng xuất"
              >
                <LogOut size={20} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        


        {/* Feedback Notification Alert */}
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

        {/* Tabs */}
        <div className="flex gap-4 mb-8 border-b border-zinc-200 pb-px">
          <button
            onClick={() => setActiveTab('registrations')}
            className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'registrations' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
            }`}
          >
            <Users size={18} />
            Đăng ký
          </button>
          
          {canManage && (
            <>
              <button
                onClick={() => setActiveTab('teams')}
                className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                  activeTab === 'teams' 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                }`}
              >
                <Settings size={18} />
                Quản lý Team
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('users')}
                  className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'users' 
                      ? 'border-indigo-600 text-indigo-600' 
                      : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                  }`}
                >
                  <UserCog size={18} />
                  Quản lý Người dùng
                </button>
              )}
              <button
                onClick={() => setActiveTab('news')}
                className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'news' 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                }`}
              >
                <Megaphone size={18} />
                Quản lý Tin tức
              </button>
              <button
                onClick={() => setActiveTab('campaign')}
                className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                  activeTab === 'campaign' 
                    ? 'border-indigo-600 text-indigo-600' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                }`}
              >
                <Calendar size={18} />
                Thời gian sự kiện
              </button>
              {isAdmin && (
                <button
                  onClick={() => setActiveTab('database')}
                  className={`pb-4 px-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
                    activeTab === 'database' 
                      ? 'border-indigo-600 text-indigo-600' 
                      : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                  }`}
                >
                  <Database size={18} />
                  Aiven MySQL &amp; SQLite
                </button>
              )}
            </>
          )}
        </div>

        {activeTab === 'teams' && canManage && <TeamsManager />}
        {activeTab === 'users' && isAdmin && <UsersManager />}
        {activeTab === 'news' && canManage && <NewsManager />}
        {activeTab === 'campaign' && canManage && <CampaignSettingsManager />}
        {activeTab === 'database' && isAdmin && <DatabaseManager />}

        {activeTab === 'registrations' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Stats & Search */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
              <div className="bg-white px-6 py-4 rounded-2xl shadow-sm border border-zinc-200 flex items-center gap-4">
                <div className="bg-indigo-100 text-indigo-600 p-3 rounded-xl">
                  <Users size={24} />
                </div>
                <div>
                  <p className="text-sm text-zinc-500 font-medium">Tổng số đăng ký</p>
                  <p className="text-2xl font-bold text-zinc-900">{registrations.length}</p>
                </div>
              </div>

              <div className="relative w-full md:w-96">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <Search size={18} />
                </div>
                <input
                  type="text"
                  placeholder="Tìm kiếm theo team, tên, tanks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-zinc-200 rounded-xl text-zinc-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50 border-b border-zinc-200 text-sm font-medium text-zinc-500 uppercase tracking-wider">
                      <th className="px-6 py-4">Team</th>
                      <th className="px-6 py-4">Tên trong game</th>
                      <th className="px-6 py-4">Tanks</th>
                      <th className="px-6 py-4">Ngày đăng ký</th>
                      <th className="px-6 py-4 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 text-sm">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                          Đang tải dữ liệu...
                        </td>
                      </tr>
                    ) : filteredRegistrations.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                          Không tìm thấy dữ liệu đăng ký nào.
                        </td>
                      </tr>
                    ) : (
                      filteredRegistrations.map((reg) => (
                        <tr key={reg.id} className="hover:bg-zinc-50/50 transition-colors group">
                          {editingId === reg.id ? (
                            <>
                              <td className="px-6 py-4">
                                <select
                                  value={editForm.team}
                                  onChange={e => setEditForm({...editForm, team: e.target.value})}
                                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                >
                                  {teams.map(t => (
                                    <option key={t.name} value={t.name}>{t.name} {t.is_locked ? '(Đã chốt)' : ''}</option>
                                  ))}
                                  {!teams.find(t => t.name === editForm.team) && (
                                    <option value={editForm.team}>{editForm.team}</option>
                                  )}
                                </select>
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                  type="text" 
                                  value={editForm.inGameName} 
                                  onChange={e => setEditForm({...editForm, inGameName: e.target.value})}
                                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </td>
                              <td className="px-6 py-4">
                                <input 
                                  type="text" 
                                  value={editForm.tanks} 
                                  onChange={e => setEditForm({...editForm, tanks: e.target.value})}
                                  className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                              </td>
                              <td className="px-6 py-4 text-zinc-500">
                                {new Date(reg.created_at).toLocaleDateString('vi-VN')}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => handleSaveEdit(reg.id)}
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
                              <td className="px-6 py-4 font-medium text-zinc-900">
                                <div className="flex items-center gap-2">
                                  <Swords size={14} className="text-zinc-400" />
                                  {reg.team}
                                </div>
                              </td>
                              <td className="px-6 py-4">{reg.in_game_name}</td>
                              <td className="px-6 py-4">{reg.tanks}</td>
                              <td className="px-6 py-4 text-zinc-500">
                                {new Date(reg.created_at).toLocaleDateString('vi-VN')}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <button 
                                    onClick={() => toggleWinner(reg.id, !!reg.is_winner)}
                                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors font-medium ${
                                      reg.is_winner 
                                        ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' 
                                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                    }`}
                                    title={reg.is_winner ? "Bỏ chọn kết quả" : "Chọn vào kết quả"}
                                  >
                                    <Trophy size={16} className={reg.is_winner ? "fill-yellow-500 text-yellow-500" : ""} />
                                    <span>Kết quả</span>
                                  </button>
                                  <button 
                                    onClick={() => handleEditClick(reg)}
                                    className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors font-medium"
                                    title="Chỉnh sửa"
                                  >
                                    <Edit2 size={16} />
                                    <span>Sửa</span>
                                  </button>
                                  {canManage && (
                                    <button 
                                      onClick={() => handleDeleteClick(reg)}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors font-medium cursor-pointer"
                                      title="Xóa đăng ký"
                                    >
                                      <Trash2 size={16} />
                                      <span>Xóa</span>
                                    </button>
                                  )}
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
            </div>
          </motion.div>
        )}

        {/* Modal Xác nhận Xóa trong Giao diện (Không dùng window.confirm) */}
        {deletingReg && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 mb-4 text-red-600">
                <div className="p-3 bg-red-100 rounded-xl">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Xác nhận xóa đăng ký</h3>
                  <p className="text-xs text-zinc-500">Dữ liệu sẽ được xóa hoàn toàn khỏi Database</p>
                </div>
              </div>

              <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 text-xs text-zinc-700 space-y-2 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Đội tuyển:</span>
                  <strong className="text-zinc-900">{deletingReg.team}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Nick in-game:</span>
                  <strong className="text-indigo-600 font-mono text-sm">{deletingReg.in_game_name}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 font-medium">Xe đăng ký:</span>
                  <strong className="text-zinc-900">{deletingReg.tanks}</strong>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingReg(null)}
                  disabled={isDeleting}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  <span>{isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
