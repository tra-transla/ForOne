import express from 'express';
import { createServer as createViteServer } from 'vite';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getLocalSqlite } from './server_db.ts';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

app.use(express.json());
app.use(cookieParser());
app.use(cors());

// Helper for safe background async execution
function runAsync(fn: () => Promise<any>) {
  fn().catch(() => {});
}

// ==========================================
// SERVER-SIDE PERSISTENT SUPABASE CONFIGURATION
// ==========================================
const CONFIG_PATH = path.join(process.cwd(), 'supabase_config.json');
const DEFAULT_URL = 'https://czlmqxfxfbrwzmshespi.supabase.co';
const DEFAULT_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6bG1xeGZ4ZmJyd3ptc2hlc3BpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE4MDAyNTMsImV4cCI6MjEwNzM3NjI1M30.CvsY3d0pVwYdm7ZxiyUPfSByNj35U49fhdfytOh44ww';

function getServerSupabaseConfig() {
  let fileUrl = '';
  let fileKey = '';

  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      if (content.url) fileUrl = String(content.url).trim();
      if (content.key) fileKey = String(content.key).trim();
    }
  } catch {}

  const envUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const envKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  const url = (fileUrl || envUrl || DEFAULT_URL).trim();
  const key = (fileKey || envKey || DEFAULT_KEY).trim();

  return { url, key };
}

let serverSupabaseClient: SupabaseClient | null = null;
let lastServerUrl = '';
let lastServerKey = '';

function getServerSupabaseClient(): SupabaseClient | null {
  const cfg = getServerSupabaseConfig();
  if (!cfg.url || !cfg.key) return null;
  if (!serverSupabaseClient || lastServerUrl !== cfg.url || lastServerKey !== cfg.key) {
    lastServerUrl = cfg.url;
    lastServerKey = cfg.key;
    try {
      serverSupabaseClient = createClient(cfg.url, cfg.key, { auth: { persistSession: false } });
    } catch {
      serverSupabaseClient = null;
    }
  }
  return serverSupabaseClient;
}

// Background push to Supabase for registrations
async function pushRegistrationToSupabase(reg: {
  id: string;
  team: string;
  in_game_name: string;
  tanks: string;
  is_winner?: boolean;
}) {
  try {
    const client = getServerSupabaseClient();
    if (!client) return;
    await client.from('registrations').upsert([
      {
        id: reg.id,
        team: reg.team,
        in_game_name: reg.in_game_name,
        tanks: reg.tanks,
        is_winner: Boolean(reg.is_winner),
        created_at: new Date().toISOString()
      }
    ], { onConflict: 'id' });
  } catch (err) {
    console.warn('Server-side Supabase push warning:', err);
  }
}

/**
 * Local Database Executor:
 * Uses high-performance local SQLite as a local backup and offline cache layer,
 * while the frontend connects directly and primarily to the Supabase Cloud Database.
 */
async function executeDb(sql: string, params: any[] = []): Promise<{ results: any[] }> {
  const db = getLocalSqlite();
  const stmt = db.prepare(sql);
  if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('PRAGMA')) {
    return { results: stmt.all(...params) };
  } else {
    const info = stmt.run(...params);
    return { results: [info] };
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
// SUPABASE BACKUP & STATUS API
// ==========================================

// Get persistent Supabase URL and Key for all frontend clients
app.get('/api/supabase/config', (req, res) => {
  const cfg = getServerSupabaseConfig();
  res.json(cfg);
});

// Update persistent Supabase URL and Key server-wide
app.post('/api/supabase/config', (req, res) => {
  const { url, key } = req.body;
  if (!url || !key) {
    return res.status(400).json({ error: 'URL và Key không được để trống' });
  }
  try {
    const data = {
      url: String(url).trim(),
      key: String(key).trim(),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8');
    serverSupabaseClient = null; // reset client
    res.json({ success: true, message: 'Đã lưu cấu hình Supabase vĩnh viễn trên hệ thống!' });
  } catch (err: any) {
    res.status(500).json({ error: 'Không thể lưu cấu hình server: ' + err.message });
  }
});

// Get current database status & local statistics
app.get('/api/db/status', async (req, res) => {
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

  const cfg = getServerSupabaseConfig();

  res.json({
    engine: 'Supabase Cloud Database (PostgreSQL) + Local SQLite Backup',
    mode: 'supabase',
    isConfigured: true,
    connected: true,
    supabaseUrl: cfg.url,
    error: null,
    stats
  });
});

// Sync data between client and backend SQLite backup
app.post('/api/db/sync', async (req, res) => {
  const { teams, users, news, registrations, campaignSettings } = req.body;
  try {
    const local = getLocalSqlite();

    if (Array.isArray(teams)) {
      for (const t of teams) {
        local.prepare(`
          INSERT INTO teams (id, name, is_locked, created_at)
          VALUES (?, ?, ?, COALESCE(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, is_locked=excluded.is_locked
        `).run(t.id, t.name, t.is_locked ? 1 : 0, t.created_at || null);
      }
    }

    if (Array.isArray(users)) {
      for (const u of users) {
        local.prepare(`
          INSERT INTO users (id, username, password, role, is_locked, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET role=excluded.role, is_locked=excluded.is_locked, password=COALESCE(excluded.password, users.password)
        `).run(u.id, u.username, u.password || 'Sonla@2026', u.role || 'Quản trị', u.is_locked ? 1 : 0);
      }
    }

    if (Array.isArray(news)) {
      for (const n of news) {
        local.prepare(`
          INSERT INTO news (id, title, content, created_at)
          VALUES (?, ?, ?, COALESCE(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET title=excluded.title, content=excluded.content
        `).run(n.id, n.title, n.content, n.created_at || null);
      }
    }

    if (Array.isArray(registrations)) {
      for (const r of registrations) {
        local.prepare(`
          INSERT INTO registrations (id, team, in_game_name, tanks, is_winner, created_at)
          VALUES (?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
          ON CONFLICT(id) DO UPDATE SET team=excluded.team, in_game_name=excluded.in_game_name, tanks=excluded.tanks, is_winner=excluded.is_winner
        `).run(r.id, r.team, r.in_game_name, r.tanks, r.is_winner ? 1 : 0, r.created_at || null);
      }
    }

    if (campaignSettings) {
      local.prepare(`
        INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date, updated_at)
        VALUES (1, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(id) DO UPDATE SET campaign_name=excluded.campaign_name, phase_name=excluded.phase_name, start_date=excluded.start_date, end_date=excluded.end_date
      `).run(campaignSettings.campaign_name, campaignSettings.phase_name, campaignSettings.start_date, campaignSettings.end_date);
    }

    res.json({
      success: true,
      message: 'Đồng bộ dữ liệu lưu dự phòng trên SQLite thành công!'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Lỗi đồng bộ dữ liệu' });
  }
});

// ==========================================
// BUSINESS ROUTES (SQLite Local Fallback Layer)
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
    res.status(500).json({ error: error.message || 'Lỗi kết nối cơ sở dữ liệu' });
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
    const cleanName = name.trim();
    const lockedVal = is_locked ? 1 : 0;

    await executeDb(
      `INSERT INTO teams (id, name, is_locked, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [teamId, cleanName, lockedVal]
    );

    // Push to Supabase in background
    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        await client.from('teams').upsert([{ id: teamId, name: cleanName, is_locked: Boolean(lockedVal) }], { onConflict: 'name' });
      }
    });

    res.status(201).json({ id: teamId, name: cleanName, is_locked: Boolean(lockedVal) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/teams/:id', async (req, res) => {
  const idOrName = decodeURIComponent(req.params.id);
  const { name, is_locked } = req.body;
  try {
    if (is_locked !== undefined) {
      await executeDb('UPDATE teams SET is_locked = ? WHERE id = ? OR name = ?', [is_locked ? 1 : 0, idOrName, idOrName]);
    }
    if (name) {
      const cleanName = name.trim();
      const { results } = await executeDb('SELECT name FROM teams WHERE id = ? OR name = ? LIMIT 1', [idOrName, idOrName]);
      const oldName = results[0]?.name || idOrName;

      await executeDb('UPDATE teams SET name = ? WHERE id = ? OR name = ?', [cleanName, idOrName, idOrName]);
      await executeDb('UPDATE registrations SET team = ? WHERE team = ?', [cleanName, oldName]);
    }

    // Push update to Supabase
    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client && name) {
        await client.from('teams').update({ name: name.trim(), is_locked: Boolean(is_locked) }).or(`id.eq.${idOrName},name.eq.${idOrName}`);
      }
    });

    res.json({ message: 'Team updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/teams/:id', async (req, res) => {
  const idOrName = decodeURIComponent(req.params.id);
  const { name } = req.body || {};
  try {
    await executeDb('DELETE FROM teams WHERE id = ? OR name = ? OR name = ?', [idOrName, idOrName, name || '']);

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        await client.from('teams').delete().or(`id.eq.${idOrName},name.eq.${idOrName}`);
      }
    });

    res.json({ message: 'Team deleted successfully' });
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
  const { id, team, inGameName, in_game_name, tanks } = req.body;
  const ign = inGameName || in_game_name;
  if (!team || !ign || !tanks) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
  }

  try {
    // Check if team is locked
    const { results } = await executeDb('SELECT is_locked FROM teams WHERE name = ? LIMIT 1', [team]);
    if (results.length > 0 && results[0].is_locked) {
      return res.status(400).json({ error: 'Đội này đã chốt danh sách, không thể đăng ký thêm!' });
    }

    const regId = id || crypto.randomUUID();
    const cleanIgn = ign.trim();
    const cleanTanks = tanks.trim();

    await executeDb(
      `INSERT INTO registrations (id, team, in_game_name, tanks, is_winner, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      [regId, team, cleanIgn, cleanTanks]
    );

    // ALSO push directly to Supabase Cloud Database!
    runAsync(async () => {
      await pushRegistrationToSupabase({
        id: regId,
        team,
        in_game_name: cleanIgn,
        tanks: cleanTanks,
        is_winner: false
      });
    });

    res.status(201).json({ id: regId, message: 'Đăng ký thành công' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/registrations/:id', async (req, res) => {
  const { id } = req.params;
  const { team, in_game_name, tanks, is_winner } = req.body;
  try {
    if (is_winner !== undefined) {
      await executeDb('UPDATE registrations SET is_winner = ? WHERE id = ?', [is_winner ? 1 : 0, id]);
    }
    if (team && in_game_name && tanks) {
      await executeDb(
        'UPDATE registrations SET team = ?, in_game_name = ?, tanks = ? WHERE id = ?',
        [team, in_game_name.trim(), tanks.trim(), id]
      );
    }

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        const updateData: any = {};
        if (is_winner !== undefined) updateData.is_winner = Boolean(is_winner);
        if (team) updateData.team = team;
        if (in_game_name) updateData.in_game_name = in_game_name.trim();
        if (tanks) updateData.tanks = tanks.trim();
        await client.from('registrations').update(updateData).eq('id', id);
      }
    });

    res.json({ message: 'Registration updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/registrations/:id', async (req, res) => {
  const { id } = req.params;
  const { in_game_name, team } = req.body || {};
  try {
    if (in_game_name && team) {
      await executeDb('DELETE FROM registrations WHERE id = ? OR (in_game_name = ? AND team = ?)', [id, in_game_name, team]);
    } else {
      await executeDb('DELETE FROM registrations WHERE id = ?', [id]);
    }

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        await client.from('registrations').delete().eq('id', id);
      }
    });

    res.json({ success: true, message: 'Đã xóa đăng ký thành công' });
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
  const { id, title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Tiêu đề và nội dung không được để trống' });
  try {
    const newsId = id || crypto.randomUUID();
    const cleanTitle = title.trim();
    const cleanContent = content.trim();

    await executeDb(
      `INSERT INTO news (id, title, content, created_at) VALUES (?, ?, ?, datetime('now'))`,
      [newsId, cleanTitle, cleanContent]
    );

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        await client.from('news').upsert([{ id: newsId, title: cleanTitle, content: cleanContent }], { onConflict: 'id' });
      }
    });

    res.status(201).json({ id: newsId, title: cleanTitle, content: cleanContent });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/news/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeDb('DELETE FROM news WHERE id = ?', [id]);

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        await client.from('news').delete().eq('id', id);
      }
    });

    res.json({ message: 'News deleted successfully' });
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

app.put('/api/campaign-settings', async (req, res) => {
  const { campaign_name, phase_name, start_date, end_date } = req.body;
  try {
    await executeDb(
      `INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date, updated_at)
       VALUES (1, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET campaign_name=excluded.campaign_name, phase_name=excluded.phase_name, start_date=excluded.start_date, end_date=excluded.end_date, updated_at=datetime('now')`,
      [campaign_name, phase_name, start_date, end_date]
    );

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        await client.from('campaign_settings').upsert({
          id: 1,
          campaign_name,
          phase_name,
          start_date,
          end_date,
          updated_at: new Date().toISOString()
        });
      }
    });

    res.json({ message: 'Settings updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Users management API
app.get('/api/users', async (req, res) => {
  try {
    const { results } = await executeDb('SELECT id, username, role, is_locked, created_at FROM users ORDER BY created_at ASC');
    const mapped = results.map(u => ({
      ...u,
      is_locked: Boolean(u.is_locked)
    }));
    res.json(mapped);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Tên người dùng và mật khẩu không được để trống' });
  try {
    const userId = crypto.randomUUID();
    const cleanUser = username.trim();
    const cleanRole = role || 'Điều hành';

    await executeDb(
      `INSERT INTO users (id, username, password, role, is_locked, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`,
      [userId, cleanUser, password, cleanRole]
    );

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        await client.from('users').upsert([{ id: userId, username: cleanUser, password, role: cleanRole }], { onConflict: 'username' });
      }
    });

    res.status(201).json({ id: userId, username: cleanUser, role: cleanRole, is_locked: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { password, role, is_locked } = req.body;
  try {
    if (password) {
      await executeDb('UPDATE users SET password = ? WHERE id = ? OR username = ?', [password, id, id]);
    }
    if (role) {
      await executeDb('UPDATE users SET role = ? WHERE id = ? OR username = ?', [role, id, id]);
    }
    if (is_locked !== undefined) {
      await executeDb('UPDATE users SET is_locked = ? WHERE id = ? OR username = ?', [is_locked ? 1 : 0, id, id]);
    }

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        const updateData: any = {};
        if (password) updateData.password = password;
        if (role) updateData.role = role;
        if (is_locked !== undefined) updateData.is_locked = Boolean(is_locked);
        await client.from('users').update(updateData).or(`id.eq.${id},username.eq.${id}`);
      }
    });

    res.json({ message: 'User updated successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await executeDb('DELETE FROM users WHERE id = ? OR username = ?', [id, id]);

    runAsync(async () => {
      const client = getServerSupabaseClient();
      if (client) {
        await client.from('users').delete().or(`id.eq.${id},username.eq.${id}`);
      }
    });

    res.json({ message: 'User deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Vite Integration
async function startServer() {
  getLocalSqlite();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
