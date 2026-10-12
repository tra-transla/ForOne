import Database from 'better-sqlite3';
import path from 'path';

let localDb: any = null;

export function getLocalSqlite() {
  if (!localDb) {
    const dbPath = path.resolve(process.cwd(), 'campaign_sqlite.db');
    localDb = new Database(dbPath);
    localDb.pragma('journal_mode = WAL');
    initSqliteSchema(localDb);
  }
  return localDb;
}

export function initSqliteSchema(db: any) {
  // 1. Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Quản trị',
      is_locked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Default users
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, username, password, role, is_locked)
    VALUES (?, ?, ?, ?, 0)
  `);
  insertUser.run('251d0986-02e4-45c0-a89c-c832abb7778f', 'admin', 'Sonla@2026', 'Quản trị');
  insertUser.run('fa818b2c-8bc0-4e4b-97e3-0599a0937402', 'admin1', 'Sonla', 'Quản trị');
  insertUser.run('bb913b82-6284-4720-bf49-cb7b6d19b48f', 'operator', 'operator123', 'Điều hành');

  // 2. Teams table
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      is_locked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const insertTeam = db.prepare(`
    INSERT OR IGNORE INTO teams (id, name, is_locked, created_at)
    VALUES (?, ?, 0, ?)
  `);
  insertTeam.run('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', '2026-03-20T00:00:00Z');
  insertTeam.run('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', '2026-03-20T00:01:00Z');
  insertTeam.run('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', '2026-03-20T00:02:00Z');
  insertTeam.run('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', '2026-03-20T00:03:00Z');

  // 3. Registrations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      team TEXT NOT NULL,
      in_game_name TEXT NOT NULL,
      tanks TEXT NOT NULL,
      is_winner INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // 4. News table
  db.exec(`
    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const insertNews = db.prepare(`
    INSERT OR IGNORE INTO news (id, title, content, created_at)
    VALUES (?, ?, ?, ?)
  `);
  insertNews.run(
    '52d95507-e7a3-4f92-8721-70107c643e18',
    'Thông báo: Khởi động sự kiện Campaign 2026',
    'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Các đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.',
    '2026-03-20T08:00:00Z'
  );
  insertNews.run(
    'c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c',
    'Quy định đăng ký & Chốt danh sách',
    'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.',
    '2026-03-21T09:30:00Z'
  );

  // 5. Campaign Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaign_settings (
      id INTEGER PRIMARY KEY,
      campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
      phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers',
      start_date TEXT NOT NULL DEFAULT '23/03/2026',
      end_date TEXT NOT NULL DEFAULT '06/04/2026',
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.prepare(`
    INSERT OR IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
    VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026')
  `).run();
}

/**
 * Execute a query against Cloudflare D1 REST API.
 * Uses: https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database/{database_id}/query
 */
export async function queryCloudflareD1(
  accountId: string,
  databaseId: string,
  apiToken: string,
  sql: string,
  params: any[] = []
): Promise<{ success: boolean; results?: any[]; error?: string; meta?: any }> {
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sql,
        params
      })
    });

    const data: any = await res.json();
    if (!res.ok || !data.success) {
      const errMsg = data.errors?.[0]?.message || data.messages?.[0]?.message || `Cloudflare API error: ${res.status} ${res.statusText}`;
      return { success: false, error: errMsg };
    }

    // Cloudflare D1 returns result array: data.result[0].results
    const firstResult = data.result?.[0];
    return {
      success: true,
      results: firstResult?.results || [],
      meta: firstResult?.meta
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Lỗi kết nối tới Cloudflare D1' };
  }
}

/**
 * Initialize all necessary tables and seed data in Cloudflare D1.
 */
export async function initCloudflareD1Schema(
  accountId: string,
  databaseId: string,
  apiToken: string
): Promise<{ success: boolean; error?: string }> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Quản trị',
      is_locked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      is_locked INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      team TEXT NOT NULL,
      in_game_name TEXT NOT NULL,
      tanks TEXT NOT NULL,
      is_winner INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );`,
    `CREATE TABLE IF NOT EXISTS campaign_settings (
      id INTEGER PRIMARY KEY,
      campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
      phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers',
      start_date TEXT NOT NULL DEFAULT '23/03/2026',
      end_date TEXT NOT NULL DEFAULT '06/04/2026',
      updated_at TEXT DEFAULT (datetime('now'))
    );`,
    `INSERT OR IGNORE INTO users (id, username, password, role, is_locked)
     VALUES ('251d0986-02e4-45c0-a89c-c832abb7778f', 'admin', 'Sonla@2026', 'Quản trị', 0);`,
    `INSERT OR IGNORE INTO users (id, username, password, role, is_locked)
     VALUES ('fa818b2c-8bc0-4e4b-97e3-0599a0937402', 'admin1', 'Sonla', 'Quản trị', 0);`,
    `INSERT OR IGNORE INTO users (id, username, password, role, is_locked)
     VALUES ('bb913b82-6284-4720-bf49-cb7b6d19b48f', 'operator', 'operator123', 'Điều hành', 0);`,
    `INSERT OR IGNORE INTO teams (id, name, is_locked, created_at)
     VALUES ('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', 0, '2026-03-20T00:00:00Z');`,
    `INSERT OR IGNORE INTO teams (id, name, is_locked, created_at)
     VALUES ('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', 0, '2026-03-20T00:01:00Z');`,
    `INSERT OR IGNORE INTO teams (id, name, is_locked, created_at)
     VALUES ('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', 0, '2026-03-20T00:02:00Z');`,
    `INSERT OR IGNORE INTO teams (id, name, is_locked, created_at)
     VALUES ('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', 0, '2026-03-20T00:03:00Z');`,
    `INSERT OR IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
     VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026');`,
    `INSERT OR IGNORE INTO news (id, title, content, created_at)
     VALUES ('52d95507-e7a3-4f92-8721-70107c643e18', 'Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Các đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.', '2026-03-20T08:00:00Z');`,
    `INSERT OR IGNORE INTO news (id, title, content, created_at)
     VALUES ('c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c', 'Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.', '2026-03-21T09:30:00Z');`
  ];

  for (const stmt of statements) {
    try {
      await queryCloudflareD1(accountId, databaseId, apiToken, stmt);
    } catch {
      // Continue to next statement
    }
  }
  return { success: true };
}
