/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = 'https://hcfoyxzigqopjpyodizl.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhjZm95eHppZ3FvcGpweW9kaXpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMDQ0MzYsImV4cCI6MjA4NzU4MDQzNn0.nuGUiCdilV2wNA4CGrIWd7Gfqh4zzHoXrN5FmwQnSRA';

export function sanitizeSupabaseUrl(url?: string | null): string {
  if (!url) return '';
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/+$/, '');
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

/**
 * Subscribe to realtime changes on a Supabase table
 */
export function subscribeToSupabaseTable(table: string, onUpdate: () => void): () => void {
  try {
    const client = getActiveSupabaseClient();
    const channelName = `realtime_${table}_${Date.now()}`;
    const channel = client
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        onUpdate();
      })
      .subscribe();

    return () => {
      try {
        client.removeChannel(channel);
      } catch {}
    };
  } catch {
    return () => {};
  }
}

export interface SupabaseDiagnosticResult {
  ok: boolean;
  code: 'CONNECTED' | 'PAUSED_OR_DNS_ERROR' | 'INVALID_KEY' | 'TABLE_ERROR' | 'NETWORK_ERROR';
  message: string;
  details?: any;
  url: string;
  latencyMs?: number;
  tables?: {
    teams: boolean;
    registrations: boolean;
    users: boolean;
    news: boolean;
    campaign_settings: boolean;
  };
  counts?: {
    teams?: number;
    registrations?: number;
    users?: number;
    news?: number;
  };
  canWrite?: boolean;
}

export async function runSupabaseDiagnostics(customUrl?: string, customKey?: string): Promise<SupabaseDiagnosticResult> {
  const currentConfig = getEffectiveSupabaseConfig();
  const targetUrl = (customUrl && isValidSupabaseUrl(customUrl)) ? sanitizeSupabaseUrl(customUrl) : currentConfig.url;
  const targetKey = (customKey && isValidSupabaseKey(customKey)) ? customKey.trim() : currentConfig.key;

  const startTime = Date.now();

  // 1. Direct Ping test
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const pingRes = await fetch(`${targetUrl.replace(/\/+$/, '')}/rest/v1/`, {
      method: 'GET',
      headers: {
        apikey: targetKey,
        Authorization: `Bearer ${targetKey}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (pingRes.status === 401 || pingRes.status === 403) {
      return {
        ok: false,
        code: 'INVALID_KEY',
        url: targetUrl,
        latencyMs: Date.now() - startTime,
        message: 'Khóa Anon Key / Publishable Key không hợp lệ hoặc đã hết hạn (Mã 401/403). Vui lòng kiểm tra lại Key trong Supabase Project Settings → API.'
      };
    }
  } catch (err: any) {
    const errStr = String(err?.message || err);
    return {
      ok: false,
      code: 'PAUSED_OR_DNS_ERROR',
      url: targetUrl,
      latencyMs: Date.now() - startTime,
      message: 'Không thể kết nối đến máy chủ Supabase (' + targetUrl + '). Dự án có thể đang ở trạng thái TẠM DỪNG (Paused), hoặc tên miền/URL dự án không tồn tại. Nếu bạn vừa tạo dự án mới trên Supabase, hãy dán Project URL và Anon Key mới vào form bên dưới.',
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
  const counts: Record<string, number> = {};

  try {
    const tTeams = await testClient.from('teams').select('id', { count: 'exact' }).limit(1);
    tables.teams = !tTeams.error;
    if (tTeams.count !== null && tTeams.count !== undefined) counts.teams = tTeams.count;

    const tRegs = await testClient.from('registrations').select('id', { count: 'exact' }).limit(1);
    tables.registrations = !tRegs.error;
    if (tRegs.count !== null && tRegs.count !== undefined) counts.registrations = tRegs.count;

    const tUsers = await testClient.from('users').select('id', { count: 'exact' }).limit(1);
    tables.users = !tUsers.error;
    if (tUsers.count !== null && tUsers.count !== undefined) counts.users = tUsers.count;

    const tNews = await testClient.from('news').select('id', { count: 'exact' }).limit(1);
    tables.news = !tNews.error;
    if (tNews.count !== null && tNews.count !== undefined) counts.news = tNews.count;

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
    const latencyMs = Date.now() - startTime;

    if (!allTablesOk) {
      return {
        ok: false,
        code: 'TABLE_ERROR',
        url: targetUrl,
        latencyMs,
        message: 'Kết nối máy chủ Supabase thành công nhưng một số bảng dữ liệu chưa được khởi tạo. Vui lòng sao chép mã SQL bên dưới và chạy trong Supabase SQL Editor.',
        tables,
        counts,
        canWrite
      };
    }

    return {
      ok: true,
      code: 'CONNECTED',
      url: targetUrl,
      latencyMs,
      message: `Kết nối Supabase Cloud Database hoàn hảo (${latencyMs}ms)! Đọc, ghi, sửa, xóa dữ liệu hoạt động 100% thời gian thực.`,
      tables,
      counts,
      canWrite
    };
  } catch (err: any) {
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      url: targetUrl,
      latencyMs: Date.now() - startTime,
      message: 'Lỗi trong quá trình truy vấn bảng dữ liệu: ' + (err.message || 'Unknown error'),
      details: err
    };
  }
}

/**
 * Sync all local/cached data into Supabase
 */
export async function syncAllDataToSupabase(payload: {
  teams: any[];
  registrations: any[];
  users: any[];
  news: any[];
  campaign_settings?: any;
}): Promise<{ success: boolean; details?: Record<string, number>; error?: string }> {
  const client = getActiveSupabaseClient();
  const details: Record<string, number> = {
    teams: 0,
    registrations: 0,
    users: 0,
    news: 0,
    settings: 0
  };

  try {
    // 1. Sync teams
    if (payload.teams && payload.teams.length > 0) {
      const cleanTeams = payload.teams.map(t => ({
        id: t.id,
        name: t.name,
        is_locked: Boolean(t.is_locked),
        created_at: t.created_at || new Date().toISOString()
      }));
      const { error } = await client.from('teams').upsert(cleanTeams, { onConflict: 'name' });
      if (!error) details.teams = cleanTeams.length;
    }

    // 2. Sync registrations
    if (payload.registrations && payload.registrations.length > 0) {
      const cleanRegs = payload.registrations.map(r => ({
        id: r.id,
        team: r.team,
        in_game_name: r.in_game_name,
        tanks: r.tanks,
        is_winner: Boolean(r.is_winner),
        created_at: r.created_at || new Date().toISOString()
      }));
      const { error } = await client.from('registrations').upsert(cleanRegs, { onConflict: 'id' });
      if (!error) details.registrations = cleanRegs.length;
    }

    // 3. Sync users
    if (payload.users && payload.users.length > 0) {
      const cleanUsers = payload.users.map(u => ({
        id: u.id,
        username: u.username,
        password: u.password,
        role: u.role || 'Quản trị',
        is_locked: Boolean(u.is_locked),
        created_at: u.created_at || new Date().toISOString()
      }));
      const { error } = await client.from('users').upsert(cleanUsers, { onConflict: 'username' });
      if (!error) details.users = cleanUsers.length;
    }

    // 4. Sync news
    if (payload.news && payload.news.length > 0) {
      const cleanNews = payload.news.map(n => ({
        id: n.id,
        title: n.title,
        content: n.content,
        created_at: n.created_at || new Date().toISOString()
      }));
      const { error } = await client.from('news').upsert(cleanNews, { onConflict: 'id' });
      if (!error) details.news = cleanNews.length;
    }

    // 5. Sync campaign settings
    if (payload.campaign_settings) {
      const cs = payload.campaign_settings;
      const { error } = await client.from('campaign_settings').upsert({
        id: 1,
        campaign_name: cs.campaign_name,
        phase_name: cs.phase_name,
        start_date: cs.start_date,
        end_date: cs.end_date,
        updated_at: new Date().toISOString()
      }, { onConflict: 'id' });
      if (!error) details.settings = 1;
    }

    return { success: true, details };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi đồng bộ Supabase' };
  }
}
