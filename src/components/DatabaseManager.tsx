import React, { useState, useEffect } from 'react';
import {
  Database,
  Check,
  Copy,
  RefreshCw,
  Key,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Server,
  CheckCircle2,
  UploadCloud,
  ArrowRight,
  Sparkles,
  Cloud,
  FileCode,
  HardDrive,
  ShieldAlert,
  SlidersHorizontal,
  Link as LinkIcon,
  CheckCircle,
  XCircle,
  HelpCircle,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  getEffectiveSupabaseConfig,
  setCustomSupabaseConfig,
  clearCustomSupabaseConfig,
  runSupabaseDiagnostics,
  SupabaseDiagnosticResult,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY
} from '../lib/supabase';
import {
  syncAllLocalToSupabase,
  getLocalTeams,
  getLocalRegistrations,
  getLocalUsers,
  getLocalNews
} from '../lib/schemaFallback';

const SUPABASE_SCHEMA_SQL = `-- ==============================================================
-- BẢNG DỮ LIỆU ĐẦY ĐỦ CHO HỆ THỐNG CAMPAIGN 2026 (SUPABASE POSTGRESQL)
-- Chạy đoạn mã này trong: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================

-- 1. BẢNG USERS (Tài khoản Quản trị & Điều hành)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Quản trị',
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bổ sung cột is_locked nếu bảng đã tạo trước đó
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

-- Thêm tài khoản quản trị mặc định nếu chưa tồn tại
INSERT INTO users (username, password, role) VALUES 
('admin', 'Sonla@2026', 'Quản trị'),
('operator', 'operator123', 'Điều hành')
ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password;

-- 2. BẢNG TEAMS (Danh sách các đội được tạo và quản lý)
CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bổ sung cột is_locked nếu bảng đã tạo trước đó
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

-- Thêm các team mặc định ban đầu
INSERT INTO teams (name) VALUES 
('Team 1: Leader Cá Kiếm'), 
('Team 2: Leader Minato'), 
('Team 3: Đấu giá'), 
('Team 4: Vá lốp')
ON CONFLICT (name) DO NOTHING;

-- 3. BẢNG REGISTRATIONS (Danh sách thành viên đăng ký theo team)
CREATE TABLE IF NOT EXISTS registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team TEXT NOT NULL,
  in_game_name TEXT NOT NULL,
  tanks TEXT NOT NULL,
  is_winner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bổ sung cột is_winner nếu bảng đã tạo trước đó
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT FALSE;

-- 4. BẢNG NEWS (Tin tức & Thông báo chiến dịch)
CREATE TABLE IF NOT EXISTS news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Thêm tin tức khởi động
INSERT INTO news (title, content) VALUES
('Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Các đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.'),
('Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.')
ON CONFLICT DO NOTHING;

-- 5. BẢNG CAMPAIGN_SETTINGS (Cấu hình thời gian & thông tin chiến dịch)
CREATE TABLE IF NOT EXISTS campaign_settings (
  id INT PRIMARY KEY DEFAULT 1,
  campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
  phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers',
  start_date TEXT NOT NULL DEFAULT '23/03/2026',
  end_date TEXT NOT NULL DEFAULT '06/04/2026',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026')
ON CONFLICT (id) DO NOTHING;

-- 6. TẮT ROW LEVEL SECURITY (RLS) để Anon Key có thể truy vấn và thao tác
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE registrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE news DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_settings DISABLE ROW LEVEL SECURITY;

-- 7. CẤP QUYỀN ĐẦY ĐỦ CHO ROLE ANON VÀ AUTHENTICATED
GRANT ALL ON TABLE users TO anon, authenticated;
GRANT ALL ON TABLE teams TO anon, authenticated;
GRANT ALL ON TABLE registrations TO anon, authenticated;
GRANT ALL ON TABLE news TO anon, authenticated;
GRANT ALL ON TABLE campaign_settings TO anon, authenticated;
`;

export default function DatabaseManager() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagResult, setDiagResult] = useState<SupabaseDiagnosticResult | null>(null);

  const isAdmin = Boolean(
    user?.role === 'Quản trị' ||
    user?.role === 'Admin' ||
    user?.role === 'admin' ||
    (user?.role && user.role.toLowerCase().includes('quản')) ||
    (user?.role && user.role.toLowerCase().includes('admin'))
  );

  // Form State
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync State
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    counts?: { teams: number; regs: number; news: number; users: number; settings: number };
  } | null>(null);

  // Local Counts
  const [localStats, setLocalStats] = useState({
    teams: 0,
    regs: 0,
    users: 0,
    news: 0
  });

  useEffect(() => {
    if (!isAdmin) return;
    const cfg = getEffectiveSupabaseConfig();
    setSupabaseUrl(cfg.url);
    setAnonKey(cfg.key);

    updateLocalStats();
    handleTestConnection(cfg.url, cfg.key);
  }, [isAdmin]);

  const updateLocalStats = () => {
    try {
      setLocalStats({
        teams: getLocalTeams().length,
        regs: getLocalRegistrations().length,
        users: getLocalUsers().length,
        news: getLocalNews().length
      });
    } catch {}
  };

  if (!isAdmin) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-zinc-200 text-center my-6">
        <ShieldAlert className="mx-auto text-amber-500 mb-3" size={40} />
        <h3 className="text-lg font-bold text-zinc-900">Không có quyền truy cập</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Mục cấu hình Cơ sở dữ liệu Supabase chỉ dành riêng cho tài khoản Quản trị viên.
        </p>
      </div>
    );
  }

  const handleTestConnection = async (urlToCheck?: string, keyToCheck?: string) => {
    setTesting(true);
    try {
      const res = await runSupabaseDiagnostics(urlToCheck || supabaseUrl, keyToCheck || anonKey);
      setDiagResult(res);
    } catch (err: any) {
      setDiagResult({
        ok: false,
        code: 'NETWORK_ERROR',
        url: urlToCheck || supabaseUrl,
        message: 'Lỗi kiểm tra kết nối: ' + (err.message || String(err))
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    const cleanUrl = supabaseUrl.trim();
    const cleanKey = anonKey.trim();

    if (!cleanUrl) {
      setSaveError('Vui lòng nhập Supabase Project URL.');
      return;
    }

    if (!cleanKey) {
      setSaveError('Vui lòng nhập Supabase Anon / Public Key.');
      return;
    }

    setCustomSupabaseConfig(cleanUrl, cleanKey);
    setSaveSuccess(true);
    await handleTestConnection(cleanUrl, cleanKey);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  const handleResetToDefault = async () => {
    clearCustomSupabaseConfig();
    setSupabaseUrl(DEFAULT_SUPABASE_URL);
    setAnonKey(DEFAULT_SUPABASE_ANON_KEY);
    setSaveSuccess(true);
    await handleTestConnection(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const handleSyncToSupabase = async () => {
    setSyncing(true);
    setSyncResult(null);

    const res = await syncAllLocalToSupabase();
    setSyncing(false);

    if (res.success) {
      setSyncResult({
        success: true,
        message: 'Đồng bộ thành công dữ liệu sang Supabase Cloud Database!',
        counts: res.count
      });
      await handleTestConnection();
    } else {
      setSyncResult({
        success: false,
        message: res.error || 'Đồng bộ dữ liệu sang Supabase thất bại. Vui lòng kiểm tra lại kết nối và bảng dữ liệu.'
      });
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-zinc-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-emerald-800/40">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-emerald-500/10 blur-3xl rounded-full pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-semibold backdrop-blur-sm border border-emerald-500/30">
              <Database size={13} />
              Cơ sở dữ liệu đám mây Supabase PostgreSQL
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Quản Lý Cơ Sở Dữ Liệu Supabase
            </h2>
            <p className="text-zinc-300 text-sm max-w-2xl leading-relaxed">
              Hệ thống sử dụng cơ sở dữ liệu Supabase đám mây cho toàn bộ Teams, Đăng ký, Tin tức, Cấu hình chiến dịch và Tài khoản Quản trị. Có tích hợp cơ chế lưu trữ dự phòng tự động (Local SQLite & Cache) đảm bảo ứng dụng không bao giờ bị gián đoạn.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => handleTestConnection()}
              disabled={testing}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-sm transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
              {testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
            </button>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 bg-zinc-800/90 hover:bg-zinc-700 text-white font-medium rounded-xl text-sm transition-all border border-zinc-700/60 flex items-center justify-center gap-2"
            >
              <ExternalLink size={15} />
              Supabase Dashboard
            </a>
          </div>
        </div>
      </div>

      {/* Connection Status Card */}
      {diagResult && (
        <div
          className={`p-6 rounded-2xl border transition-all ${
            diagResult.ok
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
              : diagResult.code === 'TABLE_ERROR'
              ? 'bg-amber-50/80 border-amber-200 text-amber-900'
              : 'bg-zinc-50 border-zinc-300 text-zinc-900'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl mt-0.5 ${
                  diagResult.ok
                    ? 'bg-emerald-500 text-white'
                    : diagResult.code === 'TABLE_ERROR'
                    ? 'bg-amber-500 text-white'
                    : 'bg-red-500 text-white'
                }`}
              >
                {diagResult.ok ? (
                  <CheckCircle2 size={24} />
                ) : diagResult.code === 'TABLE_ERROR' ? (
                  <AlertTriangle size={24} />
                ) : (
                  <XCircle size={24} />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base">
                    {diagResult.ok
                      ? 'Kết nối Supabase Cloud Database: HOẠT ĐỘNG HOÀN HẢO'
                      : diagResult.code === 'TABLE_ERROR'
                      ? 'Kết nối Supabase thành công - Cần khởi tạo bảng'
                      : diagResult.code === 'PAUSED_OR_DNS_ERROR'
                      ? 'Dự án Supabase đang Tạm Dừng hoặc Chưa kết nối được'
                      : 'Trạng thái kết nối Supabase'}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      diagResult.ok
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : diagResult.code === 'TABLE_ERROR'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-red-100 text-red-800 border border-red-300'
                    }`}
                  >
                    {diagResult.code}
                  </span>
                  {diagResult.latencyMs !== undefined && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-zinc-200/80 text-zinc-800 font-semibold">
                      ⚡ {diagResult.latencyMs}ms
                    </span>
                  )}
                </div>
                <p className="text-sm opacity-90 leading-relaxed max-w-3xl">
                  {diagResult.message}
                </p>
                <div className="text-xs opacity-75 font-mono pt-1">
                  Target: {diagResult.url}
                </div>
              </div>
            </div>

            <div className="text-xs bg-white/80 backdrop-blur px-3 py-2 rounded-xl border border-zinc-200 self-start sm:self-auto shrink-0 shadow-sm">
              <div className="text-zinc-500 font-medium">Cơ chế vận hành:</div>
              <div className="font-bold text-zinc-800 flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full ${diagResult.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {diagResult.ok ? 'Supabase Trực Tiếp (Realtime Cloud)' : 'SQLite / Local Cache (Dự phòng)'}
              </div>
            </div>
          </div>

          {/* Tables checklist if table details available */}
          {diagResult.tables && (
            <div className="mt-5 pt-4 border-t border-zinc-200/60 grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { name: 'teams', label: 'Bảng Đội tuyển (teams)', ok: diagResult.tables.teams, count: diagResult.counts?.teams },
                { name: 'registrations', label: 'Bảng Đăng ký (registrations)', ok: diagResult.tables.registrations, count: diagResult.counts?.registrations },
                { name: 'users', label: 'Bảng Quản trị (users)', ok: diagResult.tables.users, count: diagResult.counts?.users },
                { name: 'news', label: 'Bảng Tin tức (news)', ok: diagResult.tables.news, count: diagResult.counts?.news },
                { name: 'campaign_settings', label: 'Cấu hình sự kiện', ok: diagResult.tables.campaign_settings }
              ].map(tb => (
                <div
                  key={tb.name}
                  className={`p-2.5 rounded-xl text-xs flex items-center justify-between border ${
                    tb.ok
                      ? 'bg-emerald-100/60 border-emerald-300/80 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="truncate pr-1">
                    <div className="font-bold truncate">{tb.name}</div>
                    {tb.count !== undefined && (
                      <div className="text-[10px] opacity-75">{tb.count} bản ghi</div>
                    )}
                  </div>
                  {tb.ok ? (
                    <CheckCircle className="text-emerald-600 shrink-0" size={16} />
                  ) : (
                    <XCircle className="text-red-500 shrink-0" size={16} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Grid: Config Form & Sync / Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Supabase Credentials Form (7 cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <SlidersHorizontal size={20} />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 text-lg">Cấu hình kết nối Supabase</h3>
                <p className="text-xs text-zinc-500">Dán Project URL và Anon Key từ Supabase Project Settings</p>
              </div>
            </div>
            <button
              onClick={handleResetToDefault}
              className="text-xs text-zinc-500 hover:text-zinc-800 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition cursor-pointer"
              title="Đặt lại URL và Key mặc định"
            >
              <RotateCcw size={13} />
              Mặc định
            </button>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
                Supabase Project URL
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <LinkIcon size={16} />
                </div>
                <input
                  type="text"
                  value={supabaseUrl}
                  onChange={e => setSupabaseUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-zinc-50 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Lấy từ: Supabase Dashboard → Project Settings → Configuration → API → <b>Project URL</b>
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">
                Supabase Anon / Public Key (API Key)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                  <Key size={16} />
                </div>
                <textarea
                  rows={3}
                  value={anonKey}
                  onChange={e => setAnonKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-mono"
                />
              </div>
              <p className="text-[11px] text-zinc-400 mt-1">
                Lấy từ: Supabase Dashboard → Project Settings → Configuration → API → <b>Project API keys (anon public)</b>
              </p>
            </div>

            {saveError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle size={16} className="shrink-0" />
                {saveError}
              </div>
            )}

            {saveSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 font-medium">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                Đã lưu cấu hình kết nối Supabase thành công!
              </div>
            )}

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                type="submit"
                disabled={testing}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Database size={16} />
                Lưu cấu hình Supabase
              </button>
              <button
                type="button"
                onClick={() => handleTestConnection()}
                disabled={testing}
                className="py-2.5 px-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold rounded-xl text-sm transition cursor-pointer flex items-center justify-center gap-2"
              >
                <RefreshCw size={15} className={testing ? 'animate-spin' : ''} />
                Kiểm tra kết nối
              </button>
            </div>
          </form>

          {/* Quick Help Card */}
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200 space-y-2 text-xs text-zinc-600">
            <div className="font-bold text-zinc-800 flex items-center gap-1.5">
              <HelpCircle size={15} className="text-emerald-600" />
              Lưu ý về tài khoản Supabase Free Tier:
            </div>
            <ul className="list-disc list-inside space-y-1 text-zinc-500">
              <li>Dự án miễn phí của Supabase tự động tạm dừng (Pause) sau 7 ngày không có truy cập.</li>
              <li>Nếu dự án bị tạm dừng, bạn chỉ cần vào Supabase Console và nhấn <b>"Restore Project"</b> (Khôi phục) trong 1 phút là hoạt động lại bình thường.</li>
              <li>Hoặc bạn có thể tạo một dự án mới hoàn toàn miễn phí trên Supabase và dán Project URL & Key vào đây.</li>
            </ul>
          </div>
        </div>

        {/* Right Column: Sync & Local DB Stats (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Data Sync Card */}
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <UploadCloud size={20} />
              </div>
              <div>
                <h3 className="font-bold text-zinc-900 text-lg">Đồng bộ dữ liệu sang Supabase</h3>
                <p className="text-xs text-zinc-500">Đẩy toàn bộ dữ liệu hiện có lên Supabase Cloud</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <div className="text-xs text-zinc-500">Đội tuyển (Teams)</div>
                <div className="text-lg font-extrabold text-zinc-800">{localStats.teams}</div>
              </div>
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <div className="text-xs text-zinc-500">Đăng ký (Regs)</div>
                <div className="text-lg font-extrabold text-zinc-800">{localStats.regs}</div>
              </div>
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <div className="text-xs text-zinc-500">Tin tức (News)</div>
                <div className="text-lg font-extrabold text-zinc-800">{localStats.news}</div>
              </div>
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <div className="text-xs text-zinc-500">Tài khoản (Users)</div>
                <div className="text-lg font-extrabold text-zinc-800">{localStats.users}</div>
              </div>
            </div>

            {syncResult && (
              <div
                className={`p-3.5 rounded-xl text-xs flex items-start gap-2 border ${
                  syncResult.success
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                {syncResult.success ? (
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">{syncResult.message}</div>
                  {syncResult.counts && (
                    <div className="mt-1 text-[11px] opacity-80">
                      Đã đồng bộ: {syncResult.counts.teams} teams, {syncResult.counts.regs} đăng ký, {syncResult.counts.news} tin tức, {syncResult.counts.users} tài khoản.
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={handleSyncToSupabase}
              disabled={syncing}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <UploadCloud size={18} className={syncing ? 'animate-bounce' : ''} />
              {syncing ? 'Đang đồng bộ dữ liệu...' : 'Đồng bộ toàn bộ dữ liệu lên Supabase'}
            </button>
          </div>

          {/* SQLite Backup Status */}
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive size={18} className="text-zinc-600" />
              <h4 className="font-bold text-zinc-900 text-sm">Cơ chế lưu trữ dự phòng (Fallback)</h4>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Mỗi thao tác tạo đội, đăng ký, đăng tin hay quản lý tài khoản đều được tự động lưu song song vào <b>SQLite</b> và <b>LocalStorage</b>. Khi mạng chập chờn hoặc Supabase đang tạm dừng, người dùng vẫn có thể xem và đăng ký liền mạch mà không bị lỗi.
            </p>
          </div>
        </div>
      </div>

      {/* SQL Setup Script Section */}
      <div className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl">
              <FileCode size={22} />
            </div>
            <div>
              <h3 className="font-bold text-zinc-900 text-lg">Mã SQL khởi tạo toàn bộ bảng trên Supabase</h3>
              <p className="text-xs text-zinc-500">Chạy đoạn mã này trong Supabase Dashboard → SQL Editor</p>
            </div>
          </div>
          <button
            onClick={handleCopySql}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white'
            }`}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? 'Đã sao chép SQL!' : 'Sao chép toàn bộ mã SQL'}
          </button>
        </div>

        {/* 4-Step Instructions */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
            <span className="font-bold text-emerald-600">Bước 1:</span>
            <div className="text-zinc-700">Mở Supabase Project của bạn tại <a href="https://supabase.com" target="_blank" rel="noreferrer" className="underline font-semibold">supabase.com</a>.</div>
          </div>
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
            <span className="font-bold text-emerald-600">Bước 2:</span>
            <div className="text-zinc-700">Bấm vào mục <b>SQL Editor</b> ở menu bên trái.</div>
          </div>
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
            <span className="font-bold text-emerald-600">Bước 3:</span>
            <div className="text-zinc-700">Tạo New Query, dán toàn bộ đoạn mã SQL bên dưới và nhấn <b>Run</b>.</div>
          </div>
          <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-1">
            <span className="font-bold text-emerald-600">Bước 4:</span>
            <div className="text-zinc-700">Copy <b>URL</b> & <b>Anon Key</b> vào mục Cấu hình phía trên và bấm Lưu.</div>
          </div>
        </div>

        {/* Code viewer */}
        <div className="relative rounded-2xl overflow-hidden border border-zinc-800 bg-zinc-950">
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800 text-xs text-zinc-400">
            <span className="font-mono">supabase_schema_setup.sql (PostgreSQL)</span>
            <button
              onClick={handleCopySql}
              className="text-zinc-300 hover:text-white flex items-center gap-1 cursor-pointer"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              {copied ? 'Đã copy' : 'Copy'}
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto max-h-96 leading-relaxed select-all">
            {SUPABASE_SCHEMA_SQL}
          </pre>
        </div>
      </div>
    </div>
  );
}
