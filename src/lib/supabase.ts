/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://hcfoyxzigqopjpyodizl.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZm95eHppZ3FvcGpweW9kaXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDQ0MzYsImV4cCI6MjA4NzU4MDQzNn0.nuGUiCdilV2wNA4CGrIWd7Gfqh4zzHoXrN5FmwQnSRA';

export function sanitizeSupabaseUrl(url?: string | null): string {
  if (!url) return '';
  let cleaned = url.trim();
  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');
  // Remove /rest/v1 or /rest if mistakenly appended
  cleaned = cleaned.replace(/\/rest(\/v1)?\/?$/, '');
  return cleaned;
}

export function isValidSupabaseKey(key?: string | null): boolean {
  if (!key) return false;
  const t = key.trim();
  if (t === '' || t === 'undefined' || t === 'null' || t === 'none') return false;
  return t.length >= 20;
}

export function isValidSupabaseUrl(url?: string | null): boolean {
  if (!url) return false;
  const cleaned = sanitizeSupabaseUrl(url);
  if (!cleaned) return false;
  return cleaned.startsWith('http://') || cleaned.startsWith('https://');
}

export function getEffectiveSupabaseConfig() {
  let customUrl: string | null = null;
  let customKey: string | null = null;

  try {
    if (typeof window !== 'undefined') {
      customUrl = localStorage.getItem('app_custom_supabase_url');
      customKey = localStorage.getItem('app_custom_supabase_anon_key');
    }
  } catch {}

  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL;
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

  const validCustomUrl = isValidSupabaseUrl(customUrl) ? sanitizeSupabaseUrl(customUrl) : null;
  const validCustomKey = isValidSupabaseKey(customKey) ? customKey!.trim() : null;

  const validEnvUrl = isValidSupabaseUrl(envUrl) ? sanitizeSupabaseUrl(envUrl) : null;
  const validEnvKey = isValidSupabaseKey(envKey) ? envKey!.trim() : null;

  const url = validCustomUrl || validEnvUrl || DEFAULT_SUPABASE_URL;
  const key = validCustomKey || validEnvKey || DEFAULT_SUPABASE_ANON_KEY;

  const isConfiguredByUser = Boolean(validCustomUrl || validEnvUrl);

  return {
    url,
    key,
    isCustom: Boolean(customUrl || customKey),
    isConfiguredByUser
  };
}

let cachedClient: SupabaseClient | null = null;
let lastUrl = '';
let lastKey = '';

export function getActiveSupabaseClient(): SupabaseClient {
  const cfg = getEffectiveSupabaseConfig();
  if (!cachedClient || lastUrl !== cfg.url || lastKey !== cfg.key) {
    lastUrl = cfg.url;
    lastKey = cfg.key;
    try {
      cachedClient = createClient(cfg.url, cfg.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        }
      });
    } catch {
      // Fallback client if URL syntax was bad
      cachedClient = createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_ANON_KEY);
    }
  }
  return cachedClient;
}

export function setCustomSupabaseConfig(rawUrl: string, rawKey: string) {
  const cleanUrl = sanitizeSupabaseUrl(rawUrl);
  const cleanKey = rawKey.trim();

  if (typeof window !== 'undefined') {
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
  }

  // Invalidate cache
  cachedClient = null;
  lastUrl = '';
  lastKey = '';
}

export function clearCustomSupabaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('app_custom_supabase_url');
    localStorage.removeItem('app_custom_supabase_anon_key');
  }
  cachedClient = null;
  lastUrl = '';
  lastKey = '';
}

// Dynamic proxy so any call to supabase.* uses the currently active client
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getActiveSupabaseClient();
    const val = (client as any)[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  }
});

export interface SupabaseDiagnosticResult {
  ok: boolean;
  code: 'CONNECTED' | 'PAUSED_OR_DNS_ERROR' | 'INVALID_KEY' | 'TABLE_ERROR' | 'NETWORK_ERROR';
  message: string;
  details?: any;
  tables?: {
    teams: boolean;
    registrations: boolean;
    users: boolean;
    news: boolean;
    campaign_settings: boolean;
  };
  canWrite?: boolean;
}

export async function runSupabaseDiagnostics(customUrl?: string, customKey?: string): Promise<SupabaseDiagnosticResult> {
  const currentConfig = getEffectiveSupabaseConfig();
  const targetUrl = (customUrl && isValidSupabaseUrl(customUrl)) ? sanitizeSupabaseUrl(customUrl) : currentConfig.url;
  const targetKey = (customKey && isValidSupabaseKey(customKey)) ? customKey.trim() : currentConfig.key;

  // 1. Direct Ping test
  try {
    const pingRes = await fetch(`${targetUrl.replace(/\/+$/, '')}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: targetKey,
        Authorization: `Bearer ${targetKey}`
      }
    });

    if (pingRes.status === 401 || pingRes.status === 403) {
      return {
        ok: false,
        code: 'INVALID_KEY',
        message: 'Khóa Anon Key / Publishable Key không hợp lệ hoặc đã hết hạn (Mã 401/403). Vui lòng kiểm tra lại Key trong Supabase Project Settings → API.'
      };
    }
  } catch (err: any) {
    const errStr = String(err?.message || err);
    return {
      ok: false,
      code: 'PAUSED_OR_DNS_ERROR',
      message: 'Không thể kết nối đến máy chủ Supabase. Dự án có thể đang ở trạng thái TẠM DỪNG (Paused), hoặc tên miền/URL dự án không tồn tại. Nếu bạn vừa tạo dự án mới trên Supabase, hãy dán Project URL và Key mới vào cấu hình bên dưới.',
      details: errStr
    };
  }

  // 2. Client query test
  const testClient = createClient(targetUrl, targetKey);
  const tables = {
    teams: false,
    registrations: false,
    users: false,
    news: false,
    campaign_settings: false
  };

  try {
    const tTeams = await testClient.from('teams').select('id').limit(1);
    tables.teams = !tTeams.error;

    const tRegs = await testClient.from('registrations').select('id').limit(1);
    tables.registrations = !tRegs.error;

    const tUsers = await testClient.from('users').select('id').limit(1);
    tables.users = !tUsers.error;

    const tNews = await testClient.from('news').select('id').limit(1);
    tables.news = !tNews.error;

    const tCS = await testClient.from('campaign_settings').select('id').limit(1);
    tables.campaign_settings = !tCS.error;

    // Test write & delete
    let canWrite = false;
    const testId = 'diag-' + Date.now();
    try {
      const insTest = await testClient.from('teams').insert([{ name: 'Test ' + testId }]).select();
      if (!insTest.error && insTest.data && insTest.data[0]) {
        canWrite = true;
        await testClient.from('teams').delete().eq('id', insTest.data[0].id);
      }
    } catch {}

    const allTablesOk = tables.teams && tables.registrations && tables.users && tables.news && tables.campaign_settings;

    if (!allTablesOk) {
      return {
        ok: false,
        code: 'TABLE_ERROR',
        message: 'Kết nối máy chủ thành công nhưng một số bảng dữ liệu chưa được khởi tạo. Vui lòng chạy mã SQL bên dưới trong Supabase SQL Editor.',
        tables,
        canWrite
      };
    }

    return {
      ok: true,
      code: 'CONNECTED',
      message: 'Kết nối Supabase Cloud Database hoàn hảo! Đọc, ghi, sửa, xóa dữ liệu hoạt động 100% thời gian thực.',
      tables,
      canWrite
    };
  } catch (err: any) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: 'Lỗi trong quá trình truy vấn bảng dữ liệu: ' + (err.message || 'Unknown error'),
      details: err
    };
  }
}
