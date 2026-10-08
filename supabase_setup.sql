-- ==============================================================
-- BẢNG DỮ LIỆU ĐẦY ĐỦ CHO HỆ THỐNG CAMPAIGN 2026 (SUPABASE POSTGRESQL)
-- Chạy đoạn mã này trong: Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================

-- 1. BẢNG USERS (Tài khoản Quản trị & Điều hành)
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'Quản trị',
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bổ sung cột is_locked nếu bảng đã tạo trước đó
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

-- Thêm tài khoản quản trị mặc định nếu chưa tồn tại
INSERT INTO users (username, password, role) VALUES 
('admin', 'Sonla@2026', 'Quản trị'),
('operator', 'operator123', 'Điều hành')
ON CONFLICT (username) DO NOTHING;

-- 2. BẢNG TEAMS (Danh sách các đội được tạo và quản lý)
CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bổ sung cột is_locked nếu bảng đã tạo trước đó
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

-- Thêm các team mặc định ban đầu
INSERT INTO teams (name) VALUES 
('Team 1: Leader Cá Kiếm'), 
('Team 2: Leader Minato'), 
('Team 3: Đấu giá'), 
('Team 4: Vá lốp')
ON CONFLICT (name) DO NOTHING;

-- 3. BẢNG REGISTRATIONS (Danh sách thành viên đăng ký theo team)
CREATE TABLE IF NOT EXISTS registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team TEXT NOT NULL,
  in_game_name TEXT NOT NULL,
  tanks TEXT NOT NULL,
  is_winner BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Bổ sung cột is_winner nếu bảng đã tạo trước đó
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT FALSE;

-- 4. BẢNG NEWS (Tin tức & Thông báo chiến dịch)
CREATE TABLE IF NOT EXISTS news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Thêm tin tức khởi động
INSERT INTO news (title, content) VALUES
('Thông báo: Khởi động sự kiện Campaign 2026', 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Các đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.'),
('Quy định đăng ký & Chốt danh sách', 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.')
ON CONFLICT DO NOTHING;

-- 5. BẢNG CAMPAIGN_SETTINGS (Cấu hình thời gian & thông tin chiến dịch)
CREATE TABLE IF NOT EXISTS campaign_settings (
  id INT PRIMARY KEY DEFAULT 1,
  campaign_name TEXT NOT NULL DEFAULT 'Campaign 2026',
  phase_name TEXT NOT NULL DEFAULT 'Spring Maneuvers',
  start_date TEXT NOT NULL DEFAULT '23/03/2026',
  end_date TEXT NOT NULL DEFAULT '06/04/2026',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

INSERT INTO campaign_settings (id, campaign_name, phase_name, start_date, end_date)
VALUES (1, 'Campaign 2026', 'Spring Maneuvers', '23/03/2026', '06/04/2026')
ON CONFLICT (id) DO NOTHING;

-- 6. TẮT ROW LEVEL SECURITY (RLS) để Anon Key có thể truy vấn và thao tác
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE registrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE news DISABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_settings DISABLE ROW LEVEL SECURITY;

-- 7. CẤP QUYỀN ĐẦY ĐỦ CHO ROLE ANON VÀ AUTHENTICATED
GRANT ALL ON TABLE users TO anon, authenticated;
GRANT ALL ON TABLE teams TO anon, authenticated;
GRANT ALL ON TABLE registrations TO anon, authenticated;
GRANT ALL ON TABLE news TO anon, authenticated;
GRANT ALL ON TABLE campaign_settings TO anon, authenticated;
