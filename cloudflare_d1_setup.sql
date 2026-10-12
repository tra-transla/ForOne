-- ==============================================================
-- BẢNG DỮ LIỆU ĐẦY ĐỦ CHO CLOUDFLARE D1 (SQLITE) & LOCAL SQLITE
-- Campaign 2026 Registration System
-- 
-- Cách sử dụng với Cloudflare D1:
-- 1. Chạy trên Cloudflare Dashboard -> Workers & Pages -> D1 SQL Console
-- 2. Hoặc chạy qua Wrangler CLI:
--    npx wrangler d1 execute <DATABASE_NAME> --file=./cloudflare_d1_setup.sql
-- 3. Hoặc nhấn nút "Khởi tạo bảng 1-Click" trực tiếp trên giao diện Admin!
-- ==============================================================

-- 1. BẢNG USERS (Tài khoản Quản trị & Điều hành)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Quản trị',
  is_locked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO users (id, username, password, role, is_locked) VALUES 
('251d0986-02e4-45c0-a89c-c832abb7778f', 'admin', 'Sonla@2026', 'Quản trị', 0),
('fa818b2c-8bc0-4e4b-97e3-0599a0937402', 'admin1', 'Sonla', 'Quản trị', 0),
('bb913b82-6284-4720-bf49-cb7b6d19b48f', 'operator', 'operator123', 'Điều hành', 0);

-- Cập nhật mật khẩu nếu tài khoản đã tồn tại
UPDATE users SET password = 'Sonla@2026' WHERE username = 'admin';
UPDATE users SET password = 'Sonla' WHERE username = 'admin1';
UPDATE users SET password = 'operator123' WHERE username = 'operator';

-- 2. BẢNG TEAMS (Danh sách các đội được tạo và quản lý)
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_locked INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO teams (id, name, is_locked, created_at) VALUES 
('7b0f405f-acf3-4d11-b644-04ddd6bd2811', 'Team 1: Leader Cá Kiếm', 0, '2026-03-20T00:00:00Z'), 
('0605a224-e5a8-49f1-a8fb-fc34016dc359', 'Team 2: Leader Minato', 0, '2026-03-20T00:01:00Z'), 
('5d81c808-7438-4a3e-b814-280ee3c4c2ad', 'Team 3: Đấu giá', 0, '2026-03-20T00:02:00Z'), 
('bd4bb1cd-1418-4927-a034-e7f5e17da04a', 'Team 4: Vá lốp', 0, '2026-03-20T00:03:00Z');

-- 3. BẢNG REGISTRATIONS (Danh sách thành viên đăng ký)
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  in_game_name TEXT NOT NULL,
  tanks TEXT NOT NULL,
  is_winner INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 4. BẢNG NEWS (Tin tức & Thông báo)
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO news (id, title, content, created_at) VALUES
('52d95507-e7a3-4f92-8721-70107c643e18', 'Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Các đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.', '2026-03-20T08:00:00Z'),
('c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c', 'Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.', '2026-03-21T09:30:00Z');

-- 5. BẢNG CAMPAIGN_SETTINGS (Cấu hình chiến dịch)
CREATE TABLE IF NOT EXISTS campaign_settings (
  id INTEGER PRIMARY KEY,
  campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
  phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers',
  start_date TEXT NOT NULL DEFAULT '23/03/2026',
  end_date TEXT NOT NULL DEFAULT '06/04/2026',
  updated_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026');
