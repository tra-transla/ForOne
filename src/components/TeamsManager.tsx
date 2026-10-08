import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2, Plus, Users, Edit2, Save, X, Swords, Lock, Unlock, ShieldAlert } from 'lucide-react';
import {
  TeamItem,
  fetchTeamsSafe,
  addTeamSafe,
  updateTeamSafe,
  deleteTeamSafe,
  toggleTeamLockSafe,
  fetchRegistrationsSafe,
  RegistrationItem
} from '../lib/schemaFallback';

export default function TeamsManager() {
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [editingTeamKey, setEditingTeamKey] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');

  useEffect(() => {
    loadData();

    const handleTeamsUpdate = () => loadData();
    const handleRegsUpdate = () => loadRegistrations();

    window.addEventListener('teams_updated', handleTeamsUpdate);
    window.addEventListener('registrations_updated', handleRegsUpdate);

    // Subscribe to real-time changes
    const teamsSubscription = supabase
      .channel('manager:teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      window.removeEventListener('teams_updated', handleTeamsUpdate);
      window.removeEventListener('registrations_updated', handleRegsUpdate);
      supabase.removeChannel(teamsSubscription);
    };
  }, []);

  const loadData = async () => {
    try {
      const { data } = await fetchTeamsSafe();
      if (data) setTeams(data);
      await loadRegistrations();
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
    }
  };

  const loadRegistrations = async () => {
    try {
      const { data } = await fetchRegistrationsSafe();
      if (data) setRegistrations(data);
    } catch {}
  };

  const getMemberCount = (teamName: string) => {
    return registrations.filter(r => r.team === teamName).length;
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTeamName.trim();
    if (!trimmed) return;

    if (teams.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Tên team này đã tồn tại!');
      return;
    }

    setIsSubmitting(true);
    try {
      await addTeamSafe(trimmed);
      setNewTeamName('');
      await loadData();
    } catch (error: any) {
      alert('Lỗi khi thêm team: ' + (error?.message || 'Vui lòng thử lại'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (team: TeamItem) => {
    setEditingTeamKey(team.id || team.name);
    setEditTeamName(team.name);
  };

  const handleCancelEdit = () => {
    setEditingTeamKey(null);
    setEditTeamName('');
  };

  const handleSaveEdit = async (team: TeamItem) => {
    const trimmed = editTeamName.trim();
    if (!trimmed) return;

    if (trimmed !== team.name && teams.some(t => t.name.toLowerCase() === trimmed.toLowerCase())) {
      alert('Tên team mới đã bị trùng với một team khác!');
      return;
    }

    try {
      await updateTeamSafe(team.id || team.name, team.name, trimmed);
      setEditingTeamKey(null);
      setEditTeamName('');
      await loadData();
    } catch (error: any) {
      alert('Lỗi khi cập nhật tên team: ' + (error?.message || 'Vui lòng thử lại'));
    }
  };

  const handleToggleLock = async (team: TeamItem) => {
    try {
      const newStatus = await toggleTeamLockSafe(team);
      setTeams(prev => prev.map(t => (t.name === team.name) ? { ...t, is_locked: newStatus } : t));
    } catch {
      // safe fallback
    }
  };

  const handleDeleteTeam = async (team: TeamItem) => {
    const count = getMemberCount(team.name);
    let confirmMsg = `Bạn có chắc chắn muốn xóa team "${team.name}"?`;
    if (count > 0) {
      confirmMsg = `CẢNH BÁO: Team "${team.name}" hiện đang có ${count} thành viên đã đăng ký!\nBạn có chắc chắn muốn xóa team này không?`;
    }

    if (!window.confirm(confirmMsg)) return;

    try {
      await deleteTeamSafe(team.id || team.name, team.name);
      await loadData();
    } catch (error: any) {
      alert('Lỗi khi xóa team: ' + (error?.message || 'Vui lòng thử lại'));
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-100 text-indigo-600 p-2.5 rounded-xl">
            <Users size={22} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-zinc-900">Quản lý Team</h2>
            <p className="text-sm text-zinc-500">
              Thêm, sửa tên, xóa team và chốt danh sách đăng ký. Danh sách ngoài trang chủ sẽ hiển thị theo các team tại đây.
            </p>
          </div>
        </div>

        <div className="bg-zinc-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-600 self-start md:self-auto">
          Tổng số: <span className="text-indigo-600">{teams.length}</span> Team
        </div>
      </div>

      {/* Add team form */}
      <form onSubmit={handleAddTeam} className="flex flex-col sm:flex-row gap-3 mb-8">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
            <Swords size={18} />
          </div>
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Nhập tên team mới (ví dụ: Team 5: Biệt Đội Thép)..."
            className="w-full pl-10 pr-4 py-2.5 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={!newTeamName.trim() || isSubmitting}
          className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm whitespace-nowrap shadow-sm"
        >
          <Plus size={18} />
          <span>Thêm Team</span>
        </button>
      </form>

      {loading ? (
        <div className="text-center py-12 text-zinc-500">Đang tải danh sách team...</div>
      ) : (
        <div className="border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="px-6 py-3.5">STT</th>
                <th className="px-6 py-3.5">Tên Team</th>
                <th className="px-6 py-3.5 text-center">Quân số</th>
                <th className="px-6 py-3.5 text-center">Trạng thái</th>
                <th className="px-6 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm">
              {teams.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-zinc-500">
                    Chưa có team nào được tạo. Hãy thêm team đầu tiên ở trên!
                  </td>
                </tr>
              ) : (
                teams.map((team, index) => {
                  const isEditing = editingTeamKey === (team.id || team.name);
                  const memberCount = getMemberCount(team.name);

                  return (
                    <tr key={team.id || team.name} className="hover:bg-zinc-50/80 transition-colors">
                      <td className="px-6 py-4 text-xs font-medium text-zinc-400 w-12">
                        {index + 1}
                      </td>

                      {isEditing ? (
                        <>
                          <td colSpan={3} className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editTeamName}
                                onChange={(e) => setEditTeamName(e.target.value)}
                                className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit(team);
                                  if (e.key === 'Escape') handleCancelEdit();
                                }}
                              />
                            </div>
                            <p className="text-xs text-amber-600 mt-1">
                              * Đổi tên team sẽ tự động đồng bộ tên mới cho tất cả các thành viên đã đăng ký.
                            </p>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button 
                                onClick={() => handleSaveEdit(team)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg transition-colors font-medium text-xs shadow-sm"
                                title="Lưu thay đổi"
                              >
                                <Save size={14} />
                                <span>Lưu</span>
                              </button>
                              <button 
                                onClick={handleCancelEdit}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-200 text-zinc-700 hover:bg-zinc-300 rounded-lg transition-colors font-medium text-xs"
                                title="Hủy"
                              >
                                <X size={14} />
                                <span>Hủy</span>
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 font-semibold text-zinc-900">
                            <div className="flex items-center gap-2.5">
                              <Swords size={16} className="text-zinc-400 flex-shrink-0" />
                              <span>{team.name}</span>
                            </div>
                          </td>

                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                              memberCount > 0 
                                ? 'bg-indigo-50 text-indigo-700' 
                                : 'bg-zinc-100 text-zinc-500'
                            }`}>
                              {memberCount} thành viên
                            </span>
                          </td>

                          <td className="px-6 py-4 text-center">
                            {team.is_locked ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                <Lock size={12} />
                                Đã chốt
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                <Unlock size={12} />
                                Mở đăng ký
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {/* Toggle lock */}
                              <button 
                                onClick={() => handleToggleLock(team)}
                                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-colors text-xs font-medium ${
                                  team.is_locked 
                                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200' 
                                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                                }`}
                                title={team.is_locked ? "Mở lại đăng ký cho team này" : "Chốt danh sách (không cho đăng ký thêm)"}
                              >
                                {team.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
                                <span>{team.is_locked ? "Mở chốt" : "Chốt team"}</span>
                              </button>

                              {/* Edit name */}
                              <button 
                                onClick={() => handleEditClick(team)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors text-xs font-medium"
                                title="Sửa tên team"
                              >
                                <Edit2 size={14} />
                                <span>Sửa tên</span>
                              </button>

                              {/* Delete team */}
                              <button 
                                onClick={() => handleDeleteTeam(team)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors text-xs font-medium"
                                title="Xóa team khỏi hệ thống"
                              >
                                <Trash2 size={14} />
                                <span>Xóa</span>
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
