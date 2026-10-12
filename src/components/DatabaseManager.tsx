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
  Link as LinkIcon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  checkDatabaseStatus,
  configureAivenMysql,
  resetDatabaseConfig,
  initDatabaseTables,
  syncToAivenMysqlDb,
  getStoredAivenConfig,
  DatabaseDiagnosticResult,
  AivenMysqlConfig
} from '../lib/aivenMysql';
import { syncAllLocalToCloudflare } from '../lib/schemaFallback';

const AIVEN_MYSQL_SCHEMA_SQL = `-- ==============================================================
-- BẢNG DỮ LIỆU CHUẨN AIVEN.IO MYSQL (INNODB / UTF8MB4)
-- ==============================================================

-- 1. BẢNG USERS
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(100) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'Quản trị',
  is_locked TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. BẢNG TEAMS
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(191) UNIQUE NOT NULL,
  is_locked TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. BẢNG REGISTRATIONS
CREATE TABLE IF NOT EXISTS registrations (
  id VARCHAR(100) PRIMARY KEY,
  team VARCHAR(191) NOT NULL,
  in_game_name VARCHAR(191) NOT NULL,
  tanks TEXT NOT NULL,
  is_winner TINYINT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. BẢNG NEWS
CREATE TABLE IF NOT EXISTS news (
  id VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BẢNG CAMPAIGN_SETTINGS
CREATE TABLE IF NOT EXISTS campaign_settings (
  id INT PRIMARY KEY,
  campaign_name VARCHAR(255) NOT NULL DEFAULT 'Campaign 2026',
  phase_name VARCHAR(255) NOT NULL DEFAULT 'Spring Maneuvers',
  start_date VARCHAR(50) NOT NULL DEFAULT '23/03/2026',
  end_date VARCHAR(50) NOT NULL DEFAULT '06/04/2026',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Khởi tạo tài khoản quản trị bảo mật (Khởi tạo tự động bởi hệ thống hoặc tùy biến):
-- INSERT IGNORE INTO users (id, username, password, role, is_locked) VALUES 
-- (UUID(), 'admin', 'MẬT_KHẨU_QUẢN_TRỊ_CỦA_BẠN', 'Quản trị', 0);

-- Khởi tạo các đội tham chiến
INSERT IGNORE INTO teams (id, name, is_locked, created_at) VALUES 
('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', 0, '2026-03-20 00:00:00'), 
('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', 0, '2026-03-20 00:01:00'), 
('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', 0, '2026-03-20 00:02:00'), 
('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', 0, '2026-03-20 00:03:00');

-- Cài đặt chiến dịch
INSERT IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026');
`;

export default function DatabaseManager() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagResult, setDiagResult] = useState<DatabaseDiagnosticResult | null>(null);

  const isAdmin = Boolean(
    user?.role === 'Quản trị' ||
    user?.role === 'Admin' ||
    user?.role === 'admin' ||
    (user?.role && user.role.toLowerCase().includes('quản')) ||
    (user?.role && user.role.toLowerCase().includes('admin'))
  );

  // Configuration Mode: 'uri' | 'fields'
  const [configMode, setConfigMode] = useState<'uri' | 'fields'>('uri');

  // Aiven MySQL Credentials
  const [uri, setUri] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('3306');
  const [dbUser, setDbUser] = useState('avnadmin');
  const [password, setPassword] = useState('');
  const [database, setDatabase] = useState('defaultdb');
  const [ssl, setSsl] = useState(true);

  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Actions
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const stored = getStoredAivenConfig();
    if (stored.uri) setUri(stored.uri);
    if (stored.host) setHost(stored.host);
    if (stored.port) setPort(String(stored.port));
    if (stored.user) setDbUser(stored.user);
    if (stored.database) setDatabase(stored.database);
    if (stored.ssl !== undefined) setSsl(stored.ssl);

    loadStatus();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-zinc-200 text-center my-6">
        <ShieldAlert className="mx-auto text-amber-500 mb-3" size={40} />
        <h3 className="text-lg font-bold text-zinc-900">Không có quyền truy cập</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Mục cấu hình Cơ sở dữ liệu Aiven MySQL chỉ dành riêng cho tài khoản Quản trị viên.
        </p>
      </div>
    );
  }

  const loadStatus = async () => {
    setTesting(true);
    setInitResult(null);
    try {
      const res = await checkDatabaseStatus();
      setDiagResult(res);
      if (res.activeConfig?.host && !host) {
        setHost(res.activeConfig.host);
      }
      if (res.activeConfig?.port && port === '3306') {
        setPort(String(res.activeConfig.port));
      }
    } catch {
      // fallback handled
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);
    setTesting(true);

    let configPayload: AivenMysqlConfig;

    if (configMode === 'uri') {
      if (!uri.trim()) {
        setSaveError('Vui lòng nhập Service URI của Aiven MySQL.');
        setTesting(false);
        return;
      }
      configPayload = { uri: uri.trim(), ssl: true };
    } else {
      if (!host.trim() || !dbUser.trim() || !password.trim()) {
        setSaveError('Vui lòng điền đầy đủ Host, User và Mật khẩu Aiven.');
        setTesting(false);
        return;
      }
      configPayload = {
        host: host.trim(),
        port: port ? Number(port) : 3306,
        user: dbUser.trim(),
        password: password,
        database: database.trim() || 'defaultdb',
        ssl: ssl
      };
    }

    const res = await configureAivenMysql(configPayload);
    setTesting(false);

    if (res.success) {
      setSaveSuccess(true);
      await loadStatus();
      setTimeout(() => setSaveSuccess(false), 5000);
    } else {
      setSaveError(res.error || 'Kết nối Aiven MySQL thất bại');
    }
  };

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const handleResetToSqlite = async () => {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      setTimeout(() => setConfirmDisconnect(false), 4000);
      return;
    }
    setConfirmDisconnect(false);
    await resetDatabaseConfig();
    setUri('');
    setPassword('');
    await loadStatus();
  };

  const handleInitTables = async () => {
    setInitializing(true);
    setInitResult(null);
    const res = await initDatabaseTables();
    setInitializing(false);

    if (res.success) {
      setInitResult(res.message || 'Khởi tạo thành công toàn bộ các bảng trên Aiven MySQL!');
      await loadStatus();
    } else {
      setSaveError(res.error || 'Khởi tạo bảng thất bại');
    }
  };

  const handleSyncToAiven = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncAllLocalToCloudflare();
      if (res.success) {
        setSyncResult(`Đã đồng bộ thành công sang Aiven MySQL: ${res.count.teams} Đội, ${res.count.regs} Đăng ký, ${res.count.news} Tin tức!`);
        await loadStatus();
      } else {
        setSaveError(res.error || 'Đồng bộ thất bại');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Lỗi khi đồng bộ dữ liệu');
    } finally {
      setSyncing(false);
    }
  };

  const copySql = () => {
    navigator.clipboard.writeText(AIVEN_MYSQL_SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* 1. Status Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-blue-950/40 to-cyan-950/30 rounded-2xl shadow-sm border border-cyan-500/20 p-6 text-white">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-cyan-500 text-zinc-950 p-3 rounded-xl font-bold shadow-md">
              <Database size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">Aiven.io Cloud MySQL</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  MySQL v8.0 / TLS
                </span>
              </div>
              <p className="text-xs text-zinc-300 mt-1">
                Hệ thống lưu trữ trên cơ sở dữ liệu quan hệ điện toán đám mây Aiven.io MySQL với cơ chế dự phòng an toàn SQLite.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadStatus}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-medium text-xs transition-colors border border-zinc-700 shadow-sm cursor-pointer"
            >
              <RefreshCw size={14} className={testing ? "animate-spin" : ""} />
              <span>{testing ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái'}</span>
            </button>
            <button
              onClick={handleInitTables}
              disabled={initializing}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-zinc-950 rounded-xl font-bold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
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
              <div className="font-semibold text-cyan-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} />
                <span>{diagResult.engine}</span>
              </div>
            </div>

            <div className="bg-zinc-900/80 p-3.5 rounded-xl border border-zinc-800">
              <div className="text-zinc-400 text-[11px] mb-1 font-medium">Trạng thái kết nối Aiven:</div>
              <div className="font-semibold text-zinc-100 flex items-center gap-1.5">
                {diagResult.connected ? (
                  <>
                    <Cloud size={14} className="text-emerald-400" />
                    <span className="text-emerald-300">Đã kết nối (Cloud Active)</span>
                  </>
                ) : (
                  <>
                    <HardDrive size={14} className="text-amber-400" />
                    <span className="text-amber-300">Đang chạy SQLite dự phòng</span>
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
                {diagResult.stats?.users ? `${diagResult.stats.users} tài khoản` : 'Đã bảo vệ'}
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

        {syncResult && (
          <div className="mt-4 p-3 bg-cyan-950/60 border border-cyan-500/40 rounded-xl text-cyan-300 text-xs flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{syncResult}</span>
          </div>
        )}
      </div>

      {/* 2. Aiven MySQL Connection Setup Box */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="bg-cyan-100 text-cyan-800 p-2.5 rounded-xl">
              <Server size={22} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Cấu hình kết nối Aiven.io MySQL</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Nhập Service URI hoặc thông số máy chủ từ Aiven Console để hệ thống ghi dữ liệu lên Cloud.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncToAiven}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <UploadCloud size={14} className={syncing ? "animate-spin" : ""} />
              <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ dữ liệu sang MySQL'}</span>
            </button>
            {diagResult?.connected && (
              <button
                onClick={handleResetToSqlite}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  confirmDisconnect
                    ? 'bg-red-600 text-white hover:bg-red-700 animate-pulse'
                    : 'bg-red-50 hover:bg-red-100 text-red-600'
                }`}
              >
                {confirmDisconnect ? 'Xác nhận ngắt kết nối?' : 'Ngắt kết nối'}
              </button>
            )}
          </div>
        </div>

        {/* Tab switch mode */}
        <div className="flex gap-2 mb-6 border-b border-zinc-100 pb-2">
          <button
            type="button"
            onClick={() => setConfigMode('uri')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              configMode === 'uri'
                ? 'bg-cyan-100 text-cyan-900'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <LinkIcon size={14} />
            Service URI (Khuyên dùng - Nhanh nhất)
          </button>
          <button
            type="button"
            onClick={() => setConfigMode('fields')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              configMode === 'fields'
                ? 'bg-cyan-100 text-cyan-900'
                : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <SlidersHorizontal size={14} />
            Thông số chi tiết (Host, Port, User...)
          </button>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          {configMode === 'uri' ? (
            <div>
              <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                Aiven MySQL Service URI <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={uri}
                  onChange={(e) => setUri(e.target.value)}
                  placeholder="mysql://avnadmin:your_password@mysql-project.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED"
                  className="w-full px-3.5 py-2.5 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
              <p className="text-[11px] text-zinc-500 mt-1.5">
                💡 Lấy Service URI trực tiếp trong <strong>Aiven Console</strong> &rarr; Service <strong>MySQL</strong> &rarr; Tab <strong>Overview</strong> &rarr; <strong>Service URI</strong>.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Host / Server Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="mysql-project-xxxx.aivencloud.com"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Port
                </label>
                <input
                  type="text"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="12345"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Database Name
                </label>
                <input
                  type="text"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="defaultdb"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  User <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={dbUser}
                  onChange={(e) => setDbUser(e.target.value)}
                  placeholder="avnadmin"
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-sm font-mono text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-700 uppercase tracking-wider mb-1">
                  Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mật khẩu Aiven..."
                  className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-sm text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>Đã kết nối thành công tới Aiven MySQL! Hệ thống đang đọc ghi trực tiếp qua Aiven.io Cloud.</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between">
            <div className="text-xs text-zinc-500">
              {diagResult?.connected ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check size={14} /> Đang kết nối Aiven MySQL
                </span>
              ) : (
                <span className="text-amber-600 font-medium">
                  Đang dùng SQLite cục bộ
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={testing}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {testing ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
              <span>{testing ? 'Đang kiểm tra...' : 'Lưu & Kết nối Aiven MySQL'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 3. MySQL Schema Script Viewer */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-100">
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Mã SQL Khởi tạo Aiven MySQL Schema</h3>
            <p className="text-xs text-zinc-500">
              Chuẩn hóa riêng cho MySQL (InnoDB, UTF-8 MB4, Timestamp tự động).
            </p>
          </div>
          <button
            onClick={copySql}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? 'Đã sao chép!' : 'Sao chép SQL'}</span>
          </button>
        </div>

        <div className="relative">
          <pre className="bg-zinc-950 text-cyan-300 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-72 border border-zinc-800">
            {AIVEN_MYSQL_SCHEMA_SQL}
          </pre>
        </div>

        <div className="mt-4 p-4 bg-zinc-50 rounded-xl text-xs text-zinc-600 space-y-2 border border-zinc-200">
          <div className="font-bold text-zinc-800">Hướng dẫn nhanh cấu hình với Aiven.io:</div>
          <div>1. Đăng ký/Đăng nhập tại <a href="https://console.aiven.io" target="_blank" rel="noreferrer" className="text-cyan-700 underline font-medium inline-flex items-center gap-0.5">console.aiven.io <ExternalLink size={10} /></a>.</div>
          <div>2. Chọn dịch vụ <strong>MySQL</strong> (hoặc bấm <strong>Create Service</strong> &rarr; chọn MySQL &rarr; Free plan hoặc Developer plan).</div>
          <div>3. Trong trang <strong>Overview</strong> của dịch vụ, sao chép chuỗi <strong>Service URI</strong>.</div>
          <div>4. Dán chuỗi đó vào ô <strong>Service URI</strong> ở trên và nhấn <strong>Lưu & Kết nối Aiven MySQL</strong>. Hệ thống sẽ tự động tạo bảng và đồng bộ dữ liệu.</div>
        </div>
      </div>
    </div>
  );
}
