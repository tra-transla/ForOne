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
  HardDrive
} from 'lucide-react';
import {
  checkDatabaseStatus,
  configureCloudflareD1,
  resetDatabaseConfig,
  initDatabaseTables,
  getStoredCloudflareConfig,
  CloudflareDiagnosticResult,
  CloudflareD1Config
} from '../lib/cloudflareD1';
import { syncAllLocalToCloudflare } from '../lib/schemaFallback';

const CLOUDFLARE_D1_SQL = `-- ==============================================================
-- BẢNG DỮ LIỆU ĐẦY ĐỦ CHO CLOUDFLARE D1 (SQLITE)
-- ==============================================================

-- 1. BẢNG USERS
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Quản trị',
  is_locked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO users (id, username, password, role, is_locked) VALUES 
('251d0986-02e4-45c0-a89c-c832abb7778f', 'admin', 'Sonla@2026', 'Quản trị', 0),
('fa818b2c-8bc0-4e4b-97e3-0599a0937402', 'admin1', 'Sonla', 'Quản trị', 0),
('bb913b82-6284-4720-bf49-cb7b6d19b48f', 'operator', 'operator123', 'Điều hành', 0);

UPDATE users SET password = 'Sonla@2026' WHERE username = 'admin';
UPDATE users SET password = 'Sonla' WHERE username = 'admin1';
UPDATE users SET password = 'operator123' WHERE username = 'operator';

-- 2. BẢNG TEAMS
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_locked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO teams (id, name, is_locked, created_at) VALUES 
('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', 0, '2026-03-20T00:00:00Z'), 
('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', 0, '2026-03-20T00:01:00Z'), 
('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', 0, '2026-03-20T00:02:00Z'), 
('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', 0, '2026-03-20T00:03:00Z');

-- 3. BẢNG REGISTRATIONS
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  in_game_name TEXT NOT NULL,
  tanks TEXT NOT NULL,
  is_winner INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 4. BẢNG NEWS
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO news (id, title, content, created_at) VALUES
('52d95507-e7a3-4f92-8721-70107c643e18', 'Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026!', '2026-03-20T08:00:00Z'),
('c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c', 'Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng.', '2026-03-21T09:30:00Z');

-- 5. BẢNG CAMPAIGN_SETTINGS
CREATE TABLE IF NOT EXISTS campaign_settings (
  id INTEGER PRIMARY KEY,
  campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
  phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers',
  start_date TEXT NOT NULL DEFAULT '23/03/2026',
  end_date TEXT NOT NULL DEFAULT '06/04/2026',
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026');
`;

export default function DatabaseManager() {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagResult, setDiagResult] = useState<CloudflareDiagnosticResult | null>(null);

  // Cloudflare D1 Credentials
  const [accountId, setAccountId] = useState('');
  const [databaseId, setDatabaseId] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Actions
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const stored = getStoredCloudflareConfig();
    setAccountId(stored.accountId);
    setDatabaseId(stored.databaseId);
    setApiToken(stored.apiToken);

    loadStatus();
  }, []);

  const loadStatus = async () => {
    setTesting(true);
    setInitResult(null);
    try {
      const res = await checkDatabaseStatus();
      setDiagResult(res);
    } catch {
      // fallback
    } finally {
      setTesting(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(CLOUDFLARE_D1_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    if (!accountId.trim() || !databaseId.trim() || !apiToken.trim()) {
      setSaveError('Vui lòng điền đầy đủ Account ID, Database ID và API Token.');
      return;
    }

    setTesting(true);
    const res = await configureCloudflareD1({
      accountId: accountId.trim(),
      databaseId: databaseId.trim(),
      apiToken: apiToken.trim()
    });

    if (res.success) {
      setSaveSuccess(true);
      await loadStatus();
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      setSaveError(res.error || 'Kết nối Cloudflare D1 thất bại');
      await loadStatus();
    }
    setTesting(false);
  };

  const handleResetToLocal = async () => {
    if (!window.confirm('Chuyển chế độ sang cơ sở dữ liệu SQLite mặc định của hệ thống?')) return;
    await resetDatabaseConfig();
    setAccountId('');
    setDatabaseId('');
    setApiToken('');
    await loadStatus();
  };

  const handleInitTables = async () => {
    setInitializing(true);
    setInitResult(null);
    try {
      const res = await initDatabaseTables();
      if (res.success) {
        setInitResult('Khởi tạo thành công toàn bộ các bảng dữ liệu & tài khoản quản trị trên Database SQLite!');
        await loadStatus();
      } else {
        setInitResult(`Không thể tạo bảng: ${res.error}`);
      }
    } catch (e: any) {
      setInitResult(`Lỗi: ${e.message}`);
    } finally {
      setInitializing(false);
    }
  };

  const handleSyncData = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncAllLocalToCloudflare();
      if (res.success) {
        setSyncResult(`Đã đồng bộ thành công sang SQLite: ${res.count.teams} teams, ${res.count.regs} đăng ký, ${res.count.news} tin tức, ${res.count.users} người dùng!`);
        await loadStatus();
      } else {
        setSyncResult(`Không thể đồng bộ: ${res.error}`);
      }
    } catch (err: any) {
      setSyncResult(`Lỗi: ${err?.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Status Banner */}
      <div className="bg-gradient-to-r from-zinc-900 to-amber-950/40 rounded-2xl shadow-sm border border-amber-500/20 p-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-black p-3 rounded-xl font-bold shadow-md">
              <Cloud size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">Cloudflare SQLite Databases (D1)</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  SQLite v3
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                Hệ thống đã chuyển đổi sang kiến trúc SQLite Database chuẩn Cloudflare D1. Dữ liệu đọc/ghi đồng bộ tức thì, không bị giới hạn RLS hay ngắt kết nối.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadStatus}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium text-xs transition-colors border border-zinc-700 shadow-sm"
            >
              <RefreshCw size={14} className={testing ? "animate-spin" : ""} />
              <span>{testing ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái'}</span>
            </button>
            <button
              onClick={handleInitTables}
              disabled={initializing}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl font-bold text-xs transition-all shadow-md active:scale-95"
            >
              <Sparkles size={14} className={initializing ? "animate-spin" : ""} />
              <span>{initializing ? 'Đang tạo bảng...' : '1-Click Khởi tạo bảng'}</span>
            </button>
          </div>
        </div>

        {/* Diagnostic Status Box */}
        {diagResult && (
          <div className="mt-6 pt-5 border-t border-zinc-800 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
            <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px] mb-1 font-medium">Động cơ cơ sở dữ liệu:</div>
              <div className="font-semibold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                <span>{diagResult.engine}</span>
              </div>
            </div>

            <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px] mb-1 font-medium">Chế độ hoạt động:</div>
              <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                {diagResult.mode === 'cloudflare_d1' ? (
                  <>
                    <Cloud size={14} className="text-amber-400" />
                    <span className="text-amber-300">Cloudflare D1 Cloud (Đang chạy)</span>
                  </>
                ) : (
                  <>
                    <HardDrive size={14} className="text-blue-400" />
                    <span className="text-blue-300">SQLite Engine (Sẵn sàng D1)</span>
                  </>
                )}
              </div>
            </div>

            <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px] mb-1 font-medium">Tổng bản ghi trong DB:</div>
              <div className="font-semibold text-zinc-200">
                {diagResult.stats ? (
                  <span>
                    {diagResult.stats.teams ?? 0} Đội • {diagResult.stats.registrations ?? 0} Đăng ký • {diagResult.stats.news ?? 0} Tin
                  </span>
                ) : (
                  'Chưa có dữ liệu'
                )}
              </div>
            </div>

            <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px] mb-1 font-medium">Tài khoản Quản trị:</div>
              <div className="font-semibold text-emerald-300">
                {diagResult.stats?.users ? `${diagResult.stats.users} tài khoản (admin / admin1)` : 'Đã nạp sẵn'}
              </div>
            </div>
          </div>
        )}

        {initResult && (
          <div className="mt-4 p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{initResult}</span>
          </div>
        )}
      </div>

      {/* 2. Cloudflare D1 Connection Setup Box */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="bg-amber-100 text-amber-700 p-2.5 rounded-xl">
              <Cloud size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Kết nối Cloudflare D1 Cloud</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Điền thông tin Cloudflare Account ID & D1 Database ID để đồng bộ lên Cloudflare Cloud toàn cầu.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncData}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium text-xs transition-colors disabled:opacity-50 shadow-sm"
            >
              <UploadCloud size={14} className={syncing ? "animate-spin" : ""} />
              <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu sang Database'}</span>
            </button>
          </div>
        </div>

        {syncResult && (
          <div className="mb-6 p-4 rounded-xl text-xs bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center gap-2">
            <CheckCircle2 size={16} className="text-indigo-600 shrink-0" />
            <span>{syncResult}</span>
          </div>
        )}

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Cloudflare Account ID <span className="text-amber-600">*</span>
              </label>
              <input
                type="text"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Ví dụ: 9a8b7c6d5e4f3a2b1c..."
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono transition-all"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">Lấy tại Cloudflare Dashboard -&gt; Workers &amp; Pages (Cột bên phải)</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                D1 Database ID (UUID) <span className="text-amber-600">*</span>
              </label>
              <input
                type="text"
                value={databaseId}
                onChange={(e) => setDatabaseId(e.target.value)}
                placeholder="Ví dụ: 12345678-abcd-ef01-2345-6789abcdef01"
                className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono transition-all"
              />
              <span className="text-[11px] text-zinc-400 mt-1 block">Tạo database trong Workers &amp; Pages -&gt; D1 SQL Database</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Cloudflare API Token <span className="text-amber-600">*</span>
            </label>
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="API Token có quyền D1 Edit (My Profile -> API Tokens -> Create Custom Token -> D1 Edit)"
              className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono transition-all"
            />
          </div>

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
              <CheckCircle2 size={15} className="shrink-0" />
              <span>Đã kết nối thành công tới Cloudflare D1! Hệ thống đang đọc ghi trực tiếp qua Cloudflare.</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={testing}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold rounded-xl text-xs shadow-sm transition-colors flex items-center gap-2"
              >
                <Cloud size={14} />
                <span>{testing ? 'Đang kết nối...' : 'Lưu & Kết nối Cloudflare D1'}</span>
              </button>

              <button
                type="button"
                onClick={handleResetToLocal}
                className="px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-medium transition-colors"
              >
                Sử dụng SQLite Cục bộ
              </button>
            </div>

            <span className="text-[11px] text-zinc-500">
              Hệ thống luôn tự động lưu trữ dữ liệu an toàn ngay cả khi bạn chưa gắn API Key Cloudflare.
            </span>
          </div>
        </form>
      </div>

      {/* 3. SQL Setup Script Export & Wrangler CLI */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-100 text-emerald-700 p-2.5 rounded-xl">
              <FileCode size={22} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Mã SQL Khởi tạo Cloudflare D1 (SQLite Schema)</h3>
              <p className="text-xs text-zinc-500">
                Được chuẩn hóa riêng cho SQLite và Cloudflare D1 (Không cần cấu hình RLS hay hàm Postgres phức tạp).
              </p>
            </div>
          </div>

          <button
            onClick={handleCopySql}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all shadow-sm ${
              copied
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-900 hover:bg-zinc-800 text-white'
            }`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Đã sao chép SQL!' : 'Sao chép đoạn mã SQL'}</span>
          </button>
        </div>

        <div className="bg-zinc-900 rounded-xl p-4 overflow-x-auto text-xs font-mono text-zinc-300 max-h-72 border border-zinc-800">
          <pre>{CLOUDFLARE_D1_SQL}</pre>
        </div>

        <div className="mt-4 p-4 bg-zinc-50 rounded-xl border border-zinc-200 text-xs text-zinc-700 space-y-2">
          <div className="font-semibold text-zinc-900 flex items-center gap-1.5">
            <Sparkles size={14} className="text-amber-500" />
            <span>3 Cách chạy bảng dữ liệu:</span>
          </div>
          <div>1. <strong>Cách 1 (Nhanh nhất):</strong> Nhấn nút <strong>&quot;1-Click Khởi tạo bảng&quot;</strong> ở góc trên, hệ thống sẽ tự động tạo đủ 5 bảng kèm dữ liệu ban đầu.</div>
          <div>2. <strong>Cách 2 (Cloudflare D1 Dashboard):</strong> Mở <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-medium inline-flex items-center gap-0.5">Cloudflare Dashboard <ExternalLink size={10} /></a> -&gt; <strong>Workers &amp; Pages</strong> -&gt; <strong>D1</strong> -&gt; Chọn database của bạn -&gt; Tab <strong>Console</strong> -&gt; Dán đoạn SQL trên và chạy <strong>Execute</strong>.</div>
          <div>3. <strong>Cách 3 (Wrangler CLI):</strong> Chạy lệnh <code>npx wrangler d1 execute &lt;DATABASE_NAME&gt; --file=./cloudflare_d1_setup.sql</code></div>
        </div>
      </div>
    </div>
  );
}
