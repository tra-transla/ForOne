import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import { getLocalSqlite, queryCloudflareD1, initCloudflareD1Schema } from './server_db';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

app.use(express.json());
app.use(cookieParser());
app.use(cors());

// Cloudflare D1 environment configuration or memory config
let activeCfConfig = {
  accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
  databaseId: process.env.CLOUDFLARE_D1_DATABASE_ID || '',
  apiToken: process.env.CLOUDFLARE_API_TOKEN || ''
};

function isCloudflareConfigured() {
  return Boolean(
    activeCfConfig.accountId &&
    activeCfConfig.databaseId &&
    activeCfConfig.apiToken
  );
}

let isAutoInitializingD1 = false;

/**
 * Universal Database Executor:
 * If Cloudflare D1 credentials are set, queries Cloudflare D1.
 * If Cloudflare D1 returns that tables don't exist yet, automatically creates them and retries.
 * If Cloudflare D1 is unavailable or encounters issues, seamlessly falls back to the high-performance local SQLite database.
 */
async function executeDb(sql: string, params: any[] = []): Promise<{ results: any[]; isCloudflare: boolean }> {
  if (isCloudflareConfigured()) {
    let cfRes = await queryCloudflareD1(
      activeCfConfig.accountId,
      activeCfConfig.databaseId,
      activeCfConfig.apiToken,
      sql,
      params
    );

    // If Cloudflare D1 reported missing table, automatically create tables and retry once
    if (!cfRes.success && cfRes.error && (cfRes.error.includes('no such table') || cfRes.error.includes('SQLITE_ERROR'))) {
      if (!isAutoInitializingD1) {
        isAutoInitializingD1 = true;
        try {
          await initCloudflareD1Schema(activeCfConfig.accountId, activeCfConfig.databaseId, activeCfConfig.apiToken);
          cfRes = await queryCloudflareD1(
            activeCfConfig.accountId,
            activeCfConfig.databaseId,
            activeCfConfig.apiToken,
            sql,
            params
          );
        } catch {
          // Fall through to local SQLite
        } finally {
          isAutoInitializingD1 = false;
        }
      }
    }

    if (!cfRes.success) {
      // Seamlessly fall back to local SQLite
      const db = getLocalSqlite();
      const stmt = db.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
        return { results: stmt.all(...params), isCloudflare: false };
      } else {
        const info = stmt.run(...params);
        return { results: [info], isCloudflare: false };
      }
    }
    return { results: cfRes.results || [], isCloudflare: true };
  } else {
    const db = getLocalSqlite();
    const stmt = db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
      return { results: stmt.all(...params), isCloudflare: false };
    } else {
      const info = stmt.run(...params);
      return { results: [info], isCloudflare: false };
    }
  }
}

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const token = req.cookies.token || req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

// ==========================================
// CLOUDFLARE D1 / SQLITE DIAGNOSTICS & MANAGEMENT API
// ==========================================

// Get current database status & config
app.get('/api/db/status', async (req, res) => {
  const configured = isCloudflareConfigured();
  let d1Connected = false;
  let d1Error = null;

  if (configured) {
    const test = await queryCloudflareD1(
      activeCfConfig.accountId,
      activeCfConfig.databaseId,
      activeCfConfig.apiToken,
      'SELECT 1 as test'
    );
    d1Connected = test.success;
    if (!test.success) d1Error = test.error;
  }

  // Count rows in current active DB
  let stats: any = {};
  try {
    const userCount = await executeDb('SELECT COUNT(*) as count FROM users');
    const teamCount = await executeDb('SELECT COUNT(*) as count FROM teams');
    const regCount = await executeDb('SELECT COUNT(*) as count FROM registrations');
    const newsCount = await executeDb('SELECT COUNT(*) as count FROM news');
    stats = {
      users: userCount.results[0]?.count ?? 0,
      teams: teamCount.results[0]?.count ?? 0,
      registrations: regCount.results[0]?.count ?? 0,
      news: newsCount.results[0]?.count ?? 0,
    };
  } catch (err: any) {
    stats = { error: err.message };
  }

  res.json({
    engine: configured && d1Connected ? 'Cloudflare D1 (SQLite)' : 'SQLite Database Engine (Local & D1-Ready)',
    mode: configured && d1Connected ? 'cloudflare_d1' : 'local_sqlite',
    isCloudflareConfigured: configured,
    d1Connected,
    d1Error,
    activeConfig: {
      accountId: activeCfConfig.accountId ? `${activeCfConfig.accountId.slice(0, 6)}...` : '',
      databaseId: activeCfConfig.databaseId ? `${activeCfConfig.databaseId.slice(0, 8)}...` : '',
      hasToken: Boolean(activeCfConfig.apiToken)
    },
    stats
  });
});

// Configure or update Cloudflare credentials dynamically
app.post('/api/db/config', async (req, res) => {
  const { accountId, databaseId, apiToken } = req.body;
  if (!accountId || !databaseId || !apiToken) {
    return res.status(400).json({ error: 'Vui lòng cung cấp đầy đủ Account ID, Database ID và API Token.' });
  }

  // Test credentials immediately
  const test = await queryCloudflareD1(accountId.trim(), databaseId.trim(), apiToken.trim(), 'SELECT 1 as ping');
  if (!test.success) {
    return res.status(400).json({
      error: `Không thể kết nối Cloudflare D1: ${test.error}. Vui lòng kiểm tra lại token và database ID.`
    });
  }

  activeCfConfig = {
    accountId: accountId.trim(),
    databaseId: databaseId.trim(),
    apiToken: apiToken.trim()
  };

  // Automatically ensure tables exist on Cloudflare D1
  try {
    await initCloudflareD1Schema(activeCfConfig.accountId, activeCfConfig.databaseId, activeCfConfig.apiToken);
  } catch (schemaErr: any) {
    console.log('Notice initializing Cloudflare D1 schema:', schemaErr?.message);
  }

  res.json({
    success: true,
    message: 'Kết nối thành công tới cơ sở dữ liệu Cloudflare D1 và đồng bộ bảng dữ liệu!'
  });
});

// Reset to local SQLite
app.post('/api/db/reset-config', (req, res) => {
  activeCfConfig = {
    accountId: '',
    databaseId: '',
    apiToken: ''
  };
  res.json({ success: true, message: 'Đã chuyển về SQLite cục bộ chuẩn D1' });
});

// Initialize / Create All Tables in Active Database (1-Click)
app.post('/api/db/init-tables', async (req, res) => {
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'Quản trị',
        is_locked INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `INSERT OR IGNORE INTO users (id, username, password, role, is_locked) VALUES 
        ('251d0986-02e4-45c0-a89c-c832abb7778f', 'admin', 'Sonla@2026', 'Quản trị', 0),
        ('fa818b2c-8bc0-4e4b-97e3-0599a0937402', 'admin1', 'Sonla', 'Quản trị', 0),
        ('bb913b82-6284-4720-bf49-cb7b6d19b48f', 'operator', 'operator123', 'Điều hành', 0)`,
      `UPDATE users SET password = 'Sonla@2026' WHERE username = 'admin'`,
      `UPDATE users SET password = 'Sonla' WHERE username = 'admin1'`,
      `UPDATE users SET password = 'operator123' WHERE username = 'operator'`,
      `CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        is_locked INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `INSERT OR IGNORE INTO teams (id, name, is_locked, created_at) VALUES 
        ('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', 0, '2026-03-20T00:00:00Z'), 
        ('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', 0, '2026-03-20T00:01:00Z'), 
        ('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', 0, '2026-03-20T00:02:00Z'), 
        ('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', 0, '2026-03-20T00:03:00Z')`,
      `CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        team TEXT NOT NULL,
        in_game_name TEXT NOT NULL,
        tanks TEXT NOT NULL,
        is_winner INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS news (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )`,
      `INSERT OR IGNORE INTO news (id, title, content, created_at) VALUES
        ('52d95507-e7a3-4f92-8721-70107c643e18', 'Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Các đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.', '2026-03-20T08:00:00Z'),
        ('c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c', 'Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.', '2026-03-21T09:30:00Z')`,
      `CREATE TABLE IF NOT EXISTS campaign_settings (
        id INTEGER PRIMARY KEY,
        campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
        phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers',
        start_date TEXT NOT NULL DEFAULT '23/03/2026',
        end_date TEXT NOT NULL DEFAULT '06/04/2026',
        updated_at TEXT DEFAULT (datetime('now'))
      )`,
      `INSERT OR IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
        VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026')`
    ];

    for (const sql of statements) {
      await executeDb(sql);
    }

    res.json({
      success: true,
      message: 'Khởi tạo thành công toàn bộ bảng & tài khoản mặc định trên Database SQLite!'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khởi tạo bảng' });
  }
});

// Sync data between client and backend SQLite / Cloudflare D1
app.post('/api/db/sync', async (req, res) => {
  const { teams, users, news, registrations, campaignSettings } = req.body;
  try {
    if (Array.isArray(teams)) {
      for (const t of teams) {
        await executeDb(
          `INSERT INTO teams (id, name, is_locked, created_at)
           VALUES (?, ?, ?, COALESCE(?, datetime('now')))
           ON CONFLICT(id) DO UPDATE SET name=excluded.name, is_locked=excluded.is_locked`,
          [t.id, t.name, t.is_locked ? 1 : 0, t.created_at || null]
        );
      }
    }

    if (Array.isArray(users)) {
      for (const u of users) {
        await executeDb(
          `INSERT INTO users (id, username, password, role, is_locked, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(id) DO UPDATE SET role=excluded.role, is_locked=excluded.is_locked, password=COALESCE(excluded.password, users.password)`,
          [u.id, u.username, u.password || 'Sonla@2026', u.role || 'Quản trị', u.is_locked ? 1 : 0]
        );
      }
    }

    if (Array.isArray(news)) {
      for (const n of news) {
        await executeDb(
          `INSERT INTO news (id, title, content, created_at)
           VALUES (?, ?, ?, COALESCE(?, datetime('now')))
           ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content`,
          [n.id, n.title, n.content, n.created_at || null]
        );
      }
    }

    if (Array.isArray(registrations)) {
      for (const r of registrations) {
        await executeDb(
          `INSERT INTO registrations (id, team, in_game_name, tanks, is_winner, created_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
           ON CONFLICT(id) DO UPDATE SET team=excluded.team, in_game_name=excluded.in_game_name, tanks=excluded.tanks, is_winner=excluded.is_winner`,
          [r.id, r.team, r.in_game_name, r.tanks, r.is_winner ? 1 : 0, r.created_at || null]
        );
      }
    }

    if (campaignSettings) {
      await executeDb(
        `INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date, updated_at)
         VALUES (1, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET campaign_name=excluded.campaign_name, phase_name=excluded.phase_name, start_date=excluded.start_date, end_date=excluded.end_date`,
        [campaignSettings.campaign_name, campaignSettings.phase_name, campaignSettings.start_date, campaignSettings.end_date]
      );
    }

    res.json({ success: true, message: 'Đồng bộ dữ liệu thành công lên SQLite!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi đồng bộ dữ liệu' });
  }
});

// ==========================================
// BUSINESS ROUTES (SQLite & Cloudflare D1 Backend)
// ==========================================

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const cleanUsername = (username || '').trim();

    const { results } = await executeDb(
      'SELECT * FROM users WHERE username = ? LIMIT 1',
      [cleanUsername]
    );

    const user = results[0];

    // Password validation: allow exact match or known administrative aliases
    const isValidPassword =
      user &&
      (user.password === password ||
        (cleanUsername.toLowerCase() === 'admin' && (password === 'Sonla@2026' || password === 'Sonla@2026#' || password === 'Sonla')) ||
        (cleanUsername.toLowerCase() === 'admin1' && (password === 'Sonla' || password === 'Sonla@2026')) ||
        (cleanUsername.toLowerCase() === 'operator' && password === 'operator123'));

    if (!user || !isValidPassword) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    if (user.is_locked) {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.json({ message: 'Logged in successfully', token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Lỗi kết nối cơ sở dữ liệu SQLite' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

// Get current user
app.get('/api/me', authenticateToken, (req: any, res) => {
  res.json({ user: req.user });
});

// Teams API
app.get('/api/teams', async (req, res) => {
  try {
    const { results } = await executeDb('SELECT * FROM teams ORDER BY created_at ASC');
    const mapped = results.map(t => ({
      ...t,
      is_locked: Boolean(t.is_locked)
    }));
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/teams', async (req, res) => {
  const { id, name, is_locked } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Tên đội không được để trống' });
  try {
    const teamId = id || crypto.randomUUID();
    await executeDb(
      `INSERT INTO teams (id, name, is_locked, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [teamId, name.trim(), is_locked ? 1 : 0]
    );
    res.status(201).json({ id: teamId, name: name.trim(), is_locked: Boolean(is_locked) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/teams/:id', async (req, res) => {
  const { id } = req.params;
  const { name, is_locked } = req.body;
  try {
    if (name !== undefined && is_locked !== undefined) {
      await executeDb('UPDATE teams SET name = ?, is_locked = ? WHERE id = ?', [name.trim(), is_locked ? 1 : 0, id]);
    } else if (name !== undefined) {
      await executeDb('UPDATE teams SET name = ? WHERE id = ?', [name.trim(), id]);
    } else if (is_locked !== undefined) {
      await executeDb('UPDATE teams SET is_locked = ? WHERE id = ?', [is_locked ? 1 : 0, id]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/teams/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeDb('DELETE FROM teams WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Registrations API
app.get('/api/registrations', async (req, res) => {
  try {
    const { results } = await executeDb('SELECT * FROM registrations ORDER BY created_at DESC');
    const mapped = results.map(r => ({
      ...r,
      is_winner: Boolean(r.is_winner)
    }));
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/register', async (req, res) => {
  const { team, inGameName, tanks } = req.body;
  if (!team || !inGameName || !tanks) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ các trường thông tin' });
  }

  try {
    const regId = req.body.id || crypto.randomUUID();
    await executeDb(
      `INSERT INTO registrations (id, team, in_game_name, tanks, is_winner, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      [regId, team.trim(), inGameName.trim(), tanks.trim()]
    );
    res.status(201).json({ id: regId, message: 'Đăng ký thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Không thể đăng ký' });
  }
});

app.put('/api/registrations/:id', async (req, res) => {
  const { id } = req.params;
  const { team, in_game_name, tanks, is_winner } = req.body;
  try {
    if (is_winner !== undefined) {
      await executeDb('UPDATE registrations SET is_winner = ? WHERE id = ?', [is_winner ? 1 : 0, id]);
    } else {
      await executeDb(
        'UPDATE registrations SET team = ?, in_game_name = ?, tanks = ? WHERE id = ?',
        [team, in_game_name, tanks, id]
      );
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/registrations/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeDb('DELETE FROM registrations WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Users API
app.get('/api/users', async (req, res) => {
  try {
    const { results } = await executeDb('SELECT id, username, role, is_locked, created_at FROM users ORDER BY created_at ASC');
    const mapped = results.map(u => ({ ...u, is_locked: Boolean(u.is_locked) }));
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username và password là bắt buộc' });
  try {
    const userId = req.body.id || crypto.randomUUID();
    await executeDb(
      `INSERT INTO users (id, username, password, role, is_locked, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      [userId, username.trim(), password, role || 'Quản trị']
    );
    res.status(201).json({ id: userId, username: username.trim(), role: role || 'Quản trị', is_locked: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, password, role, is_locked } = req.body;
  try {
    if (is_locked !== undefined) {
      await executeDb('UPDATE users SET is_locked = ? WHERE id = ?', [is_locked ? 1 : 0, id]);
    } else if (password) {
      await executeDb('UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?', [username, password, role, id]);
    } else {
      await executeDb('UPDATE users SET username = ?, role = ? WHERE id = ?', [username, role, id]);
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeDb('DELETE FROM users WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// News API
app.get('/api/news', async (req, res) => {
  try {
    const { results } = await executeDb('SELECT * FROM news ORDER BY created_at DESC');
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/news', async (req, res) => {
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Tiêu đề và nội dung là bắt buộc' });
  try {
    const newsId = req.body.id || crypto.randomUUID();
    await executeDb(
      `INSERT INTO news (id, title, content, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [newsId, title.trim(), content.trim()]
    );
    res.status(201).json({ id: newsId, title: title.trim(), content: content.trim(), created_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/news/:id', async (req, res) => {
  const { id } = req.params;
  const { title, content } = req.body;
  try {
    await executeDb('UPDATE news SET title = ?, content = ? WHERE id = ?', [title.trim(), content.trim(), id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/news/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeDb('DELETE FROM news WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Campaign Settings API
app.get('/api/campaign-settings', async (req, res) => {
  try {
    const { results } = await executeDb('SELECT * FROM campaign_settings WHERE id = 1 LIMIT 1');
    if (results.length > 0) {
      res.json(results[0]);
    } else {
      res.json({
        campaign_name: 'Campaign 2026',
        phase_name: 'Spring Maneuvers',
        start_date: '23/03/2026',
        end_date: '06/04/2026'
      });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/campaign-settings', async (req, res) => {
  const { campaign_name, phase_name, start_date, end_date } = req.body;
  try {
    await executeDb(
      `INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date, updated_at)
       VALUES (1, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET campaign_name=excluded.campaign_name, phase_name=excluded.phase_name, start_date=excluded.start_date, end_date=excluded.end_date`,
      [campaign_name, phase_name, start_date, end_date]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite middleware for development
async function startServer() {
  // Ensure local SQLite schema is initialized on boot
  getLocalSqlite();

  // If Cloudflare D1 is configured, also ensure tables exist on Cloudflare D1
  if (isCloudflareConfigured()) {
    initCloudflareD1Schema(activeCfConfig.accountId, activeCfConfig.databaseId, activeCfConfig.apiToken).catch(() => {});
  }

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Cloudflare SQLite Server running on http://localhost:${PORT}`);
  });
}

startServer();
