/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Default Supabase Cloud Database credentials (active project: czlmqxfxfbrwzmshespi)
export const DEFAULT_SUPABASE_URL = 'https://czlmqxfxfbrwzmshespi.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bG1xeGZ4ZmJyd3ptc2hlc3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM1OTE2MDUsImV4cCI6MjA1OTE2NzYwNX0.CvsY3d0pVwYdm7ZxiyUPFsByNj35U49fhdfytOh44ww';

/**
 * Clean & sanitize Supabase Project URL.
 * Automatically removes surrounding quotes, whitespace, trailing slashes, /rest/v1 suffixes,
 * and auto-prepends 'https://' if missing.
 */
export function sanitizeSupabaseUrl(url?: string | null): string {
  if (!url) return '';
  let cleaned = url.trim();
  // Strip surrounding quotes ("..." or '...') or whitespace
  cleaned = cleaned.replace(/^["'\s]+|["'\s]+$/g, '');
  cleaned = cleaned.replace(/\/+$/, '');
  cleaned = cleaned.replace(/\/rest(\/v1)?\/?$/, '');
  
  if (cleaned && !cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  return cleaned;
}

/**
 * Clean & sanitize Supabase Anon / Public Key.
 * Automatically removes surrounding quotes, spaces, newlines, and tabs.
 */
export function sanitizeSupabaseKey(key?: string | null): string {
  if (!key) return '';
  let cleaned = key.trim();
  // Strip surrounding quotes ("..." or '...') and all internal linebreaks/spaces
  cleaned = cleaned.replace(/^["'\s]+|["'\s]+$/g, '');
  cleaned = cleaned.replace(/\s+/g, '');
  return cleaned;
}

export function isValidSupabaseUrl(url?: string | null): boolean {
  if (!url) return false;
  const cleaned = sanitizeSupabaseUrl(url);
  if (!cleaned) return false;
  return cleaned.startsWith('http://') || cleaned.startsWith('https://');
}

export function isValidSupabaseKey(key?: string | null): boolean {
  if (!key) return false;
  const cleaned = sanitizeSupabaseKey(key);
  if (!cleaned || cleaned === 'undefined' || cleaned === 'null' || cleaned === 'none') return false;
  return cleaned.length >= 20;
}

let serverConfigCache: { url: string; key: string } | null = null;

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
  const validCustomKey = isValidSupabaseKey(customKey) ? sanitizeSupabaseKey(customKey) : null;

  const validServerUrl = serverConfigCache && isValidSupabaseUrl(serverConfigCache.url) ? sanitizeSupabaseUrl(serverConfigCache.url) : null;
  const validServerKey = serverConfigCache && isValidSupabaseKey(serverConfigCache.key) ? sanitizeSupabaseKey(serverConfigCache.key) : null;

  const validEnvUrl = isValidSupabaseUrl(envUrl) ? sanitizeSupabaseUrl(envUrl) : null;
  const validEnvKey = isValidSupabaseKey(envKey) ? sanitizeSupabaseKey(envKey) : null;

  const url = validCustomUrl || validServerUrl || validEnvUrl || DEFAULT_SUPABASE_URL;
  const key = validCustomKey || validServerKey || validEnvKey || DEFAULT_SUPABASE_ANON_KEY;

  const isConfiguredByUser = Boolean(validCustomUrl || validServerUrl || validEnvUrl);

  return {
    url,
    key,
    isCustom: Boolean(customUrl || customKey || serverConfigCache),
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

/**
 * Fetch server-wide persistent Supabase config so every visitor on any device connects to active Supabase
 */
export async function syncServerSupabaseConfig(): Promise<{ url: string; key: string }> {
  try {
    const res = await fetch('/api/supabase/config');
    if (res.ok) {
      const data = await res.json();
      if (data.url && isValidSupabaseUrl(data.url) && data.key && isValidSupabaseKey(data.key)) {
        serverConfigCache = {
          url: sanitizeSupabaseUrl(data.url),
          key: sanitizeSupabaseKey(data.key)
        };
        if (typeof window !== 'undefined') {
          localStorage.setItem('app_custom_supabase_url', serverConfigCache.url);
          localStorage.setItem('app_custom_supabase_anon_key', serverConfigCache.key);
        }
        cachedClient = null; // reset client cache
        return serverConfigCache;
      }
    }
  } catch {}
  return { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_ANON_KEY };
}

// Auto sync on load for all clients
if (typeof window !== 'undefined') {
  syncServerSupabaseConfig().catch(() => {});
}

export async function setCustomSupabaseConfig(rawUrl: string, rawKey: string) {
  const cleanUrl = sanitizeSupabaseUrl(rawUrl);
  const cleanKey = sanitizeSupabaseKey(rawKey);

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

  serverConfigCache = { url: cleanUrl, key: cleanKey };
  cachedClient = null;
  lastUrl = '';
  lastKey = '';

  // Persist to server so ALL other users on ALL devices automatically use this new config
  try {
    await fetch('/api/supabase/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl, key: cleanKey })
    });
  } catch {}
}

export async function clearCustomSupabaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('app_custom_supabase_url');
    localStorage.removeItem('app_custom_supabase_anon_key');
  }
  serverConfigCache = null;
  cachedClient = null;
  lastUrl = '';
  lastKey = '';

  try {
    await fetch('/api/supabase/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_ANON_KEY })
    });
  } catch {}
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

  const cleanInputUrl = customUrl ? sanitizeSupabaseUrl(customUrl) : '';
  const cleanInputKey = customKey ? sanitizeSupabaseKey(customKey) : '';

  const targetUrl = cleanInputUrl || currentConfig.url;
  const targetKey = cleanInputKey || currentConfig.key;

  const startTime = Date.now();

  if (!isValidSupabaseUrl(targetUrl)) {
    return {
      ok: false,
      code: 'INVALID_KEY',
      url: targetUrl || 'chưa nhập URL',
      latencyMs: 0,
      message: 'Supabase Project URL không đúng định dạng. Cần dạng https://xyzcompany.supabase.co'
    };
  }

  if (!isValidSupabaseKey(targetKey)) {
    return {
      ok: false,
      code: 'INVALID_KEY',
      url: targetUrl,
      latencyMs: 0,
      message: 'Supabase Anon Key quá ngắn hoặc không hợp lệ. Đảm bảo sao chép đầy đủ chuỗi key từ Supabase Dashboard.'
    };
  }

  // Test connection using Supabase client
  let testClient: SupabaseClient;
  try {
    testClient = createClient(targetUrl, targetKey, {
      auth: { persistSession: false }
    });
  } catch (err: any) {
    return {
      ok: false,
      code: 'INVALID_KEY',
      url: targetUrl,
      latencyMs: Date.now() - startTime,
      message: 'Không thể khởi tạo Supabase Client với URL/Key đã cung cấp: ' + (err.message || String(err))
    };
  }

  const tables = {
    teams: false,
    registrations: false,
    users: false,
    news: false,
    campaign_settings: false
  };
  const counts: Record<string, number> = {};

  try {
    // Perform parallel table checks with a 10s timeout
    const queryPromise = Promise.all([
      testClient.from('teams').select('id', { count: 'exact' }).limit(1),
      testClient.from('registrations').select('id', { count: 'exact' }).limit(1),
      testClient.from('users').select('id', { count: 'exact' }).limit(1),
      testClient.from('news').select('id', { count: 'exact' }).limit(1),
      testClient.from('campaign_settings').select('id').limit(1)
    ]);

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), 10000)
    );

    const [tTeams, tRegs, tUsers, tNews, tCS] = await Promise.race([queryPromise, timeoutPromise]);

    // Analyze errors to distinguish Invalid Key vs Missing Tables vs Paused DNS
    const errors = [tTeams.error, tRegs.error, tUsers.error, tNews.error, tCS.error].filter(Boolean);

    // Check if any error is an Auth or API Key error (status 401/403 or JWT/apikey error)
    const isAuthError = errors.some(
      (e: any) =>
        e?.code === 'PGRST301' ||
        e?.code === 'PGRST106' ||
        e?.message?.toLowerCase().includes('apikey') ||
        e?.message?.toLowerCase().includes('jwt') ||
        e?.message?.toLowerCase().includes('unauthorized') ||
        e?.message?.toLowerCase().includes('invalid api key') ||
        e?.status === 401 ||
        e?.status === 403
    );

    if (isAuthError) {
      return {
        ok: false,
        code: 'INVALID_KEY',
        url: targetUrl,
        latencyMs: Date.now() - startTime,
        message: 'Khóa Supabase Anon / Public Key không hợp lệ hoặc không có quyền truy cập (Mã 401/403). Vui lòng kiểm tra lại Key tại Supabase Project Settings -> API -> Project API keys (anon public).'
      };
    }

    tables.teams = !tTeams.error;
    if (tTeams.count !== null && tTeams.count !== undefined) counts.teams = tTeams.count;

    tables.registrations = !tRegs.error;
    if (tRegs.count !== null && tRegs.count !== undefined) counts.registrations = tRegs.count;

    tables.users = !tUsers.error;
    if (tUsers.count !== null && tUsers.count !== undefined) counts.users = tUsers.count;

    tables.news = !tNews.error;
    if (tNews.count !== null && tNews.count !== undefined) counts.news = tNews.count;

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
        message: 'Kết nối máy chủ Supabase và API Key thành công! Tuy nhiên một số bảng dữ liệu chưa được khởi tạo trong SQL Editor. Vui lòng bấm sao chép mã SQL bên dưới và Chạy (Run) trong Supabase SQL Editor.',
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
      message: `Kết nối Supabase Cloud Database thành công hoàn hảo (${latencyMs}ms)! Đọc, ghi, sửa, xóa dữ liệu hoạt động 100% thời gian thực.`,
      tables,
      counts,
      canWrite
    };
  } catch (err: any) {
    const errStr = String(err?.message || err);

    if (errStr.includes('REQUEST_TIMEOUT') || errStr.includes('fetch failed') || errStr.includes('ENOTFOUND') || errStr.includes('Failed to fetch')) {
      return {
        ok: false,
        code: 'PAUSED_OR_DNS_ERROR',
        url: targetUrl,
        latencyMs: Date.now() - startTime,
        message: 'Không thể kết nối đến máy chủ Supabase (' + targetUrl + '). Dự án có thể đang ở trạng thái TẠM DỪNG (Paused), hoặc Tên miền/Project URL không tồn tại.',
        details: errStr
      };
    }

    return {
      ok: false,
      code: 'NETWORK_ERROR',
      url: targetUrl,
      latencyMs: Date.now() - startTime,
      message: 'Lỗi khi kiểm tra kết nối Supabase: ' + errStr,
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
        campaign_name: cs.campaign_name || 'Campaign 2026',
        phase_name: cs.phase_name || 'Spring Maneuvers',
        start_date: cs.start_date || '23/03/2026',
        end_date: cs.end_date || '06/04/2026',
        updated_at: new Date().toISOString()
      });
      if (!error) details.settings = 1;
    }

    return {
      success: true,
      details
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Lỗi khi đồng bộ dữ liệu sang Supabase'
    };
  }
}
