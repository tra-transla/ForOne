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
  ArrowRight
} from 'lucide-react';
import {
  getEffectiveSupabaseConfig,
  runSupabaseDiagnostics,
  SupabaseDiagnosticResult,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY
} from '../lib/supabase';
import { SUPABASE_SETUP_SQL, syncAllLocalToSupabase } from '../lib/schemaFallback';

export default function DatabaseManager() {
  const [copied, setCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [diagResult, setDiagResult] = useState<SupabaseDiagnosticResult | null>(null);

  // Custom Supabase credentials from localStorage
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const cfg = getEffectiveSupabaseConfig();
    setSupabaseUrl(cfg.url);
    setSupabaseKey(cfg.key);

    checkConnection(cfg.url, cfg.key);
  }, []);

  const checkConnection = async (testUrl?: string, testKey?: string) => {
    setTesting(true);
    setSyncResult(null);

    try {
      const res = await runSupabaseDiagnostics(testUrl, testKey);
      setDiagResult(res);
    } catch (e: any) {
      setDiagResult({
        ok: false,
        code: 'NETWORK_ERROR',
        message: 'Lỗi không xác định khi kết nối: ' + (e?.message || 'Error')
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = supabaseUrl.trim();
    const cleanKey = supabaseKey.trim();

    if (cleanUrl) {
      localStorage.setItem('app_custom_supabase_url', cleanUrl);
    } else {
      localStorage.removeItem('app_custom_supabase_url');
    }

    if (cleanKey) {
      localStorage.setItem('app_custom_supabase_anon_key', cleanKey);
    } else {
      localStorage.removeItem('app_custom_supabase_anon_key');
    }

    setSaveSuccess(true);
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  const handleResetDefaults = () => {
    if (!window.confirm('Khôi phục cấu hình Supabase về mặc định ban đầu?')) return;
    localStorage.removeItem('app_custom_supabase_url');
    localStorage.removeItem('app_custom_supabase_anon_key');
    window.location.reload();
  };

  const handleSyncData = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await syncAllLocalToSupabase();
      if (res.success) {
        setSyncResult(`Đã đồng bộ thành công lên Supabase: ${res.count.teams} teams, ${res.count.regs} đăng ký, ${res.count.news} tin tức, ${res.count.users} người dùng!`);
      } else {
        setSyncResult(`Không thể đồng bộ: ${res.error || 'Vui lòng kiểm tra lại kết nối Supabase'}`);
      }
    } catch (err: any) {
      setSyncResult(`Lỗi đồng bộ: ${err?.message || 'Lỗi không xác định'}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Overview Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 text-indigo-700 p-2.5 rounded-xl">
              <Database size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900">Kiểm tra Kết nối Supabase Database</h2>
              <p className="text-sm text-zinc-500">
                Chẩn đoán chi tiết trạng thái máy chủ, quyền ghi/sửa/xóa, và đồng bộ dữ liệu đám mây.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => checkConnection(supabaseUrl, supabaseKey)}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-medium text-sm transition-colors disabled:opacity-50 shadow-sm"
            >
              <RefreshCw size={16} className={testing ? "animate-spin" : ""} />
              <span>{testing ? 'Đang kiểm tra...' : 'Kiểm tra kết nối ngay'}</span>
            </button>
          </div>
        </div>

        {/* Status notification */}
        <div className={`mt-6 p-4 rounded-xl border flex items-start gap-3 text-sm ${
          diagResult?.ok
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : diagResult?.code === 'PAUSED_OR_DNS_ERROR'
            ? 'bg-red-50 border-red-200 text-red-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}>
          {diagResult?.ok ? (
            <CheckCircle2 size={22} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          ) : diagResult?.code === 'PAUSED_OR_DNS_ERROR' ? (
            <AlertTriangle size={22} className="text-red-600 flex-shrink-0 mt-0.5" />
          ) : (
            <Server size={22} className="text-amber-600 flex-shrink-0 mt-0.5" />
          )}

          <div className="space-y-1">
            <div className="font-bold text-base flex items-center gap-2">
              {diagResult?.ok ? (
                <span>Trạng thái: Kết nối Supabase Cloud Thành Công 100%</span>
              ) : diagResult?.code === 'PAUSED_OR_DNS_ERROR' ? (
                <span>Trạng thái: Máy chủ Supabase đang TẠM DỪNG (Paused) hoặc Không tìm thấy tên miền</span>
              ) : diagResult?.code === 'INVALID_KEY' ? (
                <span>Trạng thái: Khóa Anon Key / Publishable Key không hợp lệ</span>
              ) : diagResult?.code === 'TABLE_ERROR' ? (
                <span>Trạng thái: Đã kết nối Supabase nhưng còn thiếu bảng dữ liệu</span>
              ) : (
                <span>Đang kiểm tra trạng thái kết nối Supabase...</span>
              )}
            </div>

            <p className="text-xs leading-relaxed opacity-95">
              {diagResult?.message || 'Hệ thống đang gửi truy vấn kiểm tra trực tiếp tới Supabase REST API...'}
            </p>

            {/* Tables status badge grid if available */}
            {diagResult?.tables && (
              <div className="pt-2 flex flex-wrap gap-2 text-[11px]">
                <span className={`px-2 py-1 rounded font-mono ${diagResult.tables.teams ? 'bg-emerald-200/60 text-emerald-800' : 'bg-red-200/60 text-red-800'}`}>
                  teams: {diagResult.tables.teams ? '✓ OK' : '✗ Thiếu'}
                </span>
                <span className={`px-2 py-1 rounded font-mono ${diagResult.tables.registrations ? 'bg-emerald-200/60 text-emerald-800' : 'bg-red-200/60 text-red-800'}`}>
                  registrations: {diagResult.tables.registrations ? '✓ OK' : '✗ Thiếu'}
                </span>
                <span className={`px-2 py-1 rounded font-mono ${diagResult.tables.users ? 'bg-emerald-200/60 text-emerald-800' : 'bg-red-200/60 text-red-800'}`}>
                  users: {diagResult.tables.users ? '✓ OK' : '✗ Thiếu'}
                </span>
                <span className={`px-2 py-1 rounded font-mono ${diagResult.tables.news ? 'bg-emerald-200/60 text-emerald-800' : 'bg-red-200/60 text-red-800'}`}>
                  news: {diagResult.tables.news ? '✓ OK' : '✗ Thiếu'}
                </span>
                <span className={`px-2 py-1 rounded font-mono ${diagResult.tables.campaign_settings ? 'bg-emerald-200/60 text-emerald-800' : 'bg-red-200/60 text-red-800'}`}>
                  campaign_settings: {diagResult.tables.campaign_settings ? '✓ OK' : '✗ Thiếu'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Action recommendations if paused */}
        {diagResult?.code === 'PAUSED_OR_DNS_ERROR' && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-950">
              <AlertTriangle size={16} className="text-amber-600" />
              Nguyên nhân & Cách khắc phục khi không sửa/xóa/ghi dữ liệu được:
            </div>
            <p>
              1. <strong>Dự án Supabase bị Tạm dừng (Paused)</strong>: Supabase gói miễn phí sẽ tự động tạm dừng dự án nếu không có truy vấn trong một thời gian. Bạn chỉ cần vào <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="underline font-bold text-indigo-700">Supabase Dashboard</a>, chọn dự án và bấm nút <strong>"Restore project"</strong> (Khôi phục) — sau 1-2 phút dự án sẽ hoạt động lại bình thường.
            </p>
            <p>
              2. <strong>Nếu bạn đã tạo Dự án mới</strong>: Hãy copy <strong>Project URL</strong> và <strong>Publishable key / Anon key</strong> của dự án mới dán vào khung cấu hình phía dưới và bấm <em>Lưu & Áp dụng cấu hình</em>.
            </p>
            <p>
              3. <strong>Bảo vệ dữ liệu không bị mất</strong>: Trong lúc máy chủ Supabase chưa kết nối lại, hệ thống vẫn lưu tạm mọi thao tác thêm, sửa tên, xóa team và đăng ký vào bộ nhớ trình duyệt (Local Cache) để không làm gián đoạn người dùng.
            </p>
          </div>
        )}

        {/* Sync button */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-zinc-50 border border-zinc-200 rounded-xl">
          <div>
            <div className="font-semibold text-xs text-zinc-900 flex items-center gap-1.5">
              <UploadCloud size={16} className="text-indigo-600" />
              Đồng bộ hóa dữ liệu (Push Data lên Supabase)
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Đẩy toàn bộ danh sách Teams, Người dùng, Đăng ký và Tin tức hiện tại lên trực tiếp các bảng Supabase.
            </p>
          </div>

          <button
            onClick={handleSyncData}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-xs shadow-sm transition-all self-start sm:self-auto disabled:opacity-50"
          >
            <UploadCloud size={14} className={syncing ? 'animate-bounce' : ''} />
            <span>{syncing ? 'Đang đồng bộ...' : 'Đồng bộ lên Supabase ngay'}</span>
          </button>
        </div>

        {syncResult && (
          <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-xl text-xs font-medium">
            {syncResult}
          </div>
        )}
      </div>

      {/* Supabase API Config Editor */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-100">
          <Key size={20} className="text-indigo-600" />
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Cấu hình URL & Key Supabase</h3>
            <p className="text-xs text-zinc-500">
              Cập nhật Project URL hoặc API Key mới nếu bạn đổi dự án Supabase.
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveConfig} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Supabase Project URL:
            </label>
            <input
              type="text"
              value={supabaseUrl}
              onChange={(e) => setSupabaseUrl(e.target.value)}
              placeholder="https://xyz.supabase.co"
              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">
              Supabase Anon Key / Publishable Key:
            </label>
            <textarea
              value={supabaseKey}
              onChange={(e) => setSupabaseKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              rows={3}
              className="w-full px-4 py-2.5 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-mono resize-none"
            />
            <div className="mt-1.5 p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] text-zinc-600 leading-relaxed">
              <span className="font-semibold text-zinc-800">📌 Hướng dẫn lấy Key trên Supabase (nếu bạn thấy không có chữ "Anon_key"):</span>
              <ul className="list-disc list-inside mt-1 space-y-0.5">
                <li>Truy cập <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-medium">Supabase Dashboard</a> → Chọn Dự án của bạn.</li>
                <li>Vào <strong>Project Settings</strong> (biểu tượng bánh răng ⚙️ ở dưới cùng bên trái) → Chọn mục <strong>API</strong>.</li>
                <li>Tại phần <strong>Project API keys</strong>, bạn sẽ thấy key <code>anon</code> <code>public</code> hoặc <code>Publishable key</code>. Hãy bấm <strong>Copy</strong> và dán vào ô trên.</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="submit"
              className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-xs font-semibold hover:bg-indigo-500 transition-colors shadow-sm"
            >
              Lưu & Áp dụng cấu hình
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="bg-zinc-100 text-zinc-700 hover:bg-zinc-200 px-4 py-2.5 rounded-xl text-xs font-medium transition-colors"
            >
              Đặt lại mặc định
            </button>

            {saveSuccess && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <Check size={14} /> Đã lưu! Đang khởi động lại kết nối...
              </span>
            )}
          </div>
        </form>
      </div>

      {/* SQL Setup Script Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-zinc-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-bold text-zinc-900 flex items-center gap-2">
              <Server size={20} className="text-indigo-600" />
              Mã SQL Khởi tạo & Cập nhật đầy đủ các bảng
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Bao gồm đầy đủ các bảng: <code>users</code>, <code>teams</code>, <code>registrations</code>, <code>news</code>, <code>campaign_settings</code> và cấp quyền CRUD.
            </p>
          </div>

          <button
            onClick={handleCopySql}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-xs shadow-sm transition-all self-start sm:self-auto"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? 'Đã sao chép mã SQL!' : 'Sao chép toàn bộ mã SQL'}</span>
          </button>
        </div>

        {/* Step-by-step instructions */}
        <div className="mb-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200 text-xs text-zinc-700 space-y-1.5">
          <div className="font-semibold text-zinc-900 mb-1">Các bước chạy mã SQL trên Supabase:</div>
          <div>1. Mở trang điều khiển <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-indigo-600 underline font-medium inline-flex items-center gap-0.5">Supabase Dashboard <ExternalLink size={10} /></a> và chọn dự án.</div>
          <div>2. Chọn mục <strong>SQL Editor</strong> ở thanh menu bên trái.</div>
          <div>3. Bấm <strong>New query</strong>, dán đoạn mã bên dưới vào.</div>
          <div>4. Bấm nút <strong>Run</strong> (màu xanh lá) để tạo bảng và phân quyền.</div>
        </div>

        {/* Code container */}
        <div className="relative rounded-xl overflow-hidden border border-zinc-800 bg-zinc-950">
          <div className="flex justify-between items-center px-4 py-2 bg-zinc-900 text-xs text-zinc-400 border-b border-zinc-800">
            <span className="font-mono">supabase_setup.sql</span>
            <button
              onClick={handleCopySql}
              className="hover:text-white transition-colors flex items-center gap-1 text-xs"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              <span>{copied ? 'Đã copy' : 'Copy'}</span>
            </button>
          </div>
          <pre className="p-4 text-xs font-mono text-zinc-300 overflow-x-auto max-h-[380px] custom-scrollbar leading-relaxed">
            {SUPABASE_SETUP_SQL}
          </pre>
        </div>
      </div>
    </div>
  );
}
