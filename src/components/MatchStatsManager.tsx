import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Trophy,
  Swords,
  Calendar,
  Plus,
  Trash2,
  Edit2,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  Award,
  BarChart3,
  Flame,
  Info
} from 'lucide-react';
import {
  MatchItem,
  TeamItem,
  fetchMatchesSafe,
  fetchTeamsSafe,
  addMatchSafe,
  updateMatchSafe,
  deleteMatchSafe
} from '../lib/schemaFallback';

interface MatchStatsManagerProps {
  canManage?: boolean;
}

export default function MatchStatsManager({ canManage = true }: MatchStatsManagerProps) {
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTeam, setFilterTeam] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchItem | null>(null);
  const [deletingMatch, setDeletingMatch] = useState<MatchItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formTeamA, setFormTeamA] = useState('');
  const [formTeamB, setFormTeamB] = useState('');
  const [formScoreA, setFormScoreA] = useState<number>(0);
  const [formScoreB, setFormScoreB] = useState<number>(0);
  const [formWinner, setFormWinner] = useState<string>('AUTO'); // AUTO, Team A, Team B, Hòa
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadData();

    const handleMatchesUpdate = () => loadData();
    window.addEventListener('matches_updated', handleMatchesUpdate);
    window.addEventListener('teams_updated', handleMatchesUpdate);

    return () => {
      window.removeEventListener('matches_updated', handleMatchesUpdate);
      window.removeEventListener('teams_updated', handleMatchesUpdate);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [matchesRes, teamsRes] = await Promise.all([
        fetchMatchesSafe(),
        fetchTeamsSafe()
      ]);
      setMatches(matchesRes.data || []);
      setTeams(teamsRes.data || []);
      
      if (teamsRes.data && teamsRes.data.length >= 2 && !formTeamA) {
        setFormTeamA(teamsRes.data[0].name);
        setFormTeamB(teamsRes.data[1].name);
      }
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
    }
  };

  // Helper notice
  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4000);
  };

  // Open modal for new match
  const handleOpenAdd = () => {
    setEditingMatch(null);
    setFormDate(new Date().toISOString().split('T')[0]);
    if (teams.length >= 2) {
      setFormTeamA(teams[0].name);
      setFormTeamB(teams[1].name);
    } else if (teams.length === 1) {
      setFormTeamA(teams[0].name);
      setFormTeamB('');
    }
    setFormScoreA(0);
    setFormScoreB(0);
    setFormWinner('AUTO');
    setFormNotes('');
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (m: MatchItem) => {
    setEditingMatch(m);
    setFormDate(m.match_date || new Date().toISOString().split('T')[0]);
    setFormTeamA(m.team_a);
    setFormTeamB(m.team_b);
    setFormScoreA(m.team_a_score || 0);
    setFormScoreB(m.team_b_score || 0);
    setFormWinner(m.winner_team || 'AUTO');
    setFormNotes(m.notes || '');
    setIsModalOpen(true);
  };

  // Submit match form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTeamA.trim() || !formTeamB.trim()) {
      showFeedback('error', 'Vui lòng chọn hoặc nhập tên cho cả 2 đội thi đấu!');
      return;
    }
    if (formTeamA.trim() === formTeamB.trim()) {
      showFeedback('error', 'Đội A và Đội B không thể là cùng 1 đội!');
      return;
    }

    setIsSubmitting(true);
    try {
      let finalWinner = formWinner;
      let finalLoser = '';

      if (formWinner === 'AUTO') {
        if (formScoreA > formScoreB) {
          finalWinner = formTeamA;
          finalLoser = formTeamB;
        } else if (formScoreB > formScoreA) {
          finalWinner = formTeamB;
          finalLoser = formTeamA;
        } else {
          finalWinner = 'Hòa';
          finalLoser = '';
        }
      } else if (formWinner === formTeamA) {
        finalLoser = formTeamB;
      } else if (formWinner === formTeamB) {
        finalLoser = formTeamA;
      } else if (formWinner === 'Hòa') {
        finalLoser = '';
      }

      if (editingMatch) {
        await updateMatchSafe(editingMatch.id, {
          match_date: formDate,
          team_a: formTeamA.trim(),
          team_b: formTeamB.trim(),
          team_a_score: formScoreA,
          team_b_score: formScoreB,
          winner_team: finalWinner,
          loser_team: finalLoser,
          notes: formNotes.trim()
        });
        showFeedback('success', 'Đã cập nhật kết quả trận đánh thành công!');
      } else {
        await addMatchSafe({
          match_date: formDate,
          team_a: formTeamA.trim(),
          team_b: formTeamB.trim(),
          team_a_score: formScoreA,
          team_b_score: formScoreB,
          winner_team: finalWinner,
          loser_team: finalLoser,
          notes: formNotes.trim()
        });
        showFeedback('success', 'Đã lưu trận đánh mới thành công!');
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Lỗi khi lưu dữ liệu trận đánh: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete match
  const handleConfirmDelete = async () => {
    if (!deletingMatch) return;
    setIsSubmitting(true);
    try {
      await deleteMatchSafe(deletingMatch.id);
      showFeedback('success', 'Đã xóa trận đánh khỏi cơ sở dữ liệu!');
      setDeletingMatch(null);
      loadData();
    } catch (err: any) {
      showFeedback('error', 'Lỗi khi xóa trận đánh: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Statistics Calculations
  const teamStats = useMemo(() => {
    const map: Record<string, { name: string; total: number; wins: number; losses: number; draws: number; goalsFor: number; goalsAgainst: number; recent: string[] }> = {};

    // Initialize map with all known teams
    teams.forEach(t => {
      map[t.name] = { name: t.name, total: 0, wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0, recent: [] };
    });

    // Process all matches (sort chronological first to collect recent form)
    const sortedChrono = [...matches].sort((a, b) => new Date(a.created_at || a.match_date).getTime() - new Date(b.created_at || b.match_date).getTime());

    sortedChrono.forEach(m => {
      const teamA = m.team_a;
      const teamB = m.team_b;

      if (!map[teamA]) map[teamA] = { name: teamA, total: 0, wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0, recent: [] };
      if (!map[teamB]) map[teamB] = { name: teamB, total: 0, wins: 0, losses: 0, draws: 0, goalsFor: 0, goalsAgainst: 0, recent: [] };

      map[teamA].total += 1;
      map[teamB].total += 1;
      map[teamA].goalsFor += m.team_a_score || 0;
      map[teamA].goalsAgainst += m.team_b_score || 0;
      map[teamB].goalsFor += m.team_b_score || 0;
      map[teamB].goalsAgainst += m.team_a_score || 0;

      if (m.winner_team === teamA) {
        map[teamA].wins += 1;
        map[teamA].recent.push('W');
        map[teamB].losses += 1;
        map[teamB].recent.push('L');
      } else if (m.winner_team === teamB) {
        map[teamB].wins += 1;
        map[teamB].recent.push('W');
        map[teamA].losses += 1;
        map[teamA].recent.push('L');
      } else {
        map[teamA].draws += 1;
        map[teamA].recent.push('D');
        map[teamB].draws += 1;
        map[teamB].recent.push('D');
      }
    });

    const resultList = Object.values(map).map(s => {
      const winRate = s.total > 0 ? (s.wins / s.total) * 100 : 0;
      const recent5 = s.recent.slice(-5).reverse();
      return {
        ...s,
        winRate,
        recent5
      };
    });

    // Sort by wins DESC, winrate DESC, total DESC
    return resultList.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.total - a.total;
    });
  }, [matches, teams]);

  // All known team names (including external teams)
  const allKnownTeamNames = useMemo(() => {
    const set = new Set<string>();
    teams.forEach(t => set.add(t.name));
    matches.forEach(m => {
      if (m.team_a) set.add(m.team_a);
      if (m.team_b) set.add(m.team_b);
    });
    return Array.from(set);
  }, [teams, matches]);

  // Daily Matches Breakdown (Matches per day)
  const dailyStats = useMemo(() => {
    const map: Record<string, MatchItem[]> = {};
    matches.forEach(m => {
      const date = m.match_date || 'N/A';
      if (!map[date]) map[date] = [];
      map[date].push(m);
    });

    const dates = Object.keys(map).sort((a, b) => b.localeCompare(a));
    return dates.map(date => ({
      date,
      count: map[date].length,
      matches: map[date]
    }));
  }, [matches]);

  // Overall KPI metrics
  const totalMatchesCount = matches.length;
  const uniqueDatesCount = dailyStats.length;
  const avgMatchesPerDay = uniqueDatesCount > 0 ? (totalMatchesCount / uniqueDatesCount).toFixed(1) : '0';
  const topTeam = teamStats.length > 0 && teamStats[0].total > 0 ? teamStats[0] : null;

  // Filtered Matches list
  const filteredMatches = matches.filter(m => {
    const matchTeam = filterTeam === 'all' || m.team_a === filterTeam || m.team_b === filterTeam;
    const matchDate = filterDate === 'all' || m.match_date === filterDate;
    const searchMatch = !searchTerm.trim() || 
      m.team_a.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.team_b.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.notes || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchTeam && matchDate && searchMatch;
  });

  return (
    <div className="space-y-8">
      {/* Feedback Alert */}
      {feedback && (
        <div className={`p-4 rounded-2xl border text-sm flex items-center justify-between shadow-sm ${
          feedback.type === 'success' 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-red-50 border-red-200 text-red-800'
        }`}>
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle size={18} className="text-red-600 shrink-0" />
            )}
            <span className="font-medium">{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Top Banner & Action */}
      <div className="bg-gradient-to-r from-zinc-900 via-indigo-950 to-zinc-900 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 blur-2xl transform skew-x-12 pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-3 border border-indigo-500/30">
              <Trophy size={14} className="text-amber-400" />
              <span>Hệ Thống Thống Kê Chiến Dịch 2026</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Thống Kê Số Trận / Ngày & Thắng - Thua
            </h2>
            <p className="text-zinc-400 text-sm mt-1 max-w-2xl">
              Cập nhật kết quả các trận đánh giữa các đội, tự động tính toán tổng số trận mỗi ngày và tỷ lệ thắng thua của từng Leader/Team.
            </p>
          </div>

          {canManage && (
            <button
              onClick={handleOpenAdd}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-sm font-bold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-95"
            >
              <Plus size={18} />
              <span>Ghi nhận trận đánh mới</span>
            </button>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8 pt-6 border-t border-white/10">
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium">
              <Swords size={16} className="text-indigo-400" />
              <span>Tổng số trận đánh</span>
            </div>
            <p className="text-2xl md:text-3xl font-extrabold text-white mt-1">{totalMatchesCount}</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium">
              <Calendar size={16} className="text-amber-400" />
              <span>Trung bình trận / ngày</span>
            </div>
            <p className="text-2xl md:text-3xl font-extrabold text-amber-300 mt-1">
              {avgMatchesPerDay} <span className="text-xs font-normal text-zinc-300">trận/ngày</span>
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium">
              <Award size={16} className="text-emerald-400" />
              <span>Đội dẫn đầu</span>
            </div>
            <p className="text-lg md:text-xl font-bold text-emerald-300 mt-1 truncate">
              {topTeam ? topTeam.name.replace(/Team \d+:\s*/, '') : 'Chưa có'}
            </p>
            {topTeam && (
              <span className="text-xs text-emerald-400/80 font-medium">{topTeam.wins} Thắng ({topTeam.winRate.toFixed(0)}%)</span>
            )}
          </div>

          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2 text-xs text-zinc-300 font-medium">
              <Flame size={16} className="text-rose-400" />
              <span>Số ngày có giao tranh</span>
            </div>
            <p className="text-2xl md:text-3xl font-extrabold text-rose-300 mt-1">{uniqueDatesCount} <span className="text-xs font-normal text-zinc-300">ngày</span></p>
          </div>
        </div>
      </div>

      {/* Section 1: Team Win / Loss Table */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-200">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <BarChart3 size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Bảng Thống Kê Thắng / Thua Theo Team</h3>
              <p className="text-xs text-zinc-500">Tỷ lệ thắng thua và phong độ thi đấu gần nhất của từng đội</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="px-5 py-3 rounded-l-xl">Hạng</th>
                <th className="px-5 py-3">Tên Đội / Leader</th>
                <th className="px-5 py-3 text-center">Tổng Trận</th>
                <th className="px-5 py-3 text-center">Thắng (W)</th>
                <th className="px-5 py-3 text-center">Thua (L)</th>
                <th className="px-5 py-3 text-center">Hòa (D)</th>
                <th className="px-5 py-3 text-center">Tổng Điểm</th>
                <th className="px-5 py-3">Tỷ Lệ Thắng</th>
                <th className="px-5 py-3 text-right rounded-r-xl">Phong Độ 5 Trận Gần Nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-zinc-500">
                    Đang tải bảng thống kê...
                  </td>
                </tr>
              ) : teamStats.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-zinc-500">
                    Chưa có dữ liệu đội tuyển.
                  </td>
                </tr>
              ) : (
                teamStats.map((st, idx) => {
                  const isTop1 = idx === 0 && st.total > 0;
                  return (
                    <tr key={st.name} className="hover:bg-zinc-50/70 transition-colors">
                      <td className="px-5 py-4 font-bold text-center">
                        {isTop1 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-black shadow-xs">
                            🥇 1
                          </span>
                        ) : idx === 1 && st.total > 0 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-200 text-slate-700 text-xs font-black">
                            🥈 2
                          </span>
                        ) : idx === 2 && st.total > 0 ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-900/10 text-amber-950 text-xs font-black">
                            🥉 3
                          </span>
                        ) : (
                          <span className="text-zinc-400 font-mono text-xs">#{idx + 1}</span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-bold text-zinc-900">
                        <div className="flex items-center gap-2">
                          <Swords size={16} className="text-indigo-500 shrink-0" />
                          <span>{st.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-center font-semibold text-zinc-700">{st.total}</td>
                      <td className="px-5 py-4 text-center font-bold text-emerald-600 bg-emerald-50/40 rounded-lg">{st.wins}</td>
                      <td className="px-5 py-4 text-center font-bold text-rose-600 bg-rose-50/40 rounded-lg">{st.losses}</td>
                      <td className="px-5 py-4 text-center font-medium text-amber-600 bg-amber-50/40 rounded-lg">{st.draws}</td>
                      <td className="px-5 py-4 text-center font-bold text-indigo-700">
                        {st.goalsFor} - {st.goalsAgainst}
                      </td>
                      <td className="px-5 py-4 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs w-10 text-zinc-700">{st.winRate.toFixed(0)}%</span>
                          <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                st.winRate >= 60 ? 'bg-emerald-500' : st.winRate >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                              }`}
                              style={{ width: `${Math.max(st.winRate, 5)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {st.recent5.length === 0 ? (
                            <span className="text-xs text-zinc-400 italic">Chưa có trận</span>
                          ) : (
                            st.recent5.map((res, i) => (
                              <span
                                key={i}
                                className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black uppercase text-white shadow-xs ${
                                  res === 'W'
                                    ? 'bg-emerald-600'
                                    : res === 'L'
                                    ? 'bg-rose-600'
                                    : 'bg-amber-500'
                                }`}
                                title={res === 'W' ? 'Thắng' : res === 'L' ? 'Thua' : 'Hòa'}
                              >
                                {res}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Matches per Day Breakdown */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-zinc-200">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl">
              <Calendar size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Thống Kê Số Trận Theo Ngày (Match Frequency Log)</h3>
              <p className="text-xs text-zinc-500">Danh sách tổng hợp các trận đấu theo từng ngày thi đấu</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Tìm trận đánh..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 w-40 md:w-52"
              />
            </div>

            <select
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-700 font-medium"
            >
              <option value="all">Tất cả các ngày ({dailyStats.length} ngày)</option>
              {dailyStats.map(d => (
                <option key={d.date} value={d.date}>
                  {d.date} ({d.count} trận)
                </option>
              ))}
            </select>

            <select
              value={filterTeam}
              onChange={e => setFilterTeam(e.target.value)}
              className="px-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-700 font-medium"
            >
              <option value="all">Tất cả các Đội ({allKnownTeamNames.length})</option>
              {allKnownTeamNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Daily Match List Groups */}
        <div className="space-y-6">
          {filteredMatches.length === 0 ? (
            <div className="py-12 text-center text-zinc-500">
              <Info size={32} className="mx-auto text-zinc-300 mb-2" />
              <p className="text-sm font-medium">Không tìm thấy trận đánh nào phù hợp với bộ lọc.</p>
            </div>
          ) : (
            // Group by date for clear visual breakdown
            Object.entries(
              filteredMatches.reduce<Record<string, MatchItem[]>>((acc, m) => {
                const d = m.match_date || 'Khác';
                if (!acc[d]) acc[d] = [];
                acc[d].push(m);
                return acc;
              }, {})
            ).map(([dateStr, matchGroup]: [string, MatchItem[]]) => (
              <div key={dateStr} className="border border-zinc-100 rounded-2xl overflow-hidden bg-zinc-50/50">
                <div className="bg-zinc-100/80 px-5 py-3 flex items-center justify-between border-b border-zinc-200/60">
                  <div className="flex items-center gap-2">
                    <Calendar size={16} className="text-indigo-600" />
                    <span className="font-bold text-zinc-900 text-sm">Ngày thi đấu: {dateStr}</span>
                  </div>
                  <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-xs font-bold shadow-xs">
                    {matchGroup.length} trận đấu
                  </span>
                </div>

                <div className="divide-y divide-zinc-100 bg-white">
                  {matchGroup.map((m) => {
                    const isWinnerA = m.winner_team === m.team_a;
                    const isWinnerB = m.winner_team === m.team_b;
                    const isDraw = m.winner_team === 'Hòa';

                    return (
                      <div key={m.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-zinc-50 transition-colors">
                        <div className="flex-1 flex items-center justify-center md:justify-start gap-3 sm:gap-6">
                          {/* Team A */}
                          <div className={`flex-1 text-right ${isWinnerA ? 'font-bold text-emerald-600' : 'text-zinc-800'}`}>
                            <span className="text-sm">{m.team_a}</span>
                            {isWinnerA && <span className="ml-1 text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">W</span>}
                          </div>

                          {/* Score Badge */}
                          <div className="px-4 py-1.5 bg-zinc-900 text-white font-mono text-base font-black rounded-xl shadow-inner tracking-widest shrink-0">
                            {m.team_a_score} - {m.team_b_score}
                          </div>

                          {/* Team B */}
                          <div className={`flex-1 text-left ${isWinnerB ? 'font-bold text-emerald-600' : 'text-zinc-800'}`}>
                            {isWinnerB && <span className="mr-1 text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded font-bold">W</span>}
                            <span className="text-sm">{m.team_b}</span>
                          </div>
                        </div>

                        {/* Match Notes & Actions */}
                        <div className="flex items-center justify-between md:justify-end gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-zinc-100">
                          {m.notes ? (
                            <span className="text-xs text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-lg italic max-w-xs truncate" title={m.notes}>
                              📝 {m.notes}
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400 italic">Giao tranh Campaign</span>
                          )}

                          {isDraw && (
                            <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 font-bold rounded">Hòa</span>
                          )}

                          {canManage && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                onClick={() => handleOpenEdit(m)}
                                className="p-1.5 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Sửa kết quả"
                              >
                                <Edit2 size={16} />
                              </button>
                              <button
                                onClick={() => setDeletingMatch(m)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                                title="Xóa trận đấu"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal: Ghi nhận / Cập nhật Trận đánh */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl border border-zinc-200 max-w-lg w-full p-6 md:p-8"
          >
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl">
                  <Swords size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">
                    {editingMatch ? 'Cập Nhật Trận Đánh' : 'Ghi Nhận Trận Đánh Mới'}
                  </h3>
                  <p className="text-xs text-zinc-500">Cập nhật kết quả vào Supabase Database & Thống kê</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-zinc-400 hover:text-zinc-600 p-2 rounded-xl hover:bg-zinc-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Ngày thi đấu <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                    Đội A <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="teams-list-a"
                    placeholder="Chọn từ danh sách hoặc tự nhập..."
                    value={formTeamA}
                    onChange={e => setFormTeamA(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <datalist id="teams-list-a">
                    {teams.map(t => (
                      <option key={t.name} value={t.name} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                    Đội B (Tự gõ tên đội ngoài) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="teams-list-b"
                    placeholder="Tự nhập tên đội ngoài hoặc chọn..."
                    value={formTeamB}
                    onChange={e => setFormTeamB(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <datalist id="teams-list-b">
                    {teams.map(t => (
                      <option key={t.name} value={t.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Scores */}
              <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-200/80">
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-2 text-center">
                  Tỷ Số Trận Đấu (Score)
                </label>
                <div className="flex items-center justify-center gap-4">
                  <div className="text-center">
                    <span className="text-xs font-semibold text-zinc-500 block mb-1 truncate max-w-[100px]">
                      {formTeamA || 'Đội A'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formScoreA}
                      onChange={e => setFormScoreA(Number(e.target.value))}
                      className="w-20 px-3 py-2 text-center text-xl font-bold bg-white border border-zinc-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <span className="text-2xl font-black text-zinc-400 mt-5">-</span>

                  <div className="text-center">
                    <span className="text-xs font-semibold text-zinc-500 block mb-1 truncate max-w-[100px]">
                      {formTeamB || 'Đội B'}
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formScoreB}
                      onChange={e => setFormScoreB(Number(e.target.value))}
                      className="w-20 px-3 py-2 text-center text-xl font-bold bg-white border border-zinc-300 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Winner Select */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Đội Chiến Thắng (Kết Quả)
                </label>
                <select
                  value={formWinner}
                  onChange={e => setFormWinner(e.target.value)}
                  className="w-full px-3 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="AUTO">⚡ Tự động xác định theo Tỷ số</option>
                  {formTeamA && <option value={formTeamA}>🏆 {formTeamA} Thắng</option>}
                  {formTeamB && <option value={formTeamB}>🏆 {formTeamB} Thắng</option>}
                  <option value="Hòa">🤝 Trận Hòa (Draw)</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Ghi chú trận đánh (Bản đồ, xe, mô tả...)
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Map Malinovka, xe Tier X..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full px-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu kết quả trận đánh'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal: Xác nhận xóa */}
      {deletingMatch && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Xác nhận xóa trận đánh</h3>
                <p className="text-xs text-zinc-500">Dữ liệu trận đánh sẽ bị xóa hoàn toàn khỏi thống kê</p>
              </div>
            </div>

            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 text-xs text-zinc-700 space-y-2 mb-6">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Ngày thi đấu:</span>
                <strong className="text-zinc-900">{deletingMatch.match_date}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Trận đấu:</span>
                <strong className="text-indigo-600 font-bold">{deletingMatch.team_a} vs {deletingMatch.team_b}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Tỷ số:</span>
                <strong className="text-zinc-900 font-mono text-sm">{deletingMatch.team_a_score} - {deletingMatch.team_b_score}</strong>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingMatch(null)}
                disabled={isSubmitting}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isSubmitting}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={14} />
                <span>{isSubmitting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
