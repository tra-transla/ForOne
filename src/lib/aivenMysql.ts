export interface AivenMysqlConfig {
  uri?: string;
  host?: string;
  port?: number | string;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}

export interface DatabaseDiagnosticResult {
  ok: boolean;
  engine: string;
  mode: 'aiven_mysql' | 'local_sqlite';
  isConfigured: boolean;
  connected: boolean;
  error?: string | null;
  version?: string;
  activeConfig?: {
    uriMasked?: string;
    host?: string;
    port?: number | string;
    database?: string;
    user?: string;
  };
  stats?: {
    users?: number;
    teams?: number;
    registrations?: number;
    news?: number;
    error?: string;
  };
}

const LOCAL_AIVEN_URI_KEY = 'aiven_mysql_uri';
const LOCAL_AIVEN_HOST_KEY = 'aiven_mysql_host';
const LOCAL_AIVEN_PORT_KEY = 'aiven_mysql_port';
const LOCAL_AIVEN_USER_KEY = 'aiven_mysql_user';
const LOCAL_AIVEN_DB_KEY = 'aiven_mysql_db';

export function getStoredAivenConfig(): AivenMysqlConfig {
  try {
    if (typeof window !== 'undefined') {
      const uri = localStorage.getItem(LOCAL_AIVEN_URI_KEY) || '';
      const host = localStorage.getItem(LOCAL_AIVEN_HOST_KEY) || '';
      const port = localStorage.getItem(LOCAL_AIVEN_PORT_KEY) || '';
      const user = localStorage.getItem(LOCAL_AIVEN_USER_KEY) || '';
      const database = localStorage.getItem(LOCAL_AIVEN_DB_KEY) || '';
      return { uri, host, port, user, database, ssl: true };
    }
  } catch {}
  return { ssl: true };
}

export function saveStoredAivenConfig(cfg: AivenMysqlConfig) {
  try {
    if (typeof window !== 'undefined') {
      if (cfg.uri) localStorage.setItem(LOCAL_AIVEN_URI_KEY, cfg.uri.trim());
      else localStorage.removeItem(LOCAL_AIVEN_URI_KEY);

      if (cfg.host) localStorage.setItem(LOCAL_AIVEN_HOST_KEY, cfg.host.trim());
      else localStorage.removeItem(LOCAL_AIVEN_HOST_KEY);

      if (cfg.port) localStorage.setItem(LOCAL_AIVEN_PORT_KEY, String(cfg.port).trim());
      else localStorage.removeItem(LOCAL_AIVEN_PORT_KEY);

      if (cfg.user) localStorage.setItem(LOCAL_AIVEN_USER_KEY, cfg.user.trim());
      else localStorage.removeItem(LOCAL_AIVEN_USER_KEY);

      if (cfg.database) localStorage.setItem(LOCAL_AIVEN_DB_KEY, cfg.database.trim());
      else localStorage.removeItem(LOCAL_AIVEN_DB_KEY);
    }
  } catch {}
}

export function clearStoredAivenConfig() {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCAL_AIVEN_URI_KEY);
      localStorage.removeItem(LOCAL_AIVEN_HOST_KEY);
      localStorage.removeItem(LOCAL_AIVEN_PORT_KEY);
      localStorage.removeItem(LOCAL_AIVEN_USER_KEY);
      localStorage.removeItem(LOCAL_AIVEN_DB_KEY);
    }
  } catch {}
}

/**
 * Check backend database status (Aiven MySQL / Local SQLite)
 */
export async function checkDatabaseStatus(): Promise<DatabaseDiagnosticResult> {
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
      isConfigured: data.isConfigured,
      connected: data.connected,
      error: data.error,
      version: data.version,
      activeConfig: data.activeConfig,
      stats: data.stats
    };
  } catch (err: any) {
    return {
      ok: false,
      engine: 'SQLite Database Engine (Local Fallback)',
      mode: 'local_sqlite',
      isConfigured: false,
      connected: false,
      error: err.message,
      stats: {}
    };
  }
}

/**
 * Configure Aiven MySQL on server
 */
export async function configureAivenMysql(cfg: AivenMysqlConfig): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/db/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cfg)
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Cấu hình Aiven MySQL thất bại' };
    }
    saveStoredAivenConfig(cfg);
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi mạng khi kết nối Aiven MySQL' };
  }
}

/**
 * Reset to Local SQLite
 */
export async function resetDatabaseConfig(): Promise<{ success: boolean }> {
  try {
    clearStoredAivenConfig();
    await fetch('/api/db/reset-config', { method: 'POST' });
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * 1-Click initialize Aiven MySQL tables
 */
export async function initDatabaseTables(): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch('/api/db/init-tables', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, error: data.error || 'Khởi tạo bảng MySQL thất bại' };
    }
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi khi gọi khởi tạo bảng MySQL' };
  }
}

/**
 * Sync dataset from client to backend (Aiven MySQL & SQLite)
 */
export async function syncToAivenMysqlDb(payload: {
  teams?: any[];
  users?: any[];
  news?: any[];
  registrations?: any[];
  campaignSettings?: any;
}): Promise<{ success: boolean; message?: string; error?: string }> {
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
    return { success: true, message: data.message };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi kết nối khi đồng bộ' };
  }
}
