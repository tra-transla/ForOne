import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

export interface AivenMysqlConfig {
  uri?: string;
  host?: string;
  port?: number | string;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
}

const CONFIG_FILE_PATH = path.resolve(process.cwd(), 'aiven_mysql_config.json');

let cachedPool: mysql.Pool | null = null;
let activeConfig: AivenMysqlConfig = loadInitialConfig();

function loadInitialConfig(): AivenMysqlConfig {
  // 1. Try file
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      const raw = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.uri || (parsed.host && parsed.user))) {
        return parsed;
      }
    }
  } catch {}

  // 2. Try env variables
  const envUri = process.env.MYSQL_URI || process.env.AIVEN_MYSQL_URI || process.env.DATABASE_URL || '';
  if (envUri) {
    return { uri: envUri, ssl: true };
  }

  const envHost = process.env.MYSQL_HOST || '';
  if (envHost) {
    return {
      host: envHost,
      port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
      user: process.env.MYSQL_USER || 'avnadmin',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'defaultdb',
      ssl: process.env.MYSQL_SSL !== 'false'
    };
  }

  return {};
}

export function isAivenMysqlConfigured(): boolean {
  return Boolean(
    activeConfig.uri?.trim() ||
    (activeConfig.host?.trim() && activeConfig.user?.trim())
  );
}

export function getActiveAivenMysqlConfig(): AivenMysqlConfig {
  return { ...activeConfig };
}

export function saveAivenMysqlConfig(cfg: AivenMysqlConfig) {
  activeConfig = { ...cfg };
  try {
    fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch {}
  resetPool();
}

export function clearAivenMysqlConfig() {
  activeConfig = {};
  try {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
      fs.unlinkSync(CONFIG_FILE_PATH);
    }
  } catch {}
  resetPool();
}

function resetPool() {
  if (cachedPool) {
    cachedPool.end().catch(() => {});
    cachedPool = null;
  }
}

export function createPoolFromConfig(cfg: AivenMysqlConfig): mysql.Pool {
  const isSslEnabled = cfg.ssl !== false;
  const sslOptions = isSslEnabled ? { rejectUnauthorized: false } : undefined;

  if (cfg.uri && cfg.uri.trim()) {
    let uri = cfg.uri.trim();
    // Normalize ssl-mode in connection string for mysql2
    try {
      const parsed = new URL(uri);
      return mysql.createPool({
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 3306,
        user: decodeURIComponent(parsed.username || 'avnadmin'),
        password: decodeURIComponent(parsed.password || ''),
        database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : 'defaultdb',
        ssl: sslOptions,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000
      });
    } catch {
      // Fallback: pass uri string directly
      return mysql.createPool({
        uri,
        ssl: sslOptions,
        waitForConnections: true,
        connectionLimit: 10
      });
    }
  }

  return mysql.createPool({
    host: cfg.host?.trim() || 'localhost',
    port: cfg.port ? Number(cfg.port) : 3306,
    user: cfg.user?.trim() || 'avnadmin',
    password: cfg.password || '',
    database: cfg.database?.trim() || 'defaultdb',
    ssl: sslOptions,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000
  });
}

export function getAivenMysqlPool(): mysql.Pool | null {
  if (!isAivenMysqlConfigured()) return null;
  if (!cachedPool) {
    cachedPool = createPoolFromConfig(activeConfig);
  }
  return cachedPool;
}

/**
 * Test connectivity with Aiven MySQL
 */
export async function testAivenMysqlConnection(cfg?: AivenMysqlConfig): Promise<{ success: boolean; version?: string; error?: string }> {
  const targetConfig = cfg || activeConfig;
  let testPool: mysql.Pool | null = null;
  try {
    testPool = createPoolFromConfig(targetConfig);
    const [rows]: any = await testPool.query('SELECT VERSION() as version');
    const version = rows?.[0]?.version || 'MySQL';
    return { success: true, version };
  } catch (err: any) {
    let msg = err.message || 'Lỗi không xác định khi kết nối Aiven MySQL';
    if (msg.includes('ACCESS DENIED')) msg = 'Sai tài khoản hoặc mật khẩu Aiven MySQL';
    else if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) msg = 'Không tìm thấy máy chủ Aiven hoặc cổng kết nối sai';
    else if (msg.includes('ETIMEDOUT')) msg = 'Hết thời gian kết nối tới Aiven MySQL (Kiểm tra IP Whitelist/SSL)';
    return { success: false, error: msg };
  } finally {
    if (testPool) {
      testPool.end().catch(() => {});
    }
  }
}

/**
 * Initialize MySQL tables schema on Aiven.io
 */
export async function initAivenMysqlSchema(cfg?: AivenMysqlConfig): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = cfg ? createPoolFromConfig(cfg) : getAivenMysqlPool();
  if (!pool) return { success: false, error: 'Chưa cấu hình thông tin kết nối Aiven MySQL' };

  try {
    const tableQueries = [
      // 1. Users table
      `CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'Quản trị',
        is_locked TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

      // 2. Teams table
      `CREATE TABLE IF NOT EXISTS teams (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(191) UNIQUE NOT NULL,
        is_locked TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

      // 3. Registrations table
      `CREATE TABLE IF NOT EXISTS registrations (
        id VARCHAR(100) PRIMARY KEY,
        team VARCHAR(191) NOT NULL,
        in_game_name VARCHAR(191) NOT NULL,
        tanks TEXT NOT NULL,
        is_winner TINYINT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

      // 4. News table
      `CREATE TABLE IF NOT EXISTS news (
        id VARCHAR(100) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`,

      // 5. Campaign Settings table
      `CREATE TABLE IF NOT EXISTS campaign_settings (
        id INT PRIMARY KEY,
        campaign_name VARCHAR(255) NOT NULL DEFAULT 'Campaign 2026',
        phase_name VARCHAR(255) NOT NULL DEFAULT 'Spring Maneuvers',
        start_date VARCHAR(50) NOT NULL DEFAULT '23/03/2026',
        end_date VARCHAR(50) NOT NULL DEFAULT '06/04/2026',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    ];

    for (const q of tableQueries) {
      await pool.query(q);
    }

    // Seed default records if empty
    const seedQueries = [
      `INSERT IGNORE INTO users (id, username, password, role, is_locked) VALUES
       ('251d0986-02e4-45c0-a89c-c832abb7778f', 'admin', 'Sonla@2026', 'Quản trị', 0),
       ('fa818b2c-8bc0-4e4b-97e3-0599a0937402', 'admin1', 'Sonla', 'Quản trị', 0),
       ('bb913b82-6284-4720-bf49-cb7b6d19b48f', 'operator', 'operator123', 'Điều hành', 0);`,

      `INSERT IGNORE INTO teams (id, name, is_locked, created_at) VALUES
       ('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', 0, '2026-03-20 00:00:00'),
       ('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', 0, '2026-03-20 00:01:00'),
       ('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', 0, '2026-03-20 00:02:00'),
       ('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', 0, '2026-03-20 00:03:00');`,

      `INSERT IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date) VALUES
       (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026');`,

      `INSERT IGNORE INTO news (id, title, content, created_at) VALUES
       ('52d95507-e7a3-4f92-8721-70107c643e18', 'Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Các đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.', '2026-03-20 08:00:00'),
       ('c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c', 'Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.', '2026-03-21 09:30:00');`
    ];

    for (const sq of seedQueries) {
      try {
        await pool.query(sq);
      } catch {}
    }

    return { success: true, message: 'Khởi tạo thành công toàn bộ các bảng trên Aiven MySQL!' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi khi khởi tạo schema Aiven MySQL' };
  } finally {
    if (cfg && pool) {
      pool.end().catch(() => {});
    }
  }
}

/**
 * Adapt SQLite-specific SQL queries to MySQL dialect
 */
export function adaptSqlForMysql(sql: string): string {
  let res = sql;

  // 1. Convert datetime('now') to NOW()
  res = res.replace(/datetime\('now'\)/gi, 'NOW()');

  // 2. Convert INSERT OR IGNORE to INSERT IGNORE
  res = res.replace(/INSERT\s+OR\s+IGNORE/gi, 'INSERT IGNORE');

  // 3. Convert ON CONFLICT(col) DO UPDATE SET ... to ON DUPLICATE KEY UPDATE ...
  if (/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET/i.test(res)) {
    res = res.replace(/ON\s+CONFLICT\s*\([^)]+\)\s*DO\s+UPDATE\s+SET/gi, 'ON DUPLICATE KEY UPDATE');
    // Replace excluded.column with VALUES(column)
    res = res.replace(/excluded\.([a-zA-Z0-9_]+)/gi, 'VALUES($1)');
  }

  return res;
}

/**
 * Execute query on Aiven MySQL
 */
export async function queryAivenMysql(
  sql: string,
  params: any[] = []
): Promise<{ success: boolean; results?: any[]; error?: string }> {
  const pool = getAivenMysqlPool();
  if (!pool) return { success: false, error: 'Aiven MySQL chưa được cấu hình' };

  try {
    const mysqlSql = adaptSqlForMysql(sql);
    const [rows]: any = await pool.query(mysqlSql, params);

    // Format results to always be array of objects for SELECT
    if (Array.isArray(rows)) {
      return { success: true, results: rows };
    }
    return { success: true, results: [rows] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi truy vấn Aiven MySQL' };
  }
}

/**
 * Sync entire dataset to Aiven MySQL
 */
export async function syncDatasetToAivenMysql(payload: {
  teams?: any[];
  users?: any[];
  news?: any[];
  registrations?: any[];
  campaignSettings?: any;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  const pool = getAivenMysqlPool();
  if (!pool) return { success: false, error: 'Aiven MySQL chưa kết nối' };

  try {
    const { teams, users, news, registrations, campaignSettings } = payload;

    if (Array.isArray(teams)) {
      for (const t of teams) {
        await pool.query(
          `INSERT INTO teams (id, name, is_locked, created_at)
           VALUES (?, ?, ?, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE name = VALUES(name), is_locked = VALUES(is_locked)`,
          [t.id, t.name, t.is_locked ? 1 : 0, t.created_at || null]
        );
      }
    }

    if (Array.isArray(users)) {
      for (const u of users) {
        await pool.query(
          `INSERT INTO users (id, username, password, role, is_locked, created_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE role = VALUES(role), is_locked = VALUES(is_locked), password = COALESCE(VALUES(password), password)`,
          [u.id, u.username, u.password || 'Sonla@2026', u.role || 'Quản trị', u.is_locked ? 1 : 0]
        );
      }
    }

    if (Array.isArray(news)) {
      for (const n of news) {
        await pool.query(
          `INSERT INTO news (id, title, content, created_at)
           VALUES (?, ?, ?, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content)`,
          [n.id, n.title, n.content, n.created_at || null]
        );
      }
    }

    if (Array.isArray(registrations)) {
      for (const r of registrations) {
        await pool.query(
          `INSERT INTO registrations (id, team, in_game_name, tanks, is_winner, created_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE team = VALUES(team), in_game_name = VALUES(in_game_name), tanks = VALUES(tanks), is_winner = VALUES(is_winner)`,
          [r.id, r.team, r.in_game_name, r.tanks, r.is_winner ? 1 : 0, r.created_at || null]
        );
      }
    }

    if (campaignSettings) {
      await pool.query(
        `INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date, updated_at)
         VALUES (1, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE campaign_name = VALUES(campaign_name), phase_name = VALUES(phase_name), start_date = VALUES(start_date), end_date = VALUES(end_date)`,
        [campaignSettings.campaign_name, campaignSettings.phase_name, campaignSettings.start_date, campaignSettings.end_date]
      );
    }

    return { success: true, message: 'Đồng bộ dữ liệu thành công sang Aiven MySQL!' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi khi đồng bộ dữ liệu vào Aiven MySQL' };
  }
}
