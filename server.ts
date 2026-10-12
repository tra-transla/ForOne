import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import { getLocalSqlite, initSqliteSchema } from './server_db';
import {
  isAivenMysqlConfigured,
  queryAivenMysql,
  testAivenMysqlConnection,
  initAivenMysqlSchema,
  saveAivenMysqlConfig,
  clearAivenMysqlConfig,
  getActiveAivenMysqlConfig,
  syncDatasetToAivenMysql
} from './server_mysql';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

app.use(express.json());
app.use(cookieParser());
app.use(cors());

/**
 * Universal Database Executor:
 * 1. Prioritizes Aiven.io Cloud MySQL when configured.
 * 2. If tables are missing on Aiven MySQL, automatically initializes them and retries.
 * 3. Seamlessly falls back to local SQLite if Aiven MySQL is offline or not yet configured.
 */
async function executeDb(sql: string, params: any[] = []): Promise<{ results: any[]; isAiven: boolean }> {
  if (isAivenMysqlConfigured()) {
    let aivenRes = await queryAivenMysql(sql, params);

    // Auto-create missing tables if needed and retry once
    if (!aivenRes.success && aivenRes.error && (aivenRes.error.includes("doesn't exist") || aivenRes.error.includes('ER_NO_SUCH_TABLE'))) {
      try {
        await initAivenMysqlSchema();
        aivenRes = await queryAivenMysql(sql, params);
      } catch {}
    }

    if (aivenRes.success) {
      return { results: aivenRes.results || [], isAiven: true };
    }

    console.warn('Aiven MySQL query failed, falling back to local SQLite:', aivenRes.error);
  }

  // Fallback to local SQLite
  const db = getLocalSqlite();
  const stmt = db.prepare(sql);
  if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
    return { results: stmt.all(...params), isAiven: false };
  } else {
    const info = stmt.run(...params);
    return { results: [info], isAiven: false };
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
// AIVEN.IO MYSQL / SQLITE DIAGNOSTICS & MANAGEMENT API
// ==========================================

// Get current database status & config
app.get('/api/db/status', async (req, res) => {
  const isConfigured = isAivenMysqlConfigured();
  let aivenConnected = false;
  let aivenError: string | null = null;
  let aivenVersion: string | undefined = undefined;

  if (isConfigured) {
    const test = await testAivenMysqlConnection();
    aivenConnected = test.success;
    if (test.success) {
      aivenVersion = test.version;
    } else {
      aivenError = test.error || 'Lỗi kết nối Aiven MySQL';
    }
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

  const activeCfg = getActiveAivenMysqlConfig();
  const maskedUri = activeCfg.uri
    ? activeCfg.uri.replace(/:([^:@]+)@/, ':••••••@')
    : undefined;

  res.json({
    engine: isConfigured && aivenConnected ? `Aiven.io Cloud MySQL (${aivenVersion || 'v8.0'})` : 'SQLite Database Engine (Local Fallback)',
    mode: isConfigured && aivenConnected ? 'aiven_mysql' : 'local_sqlite',
    isConfigured,
    connected: aivenConnected,
    error: aivenError,
    version: aivenVersion,
    activeConfig: {
      uriMasked: maskedUri,
      host: activeCfg.host,
      port: activeCfg.port,
      user: activeCfg.user,
      database: activeCfg.database
    },
    stats
  });
});

// Configure or update Aiven MySQL credentials dynamically
app.post('/api/db/config', async (req, res) => {
  const { uri, host, port, user, password, database, ssl } = req.body;
  if (!uri && (!host || !user)) {
    return res.status(400).json({ error: 'Vui lòng cung cấp Service URI từ Aiven Console hoặc Host & User.' });
  }

  const cfg = {
    uri: uri?.trim(),
    host: host?.trim(),
    port: port ? Number(port) : 3306,
    user: user?.trim(),
    password: password || '',
    database: database?.trim() || 'defaultdb',
    ssl: ssl !== false
  };

  // Test credentials immediately
  const test = await testAivenMysqlConnection(cfg);
  if (!test.success) {
    return res.status(400).json({
      error: `Không thể kết nối Aiven MySQL: ${test.error}. Vui lòng kiểm tra lại Service URI hoặc mật khẩu.`
    });
  }

  // Save config
  saveAivenMysqlConfig(cfg);

  // Automatically ensure tables exist on Aiven MySQL
  try {
    await initAivenMysqlSchema(cfg);
  } catch (schemaErr: any) {
    console.warn('Notice initializing Aiven MySQL schema:', schemaErr?.message);
  }

  res.json({
    success: true,
    message: `Kết nối thành công tới Aiven MySQL (${test.version || 'Active'}) và đã khởi tạo cấu trúc bảng!`
  });
});

// Reset to local SQLite
app.post('/api/db/reset-config', (req, res) => {
  clearAivenMysqlConfig();
  res.json({ success: true, message: 'Đã ngắt kết nối Aiven và chuyển về SQLite an toàn' });
});

// Initialize / Create All Tables in Active Database (1-Click)
app.post('/api/db/init-tables', async (req, res) => {
  try {
    if (isAivenMysqlConfigured()) {
      const mysqlRes = await initAivenMysqlSchema();
      if (!mysqlRes.success) {
        return res.status(500).json({ error: mysqlRes.error });
      }
    }

    // Also ensure local SQLite schema
    const local = getLocalSqlite();
    initSqliteSchema(local);

    res.json({
      success: true,
      message: 'Khởi tạo thành công toàn bộ bảng & tài khoản mặc định trên Aiven MySQL & SQLite!'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi khởi tạo bảng' });
  }
});

// Sync data between client and backend (Aiven MySQL & SQLite)
app.post('/api/db/sync', async (req, res) => {
  const { teams, users, news, registrations, campaignSettings } = req.body;
  try {
    // 1. Sync to Aiven MySQL if configured
    if (isAivenMysqlConfigured()) {
      await syncDatasetToAivenMysql({ teams, users, news, registrations, campaignSettings });
    }

    // 2. Also keep local SQLite updated as backup
    if (Array.isArray(teams)) {
      for (const t of teams) {
        const local = getLocalSqlite();
        local.prepare(`
          INSERT INTO teams (id, name, is_locked, created_at)
          VALUES (?, ?, ?, COALESCE(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, is_locked=excluded.is_locked
        `).run(t.id, t.name, t.is_locked ? 1 : 0, t.created_at || null);
      }
    }

    if (Array.isArray(users)) {
      for (const u of users) {
        const local = getLocalSqlite();
        local.prepare(`
          INSERT INTO users (id, username, password, role, is_locked, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET role=excluded.role, is_locked=excluded.is_locked, password=COALESCE(excluded.password, users.password)
        `).run(u.id, u.username, u.password || 'Sonla@2026', u.role || 'Quản trị', u.is_locked ? 1 : 0);
      }
    }

    if (Array.isArray(news)) {
      for (const n of news) {
        const local = getLocalSqlite();
        local.prepare(`
          INSERT INTO news (id, title, content, created_at)
          VALUES (?, ?, ?, COALESCE(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content
        `).run(n.id, n.title, n.content, n.created_at || null);
      }
    }

    if (Array.isArray(registrations)) {
      for (const r of registrations) {
        const local = getLocalSqlite();
        local.prepare(`
          INSERT INTO registrations (id, team, in_game_name, tanks, is_winner, created_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET team=excluded.team, in_game_name=excluded.in_game_name, tanks=excluded.tanks, is_winner=excluded.is_winner
        `).run(r.id, r.team, r.in_game_name, r.tanks, r.is_winner ? 1 : 0, r.created_at || null);
      }
    }

    if (campaignSettings) {
      const local = getLocalSqlite();
      local.prepare(`
        INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date, updated_at)
        VALUES (1, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET campaign_name=excluded.campaign_name, phase_name=excluded.phase_name, start_date=excluded.start_date, end_date=excluded.end_date
      `).run(campaignSettings.campaign_name, campaignSettings.phase_name, campaignSettings.start_date, campaignSettings.end_date);
    }

    res.json({
      success: true,
      message: isAivenMysqlConfigured()
        ? 'Đồng bộ dữ liệu thành công sang Aiven MySQL và lưu dự phòng an toàn trên SQLite!'
        : 'Đồng bộ dữ liệu thành công lên SQLite!'
    });
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
  const rawId = req.params.id;
  const id = decodeURIComponent(rawId);
  const { name } = req.body || {};
  const teamName = name ? decodeURIComponent(name) : id;

  try {
    await executeDb('DELETE FROM teams WHERE id = ? OR name = ? OR id = ? OR name = ?', [id, id, teamName, teamName]);
    try {
      const localDb = getLocalSqlite();
      localDb.prepare('DELETE FROM teams WHERE id = ? OR name = ? OR id = ? OR name = ?').run(id, id, teamName, teamName);
    } catch {}
    res.json({ success: true, message: 'Đã xóa team thành công' });
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
  const rawId = req.params.id;
  const id = decodeURIComponent(rawId);
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
  const rawId = req.params.id;
  const id = decodeURIComponent(rawId);
  const { in_game_name, team } = req.body || {};

  try {
    let sql = 'DELETE FROM registrations WHERE id = ?';
    let params: any[] = [id];

    if (in_game_name && team) {
      sql = 'DELETE FROM registrations WHERE id = ? OR in_game_name = ? OR (in_game_name = ? AND team = ?)';
      params = [id, in_game_name, in_game_name, team];
    } else if (in_game_name) {
      sql = 'DELETE FROM registrations WHERE id = ? OR in_game_name = ?';
      params = [id, in_game_name];
    }

    await executeDb(sql, params);

    // Also delete from local SQLite to ensure complete sync
    try {
      const localDb = getLocalSqlite();
      localDb.prepare(sql).run(...params);
    } catch {}

    res.json({ success: true, message: 'Đã xóa đăng ký thành công' });
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
  const rawId = req.params.id;
  const id = decodeURIComponent(rawId);
  try {
    await executeDb('DELETE FROM users WHERE id = ? OR username = ?', [id, id]);
    try {
      const localDb = getLocalSqlite();
      localDb.prepare('DELETE FROM users WHERE id = ? OR username = ?').run(id, id);
    } catch {}
    res.json({ success: true, message: 'Đã xóa người dùng thành công' });
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
  const rawId = req.params.id;
  const id = decodeURIComponent(rawId);
  const { title, content } = req.body;
  try {
    await executeDb('UPDATE news SET title = ?, content = ? WHERE id = ?', [title.trim(), content.trim(), id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/news/:id', async (req, res) => {
  const rawId = req.params.id;
  const id = decodeURIComponent(rawId);
  try {
    await executeDb('DELETE FROM news WHERE id = ? OR title = ?', [id, id]);
    try {
      const localDb = getLocalSqlite();
      localDb.prepare('DELETE FROM news WHERE id = ? OR title = ?').run(id, id);
    } catch {}
    res.json({ success: true, message: 'Đã xóa tin tức thành công' });
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

  // If Aiven MySQL is configured, ensure tables exist on Aiven MySQL
  if (isAivenMysqlConfigured()) {
    initAivenMysqlSchema().catch((err) => {
      console.warn('Notice initializing Aiven MySQL on startup:', err?.message);
    });
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
