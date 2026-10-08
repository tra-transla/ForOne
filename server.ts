import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

app.use(express.json());
app.use(cookieParser());
app.use(cors());

// Lazy initialize Supabase
let supabaseClient: any = null;
function getSupabase() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required. Vui lòng cấu hình trong phần Secrets.');
    }
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

// Middleware to verify JWT
const authenticateToken = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Forbidden' });
    req.user = user;
    next();
  });
};

// API Routes

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const supabase = getSupabase();
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie('token', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    res.json({ message: 'Logged in successfully', role: user.role });
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

// Submit registration
app.post('/api/register', async (req, res) => {
  const { team, inGameName, tanks } = req.body;
  
  if (!team || !inGameName || !tanks) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('registrations')
      .insert([{ team, in_game_name: inGameName, tanks }]);

    if (error) throw error;
    res.status(201).json({ message: 'Registration successful' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to register' });
  }
});

// Get all registrations (Admin/Operator only)
app.get('/api/registrations', authenticateToken, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch registrations' });
  }
});

// Update registration (Admin/Operator only)
app.put('/api/registrations/:id', authenticateToken, async (req: any, res) => {
  const { id } = req.params;
  const { team, inGameName, tanks } = req.body;
  
  if (!team || !inGameName || !tanks) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('registrations')
      .update({ team, in_game_name: inGameName, tanks })
      .eq('id', id);
    
    if (error) throw error;
    res.json({ message: 'Registration updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update registration' });
  }
});

// Delete registration (Admin only)
app.delete('/api/registrations/:id', authenticateToken, async (req: any, res) => {
  if (req.user.role !== 'Quản trị') {
    return res.status(403).json({ error: 'Only Admin can delete registrations' });
  }

  const { id } = req.params;
  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('registrations')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    res.json({ message: 'Registration deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to delete registration' });
  }
});

// Vite middleware for development
async function startServer() {
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
