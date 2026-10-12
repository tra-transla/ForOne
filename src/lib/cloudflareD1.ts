export interface CloudflareD1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export interface CloudflareDiagnosticResult {
  ok: boolean;
  engine: string;
  mode: 'cloudflare_d1' | 'local_sqlite';
  isCloudflareConfigured: boolean;
  d1Connected: boolean;
  d1Error?: string | null;
  activeConfig: {
    accountId: string;
    databaseId: string;
    hasToken: boolean;
  };
  stats?: {
    users?: number;
    teams?: number;
    registrations?: number;
    news?: number;
    error?: string;
  };
}

export function getStoredCloudflareConfig(): CloudflareD1Config {
  try {
    if (typeof window !== 'undefined') {
      const accountId = localStorage.getItem('cf_account_id') || '';
      const databaseId = localStorage.getItem('cf_d1_database_id') || '';
      const apiToken = localStorage.getItem('cf_api_token') || '';
      return { accountId, databaseId, apiToken };
    }
  } catch {}
  return { accountId: '', databaseId: '', apiToken: '' };
}

export function saveStoredCloudflareConfig(cfg: CloudflareD1Config) {
  try {
    if (typeof window !== 'undefined') {
      if (cfg.accountId) localStorage.setItem('cf_account_id', cfg.accountId.trim());
      else localStorage.removeItem('cf_account_id');

      if (cfg.databaseId) localStorage.setItem('cf_d1_database_id', cfg.databaseId.trim());
      else localStorage.removeItem('cf_d1_database_id');

      if (cfg.apiToken) localStorage.setItem('cf_api_token', cfg.apiToken.trim());
      else localStorage.removeItem('cf_api_token');
    }
  } catch {}
}

export function clearStoredCloudflareConfig() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('cf_account_id');
      localStorage.removeItem('cf_d1_database_id');
      localStorage.removeItem('cf_api_token');
    }
  } catch {}
}

/**
 * Check backend database status (Cloudflare D1 / SQLite)
 */
export async function checkDatabaseStatus(): Promise<CloudflareDiagnosticResult> {
  try {
    const res = await fetch('/api/db/status');
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const data = await res.json();
    return {
      ok: true,
      engine: data.engine,
      mode: data.mode,
      isCloudflareConfigured: data.isCloudflareConfigured,
      d1Connected: data.d1Connected,
      d1Error: data.d1Error,
      activeConfig: data.activeConfig,
      stats: data.stats
    };
  } catch (err: any) {
    return {
      ok: false,
      engine: 'SQLite Database Engine',
      mode: 'local_sqlite',
      isCloudflareConfigured: false,
      d1Connected: false,
      d1Error: err.message,
      activeConfig: { accountId: '', databaseId: '', hasToken: false }
    };
  }
}

/**
 * Configure Cloudflare D1 connection on server
 */
export async function configureCloudflareD1(cfg: CloudflareD1Config): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/db/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Cấu hình Cloudflare D1 thất bại' };
    }
    saveStoredCloudflareConfig(cfg);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi mạng khi cấu hình Cloudflare' };
  }
}

/**
 * Reset to Local SQLite
 */
export async function resetDatabaseConfig(): Promise<{ success: boolean }> {
  try {
    clearStoredCloudflareConfig();
    await fetch('/api/db/reset-config', { method: 'POST' });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * 1-Click initialize SQLite / Cloudflare D1 tables
 */
export async function initDatabaseTables(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/db/init-tables', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Khởi tạo bảng thất bại' };
    }
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi khi gọi khởi tạo bảng' };
  }
}

/**
 * Sync local client dataset to backend SQLite / Cloudflare D1
 */
export async function syncToCloudflareDb(payload: {
  teams?: any[];
  users?: any[];
  news?: any[];
  registrations?: any[];
  campaignSettings?: any;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch('/api/db/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Đồng bộ thất bại' };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi mạng khi đồng bộ dữ liệu' };
  }
}
