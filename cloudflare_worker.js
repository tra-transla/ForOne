/**
 * Cloudflare Worker for Campaign 2026
 * Tên Worker: for1 (hoặc bất kỳ tên nào trên *.workers.dev)
 * 
 * Hướng dẫn cài đặt trên Cloudflare Dashboard:
 * 1. Vào https://dash.cloudflare.com -> Workers & Pages -> Chọn Worker 'for1' (hoặc Create Application -> Create Worker)
 * 2. Vào Settings -> Variables -> D1 Database Bindings -> Add binding:
 *    - Variable name: DB
 *    - D1 database: Chọn database D1 SQLite của bạn (ví dụ: e029db72...)
 * 3. Bấm "Edit code" (hoặc Quick Edit), dán toàn bộ mã nguồn file này vào -> Bấm "Save and deploy"
 * 4. Truy cập https://for1.sonlahome.workers.dev để thấy kết quả và các API hoạt động ngay lập tức!
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

    // Helper JSON response
    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          ...corsHeaders
        }
      });
    };

    // Helper: kiểm tra binding DB
    const db = env.DB;
    if (!db && path.startsWith('/api/')) {
      return jsonResponse({
        error: "Chưa gắn D1 Database Binding 'DB'. Vui lòng vào Worker -> Settings -> Variables -> D1 Database Bindings -> gắn tên là 'DB'."
      }, 500);
    }

    try {
      // 1. Status & Diagnostics Endpoint
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

      // 2. 1-Click Init Schema
      if ((path === '/api/db/init-tables' || path === '/init') && (method === 'POST' || method === 'GET')) {
        if (!db) return jsonResponse({ error: "Thiếu binding 'DB'" }, 500);

        await db.batch([
          db.prepare(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'Quản trị', is_locked INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
          )`),
          db.prepare(`INSERT OR IGNORE INTO users (id, username, password, role, is_locked) VALUES 
            ('251d0986-02e4-45c0-a89c-c832abb7778f', 'admin', 'Sonla@2026', 'Quản trị', 0),
            ('fa818b2c-8bc0-4e4b-97e3-0599a0937402', 'admin1', 'Sonla', 'Quản trị', 0),
            ('bb913b82-6284-4720-bf49-cb7b6d19b48f', 'operator', 'operator123', 'Điều hành', 0)`),
          db.prepare(`CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, is_locked INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
          )`),
          db.prepare(`INSERT OR IGNORE INTO teams (id, name, is_locked, created_at) VALUES 
            ('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', 0, '2026-03-20T00:00:00Z'), 
            ('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', 0, '2026-03-20T00:01:00Z'), 
            ('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', 0, '2026-03-20T00:02:00Z'), 
            ('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', 0, '2026-03-20T00:03:00Z')`),
          db.prepare(`CREATE TABLE IF NOT EXISTS registrations (
            id TEXT PRIMARY KEY, team TEXT NOT NULL, in_game_name TEXT NOT NULL, tanks TEXT NOT NULL,
            is_winner INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
          )`),
          db.prepare(`CREATE TABLE IF NOT EXISTS news (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
          )`),
          db.prepare(`INSERT OR IGNORE INTO news (id, title, content, created_at) VALUES
            ('52d95507-e7a3-4f92-8721-70107c643e18', 'Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026.', '2026-03-20T08:00:00Z'),
            ('c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c', 'Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng.', '2026-03-21T09:30:00Z')`),
          db.prepare(`CREATE TABLE IF NOT EXISTS campaign_settings (
            id INTEGER PRIMARY KEY, campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
            phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers', start_date TEXT NOT NULL DEFAULT '23/03/2026',
            end_date TEXT NOT NULL DEFAULT '06/04/2026', updated_at TEXT DEFAULT (datetime('now'))
          )`),
          db.prepare(`INSERT OR IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
            VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026')`)
        ]);

        return jsonResponse({ success: true, message: "Đã khởi tạo đủ 5 bảng trên Cloudflare D1 thành công!" });
      }

      // 3. Teams API
      if (path === '/api/teams') {
        if (method === 'GET') {
          const { results } = await db.prepare("SELECT * FROM teams ORDER BY created_at ASC").all();
          const mapped = (results || []).map(t => ({ ...t, is_locked: Boolean(t.is_locked) }));
          return jsonResponse(mapped);
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
          const mapped = (results || []).map(r => ({ ...r, is_winner: Boolean(r.is_winner) }));
          return jsonResponse(mapped);
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
            campaign_name: 'Campaign 2026',
            phase_name: 'Spring Maneuvers',
            start_date: '23/03/2026',
            end_date: '06/04/2026'
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          await db.prepare(`INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date, updated_at)
            VALUES (1, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET campaign_name=excluded.campaign_name, phase_name=excluded.phase_name, start_date=excluded.start_date, end_date=excluded.end_date`)
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

      // 8. Default Root HTML UI (Khi người dùng mở trực tiếp for1.sonlahome.workers.dev trên trình duyệt)
      let statsHtml = '';
      if (db) {
        try {
          const t = await db.prepare("SELECT COUNT(*) as c FROM teams").first();
          const r = await db.prepare("SELECT COUNT(*) as c FROM registrations").first();
          statsHtml = `<div style="margin-top: 15px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #166534;">
            ✅ <strong>Kết nối Cloudflare D1 thành công!</strong><br>
            Hiện có: <strong>${t?.c || 0} Đội</strong> • <strong>${r?.c || 0} Lượt đăng ký</strong>
          </div>`;
        } catch (e) {
          statsHtml = `<div style="margin-top: 15px; padding: 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; color: #991b1b;">
            ⚠️ Bảng D1 chưa khởi tạo. <a href="/init" style="color: #2563eb; font-weight: bold;">Bấm vào đây để Khởi tạo bảng ngay</a>.
          </div>`;
        }
      } else {
        statsHtml = `<div style="margin-top: 15px; padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; color: #92400e;">
          ℹ️ Vui lòng vào Cloudflare Dashboard gắn D1 Database Binding với biến tên là <code>DB</code>.
        </div>`;
      }

      const html = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Campaign 2026 - Cloudflare D1 Worker API</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #09090b; color: #f4f4f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 16px; padding: 32px; max-width: 580px; width: 100%; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    h1 { color: #f59e0b; margin: 0 0 8px 0; font-size: 24px; display: flex; align-items: center; gap: 10px; }
    p { color: #a1a1aa; font-size: 14px; line-height: 1.6; margin: 8px 0; }
    .badge { background: #f59e0b20; color: #fbbf24; border: 1px solid #f59e0b40; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .btn { display: inline-block; background: #f59e0b; color: #09090b; padding: 10px 18px; border-radius: 10px; font-weight: 700; text-decoration: none; font-size: 14px; margin-top: 16px; transition: background 0.2s; }
    .btn:hover { background: #d97706; }
    .btn-secondary { background: #27272a; color: #fafafa; border: 1px solid #3f3f46; margin-left: 8px; }
    .btn-secondary:hover { background: #3f3f46; }
    .endpoints { margin-top: 20px; font-size: 13px; background: #09090b; padding: 14px; border-radius: 8px; border: 1px solid #27272a; font-family: monospace; color: #e4e4e7; }
    .endpoint-item { margin: 4px 0; }
    .method { color: #34d399; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h1>🛡️ Cloudflare D1 Backend</h1>
      <span class="badge">SQLite Serverless</span>
    </div>
    <p>Worker <code>for1.sonlahome.workers.dev</code> đang chạy máy chủ REST API và kết nối trực tiếp với <strong>Cloudflare D1 SQLite Database</strong>.</p>
    ${statsHtml}
    <div style="margin-top: 20px;">
      <a href="/api/teams" class="btn">Xem danh sách Team (JSON)</a>
      <a href="/init" class="btn btn-secondary">Khởi tạo Database</a>
    </div>
    <div class="endpoints">
      <div style="font-weight: bold; color: #94a3b8; margin-bottom: 8px;">CÁC ENDPOINT ĐÃ SẴN SÀNG:</div>
      <div class="endpoint-item"><span class="method">GET</span> /api/teams - Danh sách các đội</div>
      <div class="endpoint-item"><span class="method">GET</span> /api/registrations - Danh sách đăng ký</div>
      <div class="endpoint-item"><span class="method">GET</span> /api/news - Tin tức sự kiện</div>
      <div class="endpoint-item"><span class="method">GET</span> /api/campaign-settings - Thời gian chiến dịch</div>
      <div class="endpoint-item"><span class="method">GET</span> /api/db/status - Trạng thái D1</div>
    </div>
  </div>
</body>
</html>`;

      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } catch (err) {
      return jsonResponse({ error: err.message || "Lỗi xử lý Worker D1" }, 500);
    }
  }
};
