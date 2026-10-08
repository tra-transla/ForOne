import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Send, CheckCircle2, Users, Swords, ChevronDown, ChevronRight, Megaphone, Trophy, Lock, Unlock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  CampaignSettings,
  fetchCampaignSettings,
  getStoredCampaignSettings,
} from '../lib/campaignSettings';
import {
  TeamItem,
  RegistrationItem,
  fetchTeamsSafe,
  fetchRegistrationsSafe,
  addRegistrationSafe,
  fetchNewsSafe
} from '../lib/schemaFallback';

export default function RegistrationForm() {
  const [formData, setFormData] = useState({
    team: '',
    inGameName: '',
    tanks: ''
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingRegistrations, setLoadingRegistrations] = useState(true);
  const [listTab, setListTab] = useState<'all' | 'results'>('all');
  const [news, setNews] = useState<any[]>([]);
  const [expandedTeams, setExpandedTeams] = useState<Record<string, boolean>>({});
  const [campaignSettings, setCampaignSettings] = useState<CampaignSettings>(getStoredCampaignSettings);

  useEffect(() => {
    fetchRegistrations();
    fetchTeams();
    fetchNews();

    // Fetch campaign settings
    const loadCampaign = async () => {
      const data = await fetchCampaignSettings();
      setCampaignSettings(data);
    };
    loadCampaign();

    // Listen to custom update events
    const handleSettingsUpdate = (e: any) => {
      if (e.detail) setCampaignSettings(e.detail);
    };
    const handleTeamsUpdate = () => fetchTeams();
    const handleRegistrationsUpdate = () => fetchRegistrations();
    const handleNewsUpdate = () => fetchNews();

    window.addEventListener('campaign_settings_updated', handleSettingsUpdate);
    window.addEventListener('teams_updated', handleTeamsUpdate);
    window.addEventListener('registrations_updated', handleRegistrationsUpdate);
    window.addEventListener('news_updated', handleNewsUpdate);

    // Subscribe to real-time changes
    const registrationsSubscription = supabase
      .channel('public:registrations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        fetchRegistrations();
      })
      .subscribe();

    const teamsSubscription = supabase
      .channel('public:teams')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, () => {
        fetchTeams();
      })
      .subscribe();

    const campaignSubscription = supabase
      .channel('public:campaign_settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_settings' }, () => {
        loadCampaign();
      })
      .subscribe();

    return () => {
      window.removeEventListener('campaign_settings_updated', handleSettingsUpdate);
      window.removeEventListener('teams_updated', handleTeamsUpdate);
      window.removeEventListener('registrations_updated', handleRegistrationsUpdate);
      window.removeEventListener('news_updated', handleNewsUpdate);
      supabase.removeChannel(registrationsSubscription);
      supabase.removeChannel(teamsSubscription);
      supabase.removeChannel(campaignSubscription);
    };
  }, []);

  const fetchTeams = async () => {
    try {
      const { data } = await fetchTeamsSafe();
      if (data) {
        setTeams(data);
        // Default select first available unlocked team if none selected
        if (!formData.team) {
          const firstUnlocked = data.find(t => !t.is_locked);
          if (firstUnlocked) {
            setFormData(prev => ({ ...prev, team: prev.team || firstUnlocked.name }));
          }
        }
      }
    } catch {
      // safe fallback
    } finally {
      setLoadingTeams(false);
    }
  };

  const fetchNews = async () => {
    try {
      const { data } = await fetchNewsSafe();
      if (data) setNews(data);
    } catch {}
  };

  const toggleTeam = (teamName: string) => {
    setExpandedTeams(prev => ({
      ...prev,
      [teamName]: prev[teamName] === false ? true : false
    }));
  };

  const fetchRegistrations = async () => {
    try {
      const { data } = await fetchRegistrationsSafe();
      if (data) setRegistrations(data);
    } catch {
      // safe fallback
    } finally {
      setLoadingRegistrations(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('submitting');
    setErrorMessage('');

    if (!formData.team.trim() || !formData.inGameName.trim() || !formData.tanks.trim()) {
      setStatus('error');
      setErrorMessage('Vui lòng điền đầy đủ thông tin.');
      return;
    }

    const selectedTeam = teams.find(t => t.name === formData.team);
    if (selectedTeam?.is_locked) {
      setStatus('error');
      setErrorMessage(`Team "${formData.team}" đã chốt danh sách, không thể đăng ký thêm.`);
      return;
    }

    try {
      await addRegistrationSafe({
        team: formData.team,
        in_game_name: formData.inGameName,
        tanks: formData.tanks
      });

      setStatus('success');
      setFormData(prev => ({ ...prev, inGameName: '', tanks: '' }));
      fetchRegistrations();
    } catch (error: any) {
      setStatus('error');
      setErrorMessage(error.message || 'Có lỗi xảy ra, vui lòng thử lại sau.');
    }
  };

  // Filter winners for Results tab
  const winnerRegistrations = registrations.filter(reg => reg.is_winner);

  // Group registrations by team
  const registrationsByTeamName = registrations.reduce((acc, reg) => {
    const tName = reg.team || 'Khác';
    if (!acc[tName]) acc[tName] = [];
    acc[tName].push(reg);
    return acc;
  }, {} as Record<string, RegistrationItem[]>);

  // Find any orphan registrations that don't belong to any team currently in teams list
  const teamNamesSet = new Set(teams.map(t => t.name));
  const otherTeamsWithRegs = Object.keys(registrationsByTeamName).filter(name => !teamNamesSet.has(name));

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-8 rounded-2xl shadow-sm border border-zinc-100 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={32} />
          </div>
          <h2 className="text-2xl font-semibold text-zinc-900 mb-2">Đăng ký thành công!</h2>
          <p className="text-zinc-500 mb-8">
            Cảm ơn bạn đã đăng ký tham gia {campaignSettings.campaign_name || 'Campaign 2026'}.
          </p>
          <button 
            onClick={() => setStatus('idle')}
            className="w-full bg-tank-camo bg-tank-camo-hover text-camo-light py-3 rounded-xl font-medium transition-colors"
          >
            Đăng ký thêm
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <img 
            src="https://i.ibb.co/nsCSz9mT/AFO.png" 
            alt="Campaign Logo" 
            className="w-[75px] h-[75px] object-contain drop-shadow-sm"
          />
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-900">
              {campaignSettings.campaign_name || 'Campaign 2026'}
            </h1>
            <p className="text-zinc-500 text-sm md:text-base">
              {campaignSettings.phase_name || 'Spring Maneuvers'}: <span className="font-medium text-zinc-700">{campaignSettings.start_date}</span> đến <span className="font-medium text-zinc-700">{campaignSettings.end_date}</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column - Form */}
          <div className="lg:col-span-4">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-zinc-100 sticky top-8"
            >
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-zinc-100">
                <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                  <Swords size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-zinc-900">Đăng ký tham gia</h2>
                  <p className="text-xs text-zinc-500">Điền thông tin gia nhập đội chiến dịch</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Chọn Team <span className="text-red-500">*</span>
                  </label>
                  {loadingTeams ? (
                    <div className="text-sm text-zinc-400 py-2">Đang tải danh sách team...</div>
                  ) : teams.length === 0 ? (
                    <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-200">
                      Chưa có team nào được tạo. Vui lòng liên hệ Quản trị viên để thêm team.
                    </div>
                  ) : (
                    <select
                      value={formData.team}
                      onChange={(e) => setFormData({ ...formData, team: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all bg-white text-zinc-800 text-sm font-medium"
                      required
                    >
                      <option value="" disabled>-- Chọn team của bạn --</option>
                      {teams.map(team => (
                        <option 
                          key={team.id || team.name} 
                          value={team.name}
                          disabled={team.is_locked}
                        >
                          {team.name} {team.is_locked ? '🔒 (Đã chốt danh sách)' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {teams.find(t => t.name === formData.team)?.is_locked && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1 font-medium">
                      <Lock size={12} /> Team này đã chốt danh sách. Vui lòng chọn team khác.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Tên trong game (In-game Name) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.inGameName}
                    onChange={(e) => setFormData({ ...formData, inGameName: e.target.value })}
                    placeholder="Ví dụ: PlayerOne123"
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Tanks (Các xe tăng sử dụng) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.tanks}
                    onChange={(e) => setFormData({ ...formData, tanks: e.target.value })}
                    placeholder="Liệt kê các xe tăng bạn sẽ sử dụng..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-all resize-none text-sm"
                    required
                  />
                </div>

                {status === 'error' && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === 'submitting' || teams.length === 0 || teams.find(t => t.name === formData.team)?.is_locked}
                  className="w-full bg-tank-camo bg-tank-camo-hover text-camo-light py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm shadow-sm"
                >
                  {status === 'submitting' ? (
                    'Đang gửi đăng ký...'
                  ) : (
                    <>
                      <Send size={18} />
                      Gửi Đăng Ký
                    </>
                  )}
                </button>
                
                <div className="text-center text-xs font-medium text-zinc-400 pt-2">
                  © 2026 • Ice Tea
                </div>
              </form>
            </motion.div>
            
            <div className="mt-6 text-sm text-zinc-400 text-center lg:text-left">
              <a href="/admin/login" className="hover:text-zinc-600 transition-colors font-medium">
                → Trang Quản trị viên
              </a>
            </div>
          </div>

          {/* Right Column - Registered Teams & News */}
          <div className="lg:col-span-8 space-y-8">
            {news.length > 0 && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-zinc-100"
              >
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-zinc-100">
                  <div className="bg-indigo-50 p-2 rounded-lg text-indigo-600">
                    <Megaphone size={22} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900">Tin tức mới nhất</h2>
                    <p className="text-sm text-zinc-500">Thông báo từ ban tổ chức chiến dịch</p>
                  </div>
                </div>
                <div className="max-h-[260px] overflow-y-auto pr-2 space-y-4 custom-scrollbar">
                  {news.map((item) => (
                    <div key={item.id} className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                      <h3 className="font-bold text-base text-zinc-900 mb-1.5">{item.title}</h3>
                      <p className="text-zinc-600 whitespace-pre-wrap text-sm mb-2">{item.content}</p>
                      <div className="text-xs text-zinc-400">
                        {new Date(item.created_at).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-zinc-100 min-h-[500px]"
            >
              {/* Header with Switcher */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-4 border-b border-zinc-100">
                <div className="flex items-center gap-3">
                  <div className="bg-zinc-100 p-2 rounded-lg text-zinc-600">
                    <Users size={22} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-zinc-900">Danh sách đăng ký theo Team</h2>
                    <p className="text-sm text-zinc-500">
                      Danh sách đội và thành viên được hiển thị chính xác theo cấu hình Quản trị
                    </p>
                  </div>
                </div>

                <div className="flex bg-zinc-100 p-1 rounded-xl">
                  <button
                    onClick={() => setListTab('results')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                      listTab === 'results' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    <Trophy size={16} className={listTab === 'results' ? "text-yellow-500" : ""} />
                    <span>Kết quả ({winnerRegistrations.length})</span>
                  </button>
                  <button
                    onClick={() => setListTab('all')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      listTab === 'all' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                    }`}
                  >
                    Danh sách các Team ({teams.length})
                  </button>
                </div>
              </div>

              {loadingRegistrations || loadingTeams ? (
                <div className="flex justify-center items-center h-64 text-zinc-500 text-sm">
                  Đang tải dữ liệu chiến dịch...
                </div>
              ) : listTab === 'results' ? (
                /* Results Tab */
                winnerRegistrations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                    <Trophy size={48} className="mb-4 opacity-20" />
                    <p className="text-sm">Chưa có kết quả hoặc danh sách nhận xe nào được công bố</p>
                  </div>
                ) : (
                  <div className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
                    <div className="bg-tank-camo px-4 py-3 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Trophy size={18} className="text-yellow-500 fill-yellow-500" />
                        <h3 className="font-semibold text-camo-light text-sm">Danh sách lấy xe</h3>
                      </div>
                      <span className="bg-camo-accent text-camo-light text-xs px-2.5 py-1 rounded-md font-medium">
                        {winnerRegistrations.length} thành viên
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse bg-white text-sm">
                        <thead>
                          <tr className="bg-zinc-100 border-b border-zinc-200 text-xs font-semibold text-zinc-600">
                            <th className="px-4 py-3 border-r border-zinc-200 w-16 text-center">STT</th>
                            <th className="px-4 py-3 border-r border-zinc-200">Nick ingame</th>
                            <th className="px-4 py-3">Team</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200">
                          {winnerRegistrations.map((member, index) => (
                            <tr key={member.id} className="hover:bg-zinc-50/70 transition-colors">
                              <td className="px-4 py-3 text-zinc-500 border-r border-zinc-200 text-center font-medium">{index + 1}</td>
                              <td className="px-4 py-3 font-semibold text-zinc-900 border-r border-zinc-200">{member.in_game_name}</td>
                              <td className="px-4 py-3 text-zinc-600 font-medium">{member.team}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              ) : (
                /* All Teams Tab - RENDERED STRICTLY BASED ON CREATED TEAMS */
                teams.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                    <Users size={48} className="mb-4 opacity-20" />
                    <p className="text-sm">Chưa có team nào được tạo trong hệ thống</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Render every created team in order */}
                    {teams.map((team) => {
                      const members = registrationsByTeamName[team.name] || [];
                      const isExpanded = expandedTeams[team.name] !== false; // default expanded

                      return (
                        <div key={team.id || team.name} className="bg-zinc-50 rounded-xl border border-zinc-200 overflow-hidden shadow-sm flex flex-col">
                          {/* Team Card Header */}
                          <div 
                            className="bg-tank-camo px-4 py-3.5 flex justify-between items-center cursor-pointer select-none transition-opacity hover:opacity-95"
                            onClick={() => toggleTeam(team.name)}
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              {isExpanded ? (
                                <ChevronDown size={18} className="text-camo-accent flex-shrink-0" />
                              ) : (
                                <ChevronRight size={18} className="text-camo-accent flex-shrink-0" />
                              )}
                              <Swords size={18} className="text-camo-accent flex-shrink-0" />
                              <h3 className="font-semibold text-camo-light text-sm truncate" title={team.name}>
                                {team.name}
                              </h3>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {team.is_locked ? (
                                <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded flex items-center gap-1 font-medium border border-amber-500/30">
                                  <Lock size={11} />
                                  Chốt
                                </span>
                              ) : (
                                <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded flex items-center gap-1 font-medium border border-emerald-500/30">
                                  <Unlock size={11} />
                                  Mở
                                </span>
                              )}
                              <span className="bg-camo-accent text-camo-light text-xs px-2.5 py-1 rounded-md font-medium">
                                {members.length} tv
                              </span>
                            </div>
                          </div>

                          {/* Team Members List */}
                          {isExpanded && (
                            <div className="p-4 flex-1">
                              {members.length === 0 ? (
                                <div className="text-center py-6 text-zinc-400 text-xs italic">
                                  Chưa có thành viên nào đăng ký vào đội này.
                                  {!team.is_locked && (
                                    <span className="block mt-1 text-indigo-600 font-medium not-italic">
                                      Hãy là người đầu tiên đăng ký!
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <ul className="space-y-3">
                                  {members.map((member, idx) => (
                                    <li 
                                      key={member.id} 
                                      className={`text-sm ${idx !== members.length - 1 ? "border-b border-zinc-200/80 pb-3" : ""}`}
                                    >
                                      <div className="font-medium text-zinc-900 mb-1 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs text-zinc-400 font-mono w-4">{idx + 1}.</span>
                                          <span className="font-semibold">{member.in_game_name}</span>
                                        </div>
                                        {member.is_winner && (
                                          <span className="inline-flex items-center gap-1 text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded font-medium border border-yellow-200">
                                            <Trophy size={12} className="text-yellow-500 fill-yellow-500" />
                                            Lấy xe
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-zinc-500 pl-6">
                                        <span className="font-medium text-zinc-700">Tanks:</span> {member.tanks}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Any legacy / other registrations that were not under the created teams */}
                    {otherTeamsWithRegs.map((otherTeamName) => {
                      const members = registrationsByTeamName[otherTeamName] || [];
                      const isExpanded = expandedTeams[otherTeamName] !== false;

                      return (
                        <div key={otherTeamName} className="bg-zinc-50 rounded-xl border border-dashed border-zinc-300 overflow-hidden shadow-sm flex flex-col">
                          <div 
                            className="bg-zinc-800 px-4 py-3.5 flex justify-between items-center cursor-pointer select-none"
                            onClick={() => toggleTeam(otherTeamName)}
                          >
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown size={18} className="text-zinc-400" />
                              ) : (
                                <ChevronRight size={18} className="text-zinc-400" />
                              )}
                              <h3 className="font-semibold text-zinc-200 text-sm">{otherTeamName} (Đội khác)</h3>
                            </div>
                            <span className="bg-zinc-700 text-zinc-300 text-xs px-2.5 py-1 rounded-md font-medium">
                              {members.length} tv
                            </span>
                          </div>
                          {isExpanded && (
                            <div className="p-4 flex-1">
                              <ul className="space-y-3">
                                {members.map((member, idx) => (
                                  <li key={member.id} className="text-sm border-b border-zinc-200/80 pb-2">
                                    <div className="font-semibold text-zinc-900">{member.in_game_name}</div>
                                    <div className="text-xs text-zinc-500">Tanks: {member.tanks}</div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
