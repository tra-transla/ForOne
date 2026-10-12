export const CLOUDFLARE_WORKER_CODE = `/**
 * Cloudflare Worker for Campaign 2026
 * Tên Worker: for1 (hoặc bất kỳ tên nào trên *.workers.dev)
 * 
 * Hướng dẫn cài đặt trên Cloudflare Dashboard:
 * 1. Vào https://dash.cloudflare.com -> Workers & Pages -> Chọn Worker 'for1'
 * 2. Vào Settings -> Variables -> D1 Database Bindings -> Add binding:
 *    - Variable name: DB
 *    - D1 database: Chọn database D1 SQLite của bạn (ví dụ: campaign-db)
 * 3. Bấm "Edit code" (hoặc Quick Edit), dán toàn bộ mã nguồn này vào -> Bấm "Save and deploy"
 * 4. Truy cập https://for1.sonlahome.workers.dev để thấy kết quả và API hoạt động!
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders
        }
      });
    };

    const db = env.DB;
    if (!db && path.startsWith('/api/')) {
      return jsonResponse({
        error: "Chưa gắn D1 Database Binding 'DB'. Vào Settings -> Variables -> D1 Database Bindings gắn tên biến là DB."
      }, 500);
    }

    try {
      // 1. Diagnostics
      if (path === '/api/db/status' && method === 'GET') {
        let stats = { teams: 0, registrations: 0, news: 0, users: 0 };
        if (db) {
          try {
            const t = await db.prepare("SELECT COUNT(*) as c FROM teams").first();
            const r = await db.prepare("SELECT COUNT(*) as c FROM registrations").first();
            const n = await db.prepare("SELECT COUNT(*) as c FROM news").first();
            const u = await db.prepare("SELECT COUNT(*) as c FROM users").first();
            stats = { teams: t?.c || 0, registrations: r?.c || 0, news: n?.c || 0, users: u?.c || 0 };
          } catch {}
        }
        return jsonResponse({
          engine: 'Cloudflare D1 (Worker Binding)',
          mode: 'cloudflare_d1',
          isCloudflareConfigured: true,
          d1Connected: Boolean(db),
          stats
        });
      }

      // 2. Init Schema
      if ((path === '/api/db/init-tables' || path === '/init') && (method === 'POST' || method === 'GET')) {
        if (!db) return jsonResponse({ error: "Thiếu binding DB" }, 500);
        await db.batch([
          db.prepare(\`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Quản trị', is_locked INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
          )\`),
          db.prepare(\`INSERT OR IGNORE INTO users (id, username, password, role, is_locked) VALUES 
            ('251d0986-02e4-45c0-a89c-c832abb7778f', 'admin', 'Sonla@2026', 'Quản trị', 0),
            ('fa818b2c-8bc0-4e4b-97e3-0599a0937402', 'admin1', 'Sonla', 'Quản trị', 0),
            ('bb913b82-6284-4720-bf49-cb7b6d19b48f', 'operator', 'operator123', 'Điều hành', 0)\`),
          db.prepare(\`CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_locked INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
          )\`),
          db.prepare(\`INSERT OR IGNORE INTO teams (id, name, is_locked, created_at) VALUES 
            ('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', 0, '2026-03-20T00:00:00Z'), 
            ('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', 0, '2026-03-20T00:01:00Z'), 
            ('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', 0, '2026-03-20T00:02:00Z'), 
            ('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', 0, '2026-03-20T00:03:00Z')\`),
          db.prepare(\`CREATE TABLE IF NOT EXISTS registrations (
            id TEXT PRIMARY KEY, team TEXT NOT NULL, in_game_name TEXT NOT NULL, tanks TEXT NOT NULL,
            is_winner INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
          )\`),
          db.prepare(\`CREATE TABLE IF NOT EXISTS news (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
          )\`),
          db.prepare(\`INSERT OR IGNORE INTO news (id, title, content, created_at) VALUES
            ('52d95507-e7a3-4f92-8721-70107c643e18', 'Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026.', '2026-03-20T08:00:00Z'),
            ('c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c', 'Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng.', '2026-03-21T09:30:00Z')\`),
          db.prepare(\`CREATE TABLE IF NOT EXISTS campaign_settings (
            id INTEGER PRIMARY KEY, campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
            phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers', start_date TEXT NOT NULL DEFAULT '23/03/2026',
            end_date TEXT NOT NULL DEFAULT '06/04/2026', updated_at TEXT DEFAULT (datetime('now'))
          )\`),
          db.prepare(\`INSERT OR IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
            VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026')\`)
        ]);
        return jsonResponse({ success: true, message: "Đã khởi tạo đủ bảng trên D1 thành công!" });
      }

      // 3. Teams API
      if (path === '/api/teams') {
        if (method === 'GET') {
          const { results } = await db.prepare("SELECT * FROM teams ORDER BY created_at ASC").all();
          return jsonResponse((results || []).map(t => ({ ...t, is_locked: Boolean(t.is_locked) })));
        }
        if (method === 'POST') {
          const body = await request.json();
          const id = body.id || crypto.randomUUID();
          await db.prepare("INSERT INTO teams (id, name, is_locked, created_at) VALUES (?, ?, ?, datetime('now'))")
            .bind(id, body.name.trim(), body.is_locked ? 1 : 0).run();
          return jsonResponse({ id, name: body.name.trim(), is_locked: Boolean(body.is_locked) }, 201);
        }
      }

      if (path.startsWith('/api/teams/')) {
        const id = path.replace('/api/teams/', '');
        if (method === 'PUT') {
          const body = await request.json();
          if (body.name !== undefined && body.is_locked !== undefined) {
            await db.prepare("UPDATE teams SET name = ?, is_locked = ? WHERE id = ?")
              .bind(body.name.trim(), body.is_locked ? 1 : 0, id).run();
          } else if (body.name !== undefined) {
            await db.prepare("UPDATE teams SET name = ? WHERE id = ?").bind(body.name.trim(), id).run();
          } else if (body.is_locked !== undefined) {
            await db.prepare("UPDATE teams SET is_locked = ? WHERE id = ?").bind(body.is_locked ? 1 : 0, id).run();
          }
          return jsonResponse({ success: true });
        }
        if (method === 'DELETE') {
          await db.prepare("DELETE FROM teams WHERE id = ?").bind(id).run();
          return jsonResponse({ success: true });
        }
      }

      // 4. Registrations API
      if (path === '/api/registrations') {
        if (method === 'GET') {
          const { results } = await db.prepare("SELECT * FROM registrations ORDER BY created_at DESC").all();
          return jsonResponse((results || []).map(r => ({ ...r, is_winner: Boolean(r.is_winner) })));
        }
      }

      if (path === '/api/register' && method === 'POST') {
        const body = await request.json();
        const id = body.id || crypto.randomUUID();
        await db.prepare("INSERT INTO registrations (id, team, in_game_name, tanks, is_winner, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))")
          .bind(id, body.team.trim(), (body.inGameName || body.in_game_name).trim(), body.tanks.trim()).run();
        return jsonResponse({ id, message: "Đăng ký thành công" }, 201);
      }

      if (path.startsWith('/api/registrations/')) {
        const id = path.replace('/api/registrations/', '');
        if (method === 'PUT') {
          const body = await request.json();
          if (body.is_winner !== undefined) {
            await db.prepare("UPDATE registrations SET is_winner = ? WHERE id = ?").bind(body.is_winner ? 1 : 0, id).run();
          } else {
            await db.prepare("UPDATE registrations SET team = ?, in_game_name = ?, tanks = ? WHERE id = ?")
              .bind(body.team, body.in_game_name, body.tanks, id).run();
          }
          return jsonResponse({ success: true });
        }
        if (method === 'DELETE') {
          await db.prepare("DELETE FROM registrations WHERE id = ?").bind(id).run();
          return jsonResponse({ success: true });
        }
      }

      // 5. News API
      if (path === '/api/news') {
        if (method === 'GET') {
          const { results } = await db.prepare("SELECT * FROM news ORDER BY created_at DESC").all();
          return jsonResponse(results || []);
        }
        if (method === 'POST') {
          const body = await request.json();
          const id = body.id || crypto.randomUUID();
          await db.prepare("INSERT INTO news (id, title, content, created_at) VALUES (?, ?, ?, datetime('now'))")
            .bind(id, body.title.trim(), body.content.trim()).run();
          return jsonResponse({ id, title: body.title, content: body.content }, 201);
        }
      }

      // 6. Campaign Settings API
      if (path === '/api/campaign-settings') {
        if (method === 'GET') {
          const res = await db.prepare("SELECT * FROM campaign_settings WHERE id = 1 LIMIT 1").first();
          return jsonResponse(res || {
            campaign_name: 'Campaign 2026', phase_name: 'Spring Maneuvers', start_date: '23/03/2026', end_date: '06/04/2026'
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          await db.prepare(\`INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date, updated_at)
            VALUES (1, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET campaign_name=excluded.campaign_name, phase_name=excluded.phase_name, start_date=excluded.start_date, end_date=excluded.end_date\`)
            .bind(body.campaign_name, body.phase_name, body.start_date, body.end_date).run();
          return jsonResponse({ success: true });
        }
      }

      // 7. Users / Login API
      if (path === '/api/login' && method === 'POST') {
        const body = await request.json();
        const username = (body.username || '').trim();
        const user = await db.prepare("SELECT * FROM users WHERE username = ? LIMIT 1").bind(username).first();
        if (!user || user.password !== body.password) {
          return jsonResponse({ error: "Tên đăng nhập hoặc mật khẩu không đúng" }, 401);
        }
        return jsonResponse({
          message: "Logged in successfully",
          token: "cf-token-" + Date.now(),
          user: { id: user.id, username: user.username, role: user.role }
        });
      }

      if (path === '/api/users' && method === 'GET') {
        const { results } = await db.prepare("SELECT id, username, role, is_locked, created_at FROM users ORDER BY created_at ASC").all();
        return jsonResponse(results || []);
      }

      // 8. Default Root View
      return new Response(\`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Campaign 2026 - Cloudflare D1</title></head>
<body style="font-family:sans-serif;background:#09090b;color:#f4f4f5;padding:30px;text-align:center;">
  <h1 style="color:#f59e0b;">🛡️ Cloudflare D1 API Service</h1>
  <p>Worker \${url.hostname} đang chạy thành công và sẵn sàng kết nối D1 Database.</p>
  <div style="margin:20px 0;">
    <a href="/api/teams" style="color:#f59e0b;padding:8px 16px;background:#27272a;border-radius:8px;text-decoration:none;margin-right:10px;">Xem Teams API</a>
    <a href="/init" style="color:#fff;padding:8px 16px;background:#d97706;border-radius:8px;text-decoration:none;">Khởi tạo bảng D1</a>
  </div>
</body>
</html>\`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (err) {
      return jsonResponse({ error: err.message || "Lỗi Worker D1" }, 500);
    }
  }
};`;
