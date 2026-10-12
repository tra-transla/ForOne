import { supabase, syncAllDataToSupabase } from './supabase';

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

export interface TeamItem {
  id: string;
  name: string;
  is_locked?: boolean;
  created_at?: string;
}

export interface RegistrationItem {
  id: string | number;
  team: string;
  in_game_name: string;
  tanks: string;
  created_at: string;
  is_winner?: boolean;
}

export interface UserItem {
  id: string | number;
  username: string;
  password?: string;
  role: string;
  is_locked?: boolean;
}

const LOCAL_TEAMS_KEY = 'app_teams_list';
const LOCAL_LOCKED_TEAMS_KEY = 'app_locked_teams_list';
const LOCAL_REGISTRATIONS_KEY = 'app_registrations_list';
const LOCAL_WINNERS_KEY = 'app_winner_reg_ids_list';
const LOCAL_NEWS_KEY = 'app_news_articles_list';
const LOCAL_USERS_KEY = 'app_users_list';

export function isValidUuid(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

export function generateClientUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Default teams matching the seed data
export const DEFAULT_TEAMS: TeamItem[] = [
  { id: '7b0f405f-acf3-4d11-b644-04ddd6bd2811', name: 'Team 1: Leader Cá Kiếm', is_locked: false, created_at: '2026-03-20T00:00:00Z' },
  { id: '0605a224-e5a8-49f1-a8fb-fc34016dc359', name: 'Team 2: Leader Minato', is_locked: false, created_at: '2026-03-20T00:01:00Z' },
  { id: '5d81c808-7438-4a3e-b814-280ee3c4c2ad', name: 'Team 3: Đấu giá', is_locked: false, created_at: '2026-03-20T00:02:00Z' },
  { id: 'bd4bb1cd-1418-4927-a034-e7f5e17da04a', name: 'Team 4: Vá lốp', is_locked: false, created_at: '2026-03-20T00:03:00Z' }
];

export const DEFAULT_NEWS: NewsItem[] = [
  {
    id: '52d95507-e7a3-4f92-8721-70107c643e18',
    title: 'Thông báo: Khởi động sự kiện Campaign 2026',
    content: 'Chào mừng chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.',
    created_at: '2026-03-20T08:00:00Z'
  },
  {
    id: 'c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c',
    title: 'Quy định đăng ký & Chốt danh sách',
    content: 'Mỗi chiến binh đăng ký với tên In-Game chính xác và xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.',
    created_at: '2026-03-21T09:30:00Z'
  }
];

export const DEFAULT_USERS: UserItem[] = [
  {
    id: '251d0986-02e4-45c0-a89c-c832abb7778f',
    username: 'admin',
    password: 'Sonla@2026',
    role: 'Quản trị',
    is_locked: false
  },
  {
    id: 'fa818b2c-8bc0-4e4b-97e3-0599a0937402',
    username: 'admin1',
    password: 'Sonla',
    role: 'Quản trị',
    is_locked: false
  },
  {
    id: 'bb913b82-6284-4720-bf49-cb7b6d19b48f',
    username: 'operator',
    password: 'operator123',
    role: 'Điều hành',
    is_locked: false
  }
];

// ==========================================
// TEAMS HELPERS
// ==========================================

export function getLocalTeams(): TeamItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_TEAMS_KEY);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_TEAMS;
}

export function saveLocalTeams(teams: TeamItem[]) {
  try {
    localStorage.setItem(LOCAL_TEAMS_KEY, JSON.stringify(teams));
  } catch {}
}

export function getLocalLockedTeams(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_LOCKED_TEAMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalLockedTeams(teams: string[]) {
  try {
    localStorage.setItem(LOCAL_LOCKED_TEAMS_KEY, JSON.stringify(teams));
  } catch {}
}

export async function fetchTeamsSafe(): Promise<{ data: TeamItem[]; isLockedColumnSupported: boolean }> {
  // 1. Primary: Supabase Cloud Database
  try {
    const { data, error } = await supabase.from('teams').select('*').order('created_at', { ascending: true });
    if (!error && Array.isArray(data) && data.length > 0) {
      const mapped = data.map(t => ({
        id: t.id,
        name: t.name,
        is_locked: Boolean(t.is_locked),
        created_at: t.created_at
      }));
      saveLocalTeams(mapped);
      return { data: mapped, isLockedColumnSupported: true };
    }
  } catch (err) {
    console.warn('Supabase fetchTeams error, using local fallback:', err);
  }

  // 2. Secondary: Local Server SQLite API
  try {
    const res = await fetch('/api/teams');
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw)) {
        const data = raw.map(t => ({
          ...t,
          is_locked: Boolean(t.is_locked)
        }));
        saveLocalTeams(data);
        return { data, isLockedColumnSupported: true };
      }
    }
  } catch (err) {
    console.warn('fetchTeamsSafe API error, using local storage:', err);
  }

  // 3. Fallback: LocalStorage
  const localTeams = getLocalTeams();
  const localLocked = getLocalLockedTeams();
  return {
    data: localTeams.map(t => ({
      ...t,
      is_locked: t.is_locked !== undefined ? Boolean(t.is_locked) : localLocked.includes(t.name)
    })),
    isLockedColumnSupported: true
  };
}

export async function addTeamSafe(name: string): Promise<{ team: TeamItem; error?: string }> {
  const trimmed = name.trim();
  const currentTeams = getLocalTeams();
  const teamId = generateClientUuid();
  const newTeam: TeamItem = {
    id: teamId,
    name: trimmed,
    is_locked: false,
    created_at: new Date().toISOString()
  };

  // 1. Write to Supabase Cloud Database
  try {
    await supabase.from('teams').insert([{ id: teamId, name: trimmed, is_locked: false }]);
  } catch (err) {
    console.warn('Supabase addTeam error:', err);
  }

  // 2. Write to Local Server SQLite backup
  try {
    const res = await fetch('/api/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: teamId, name: trimmed, is_locked: false })
    });
    if (res.ok) {
      const data = await res.json();
      newTeam.id = data.id || teamId;
    }
  } catch (err: any) {
    console.warn('Add team API error:', err);
  }

  // 3. Update LocalStorage cache
  const updated = [...currentTeams.filter(t => t.name !== trimmed), newTeam];
  saveLocalTeams(updated);
  window.dispatchEvent(new CustomEvent('teams_updated'));
  return { team: newTeam };
}

export async function updateTeamSafe(idOrName: string, oldName: string, newName: string): Promise<{ success: boolean; error?: string }> {
  const trimmedNew = newName.trim();
  const currentTeams = getLocalTeams();
  const updatedTeams = currentTeams.map(t => {
    if (t.id === idOrName || t.name === oldName || t.name === idOrName) {
      return { ...t, name: trimmedNew };
    }
    return t;
  });
  saveLocalTeams(updatedTeams);

  const localRegs = getLocalRegistrations();
  const updatedRegs = localRegs.map(r => (r.team === oldName ? { ...r, team: trimmedNew } : r));
  saveLocalRegistrations(updatedRegs);

  // 1. Supabase Cloud Database
  try {
    if (isValidUuid(idOrName)) {
      await supabase.from('teams').update({ name: trimmedNew }).eq('id', idOrName);
    } else {
      await supabase.from('teams').update({ name: trimmedNew }).eq('name', oldName);
    }
    await supabase.from('registrations').update({ team: trimmedNew }).eq('team', oldName);
  } catch (err) {
    console.warn('Supabase updateTeam error:', err);
  }

  // 2. Local Server SQLite
  try {
    const encodedId = encodeURIComponent(idOrName);
    await fetch(`/api/teams/${encodedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmedNew })
    });
  } catch (err: any) {
    console.warn('updateTeam API error:', err);
  }

  window.dispatchEvent(new CustomEvent('teams_updated'));
  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { success: true };
}

export async function deleteTeamSafe(idOrName: string, teamName: string): Promise<{ success: boolean; error?: string }> {
  const currentTeams = getLocalTeams();
  const updatedTeams = currentTeams.filter(t => t.id !== idOrName && t.name !== teamName && t.name !== idOrName);
  saveLocalTeams(updatedTeams);

  // 1. Supabase Cloud Database
  try {
    if (isValidUuid(idOrName)) {
      await supabase.from('teams').delete().eq('id', idOrName);
    } else {
      await supabase.from('teams').delete().eq('name', teamName);
    }
  } catch (err) {
    console.warn('Supabase deleteTeam error:', err);
  }

  // 2. Local Server SQLite
  const encodedId = encodeURIComponent(idOrName);
  try {
    await fetch(`/api/teams/${encodedId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: teamName })
    });
  } catch (err: any) {
    console.warn('deleteTeam API error:', err);
  }

  window.dispatchEvent(new CustomEvent('teams_updated'));
  return { success: true };
}

export async function toggleTeamLockSafe(team: TeamItem): Promise<boolean> {
  const newLocked = !team.is_locked;
  const currentTeams = getLocalTeams();
  saveLocalTeams(currentTeams.map(t => ((t.name === team.name || t.id === team.id) ? { ...t, is_locked: newLocked } : t)));

  // 1. Supabase Cloud Database
  try {
    if (isValidUuid(team.id)) {
      await supabase.from('teams').update({ is_locked: newLocked }).eq('id', team.id);
    } else {
      await supabase.from('teams').update({ is_locked: newLocked }).eq('name', team.name);
    }
  } catch (err) {
    console.warn('Supabase toggleTeamLock error:', err);
  }

  // 2. Local Server SQLite
  try {
    await fetch(`/api/teams/${team.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_locked: newLocked })
    });
  } catch (err: any) {
    console.warn('toggleTeamLock API error:', err);
  }

  window.dispatchEvent(new CustomEvent('teams_updated'));
  return newLocked;
}

// ==========================================
// REGISTRATIONS HELPERS
// ==========================================

export function getLocalRegistrations(): RegistrationItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_REGISTRATIONS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalRegistrations(regs: RegistrationItem[]) {
  try {
    localStorage.setItem(LOCAL_REGISTRATIONS_KEY, JSON.stringify(regs));
  } catch {}
}

export async function fetchRegistrationsSafe(): Promise<{ data: RegistrationItem[] }> {
  // 1. Primary: Supabase Cloud Database
  try {
    const { data, error } = await supabase.from('registrations').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data)) {
      const mapped = data.map(r => ({
        id: r.id,
        team: r.team,
        in_game_name: r.in_game_name,
        tanks: r.tanks,
        is_winner: Boolean(r.is_winner),
        created_at: r.created_at
      }));
      saveLocalRegistrations(mapped);
      return { data: mapped };
    }
  } catch (err) {
    console.warn('Supabase fetchRegistrations error, checking local fallback:', err);
  }

  // 2. Secondary: Local Server SQLite
  try {
    const res = await fetch('/api/registrations');
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw)) {
        const data = raw.map(r => ({
          ...r,
          is_winner: Boolean(r.is_winner)
        }));
        saveLocalRegistrations(data);
        return { data };
      }
    }
  } catch (err) {
    console.warn('fetchRegistrationsSafe API error, using local:', err);
  }

  // 3. Fallback: LocalStorage
  return { data: getLocalRegistrations() };
}

export async function addRegistrationSafe(reg: {
  team: string;
  inGameName?: string;
  in_game_name?: string;
  tanks: string;
}): Promise<{ registration: RegistrationItem; error?: string }> {
  const currentRegs = getLocalRegistrations();
  const newId = generateClientUuid();
  const inGameName = reg.inGameName || reg.in_game_name || '';
  const newReg: RegistrationItem = {
    id: newId,
    team: reg.team,
    in_game_name: inGameName,
    tanks: reg.tanks,
    created_at: new Date().toISOString(),
    is_winner: false
  };

  // 1. Primary: Supabase Cloud Database
  try {
    await supabase.from('registrations').insert([{
      id: newId,
      team: reg.team,
      in_game_name: inGameName,
      tanks: reg.tanks,
      is_winner: false,
      created_at: newReg.created_at
    }]);
  } catch (err) {
    console.warn('Supabase addRegistration error:', err);
  }

  // 2. Secondary: Local Server SQLite backup
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: newId,
        team: reg.team,
        inGameName: inGameName,
        tanks: reg.tanks
      })
    });
    if (res.ok) {
      const data = await res.json();
      newReg.id = data.id || newId;
    }
  } catch (err: any) {
    console.warn('addRegistration API error:', err);
  }

  // 3. Update LocalStorage cache
  const updated = [newReg, ...currentRegs];
  saveLocalRegistrations(updated);
  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { registration: newReg };
}

export async function updateRegistrationSafe(
  id: string | number,
  updatedData: { team: string; in_game_name: string; tanks: string }
): Promise<{ success: boolean; error?: string }> {
  const currentRegs = getLocalRegistrations();
  const updated = currentRegs.map(r => (String(r.id) === String(id) ? { ...r, ...updatedData } : r));
  saveLocalRegistrations(updated);

  // 1. Supabase Cloud Database
  try {
    await supabase.from('registrations').update({
      team: updatedData.team,
      in_game_name: updatedData.in_game_name,
      tanks: updatedData.tanks
    }).eq('id', id);
  } catch (err) {
    console.warn('Supabase updateRegistration error:', err);
  }

  // 2. Local Server SQLite
  try {
    await fetch(`/api/registrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedData)
    });
  } catch (err: any) {
    console.warn('updateRegistration API error:', err);
  }

  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { success: true };
}

export async function deleteRegistrationSafe(
  id: string | number,
  fallbackInfo?: { in_game_name?: string; team?: string }
): Promise<{ success: boolean; error?: string }> {
  const currentRegs = getLocalRegistrations();
  const updated = currentRegs.filter(r => 
    String(r.id) !== String(id) && 
    (!fallbackInfo?.in_game_name || r.in_game_name !== fallbackInfo.in_game_name)
  );
  saveLocalRegistrations(updated);

  // 1. Supabase Cloud Database
  try {
    await supabase.from('registrations').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase deleteRegistration error:', err);
  }

  // 2. Local Server SQLite
  const encodedId = encodeURIComponent(String(id));
  try {
    await fetch(`/api/registrations/${encodedId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        in_game_name: fallbackInfo?.in_game_name,
        team: fallbackInfo?.team
      })
    });
  } catch (err: any) {
    console.warn('deleteRegistration API error:', err);
  }

  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { success: true };
}

export async function toggleRegistrationWinnerSafe(
  id: string | number,
  currentWinner?: boolean,
  inGameName?: string
): Promise<boolean> {
  const newWinner = !currentWinner;
  const currentRegs = getLocalRegistrations();
  saveLocalRegistrations(currentRegs.map(r => (String(r.id) === String(id) ? { ...r, is_winner: newWinner } : r)));

  // 1. Supabase Cloud Database
  try {
    await supabase.from('registrations').update({ is_winner: newWinner }).eq('id', id);
  } catch (err) {
    console.warn('Supabase toggleWinner error:', err);
  }

  // 2. Local Server SQLite
  try {
    await fetch(`/api/registrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_winner: newWinner })
    });
  } catch (err: any) {
    console.warn('toggleRegistrationWinner API error:', err);
  }

  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return newWinner;
}

export const toggleWinnerSafe = toggleRegistrationWinnerSafe;

// ==========================================
// NEWS HELPERS
// ==========================================

export function getLocalNews(): NewsItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_NEWS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_NEWS;
}

export function saveLocalNews(news: NewsItem[]) {
  try {
    localStorage.setItem(LOCAL_NEWS_KEY, JSON.stringify(news));
  } catch {}
}

export async function fetchNewsSafe(): Promise<{ data: NewsItem[]; isTableSupported: boolean }> {
  // 1. Primary: Supabase Cloud Database
  try {
    const { data, error } = await supabase.from('news').select('*').order('created_at', { ascending: false });
    if (!error && Array.isArray(data) && data.length > 0) {
      saveLocalNews(data);
      return { data, isTableSupported: true };
    }
  } catch (err) {
    console.warn('Supabase fetchNews error:', err);
  }

  // 2. Secondary: Local Server SQLite
  try {
    const res = await fetch('/api/news');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        saveLocalNews(data);
        return { data, isTableSupported: true };
      }
    }
  } catch (err) {
    console.warn('fetchNewsSafe API error:', err);
  }

  return { data: getLocalNews(), isTableSupported: true };
}

export async function addNewsSafe(title: string, content: string): Promise<{ item: NewsItem; error?: string }> {
  const currentNews = getLocalNews();
  const newId = generateClientUuid();
  const newItem: NewsItem = {
    id: newId,
    title: title.trim(),
    content: content.trim(),
    created_at: new Date().toISOString()
  };

  // 1. Primary: Supabase Cloud Database
  try {
    await supabase.from('news').insert([newItem]);
  } catch (err) {
    console.warn('Supabase addNews error:', err);
  }

  // 2. Secondary: Local Server SQLite backup
  try {
    const res = await fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newItem)
    });
    if (res.ok) {
      const data = await res.json();
      newItem.id = data.id || newId;
    }
  } catch (err: any) {
    console.warn('addNews API error:', err);
  }

  const updated = [newItem, ...currentNews];
  saveLocalNews(updated);
  return { item: newItem };
}

export async function updateNewsSafe(id: string, title: string, content: string): Promise<{ success: boolean; error?: string }> {
  const currentNews = getLocalNews();
  const updated = currentNews.map(n => (n.id === id ? { ...n, title: title.trim(), content: content.trim() } : n));
  saveLocalNews(updated);

  // 1. Supabase Cloud Database
  try {
    await supabase.from('news').update({ title: title.trim(), content: content.trim() }).eq('id', id);
  } catch (err) {
    console.warn('Supabase updateNews error:', err);
  }

  // 2. Local Server SQLite
  try {
    const encodedId = encodeURIComponent(id);
    await fetch(`/api/news/${encodedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim(), content: content.trim() })
    });
  } catch (err: any) {
    console.warn('updateNews API error:', err);
  }

  return { success: true };
}

export async function deleteNewsSafe(id: string): Promise<{ success: boolean; error?: string }> {
  const currentNews = getLocalNews();
  const updated = currentNews.filter(n => n.id !== id);
  saveLocalNews(updated);

  // 1. Supabase Cloud Database
  try {
    await supabase.from('news').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase deleteNews error:', err);
  }

  // 2. Local Server SQLite
  const encodedId = encodeURIComponent(id);
  try {
    await fetch(`/api/news/${encodedId}`, { method: 'DELETE' });
  } catch (err: any) {
    console.warn('deleteNews API error:', err);
  }

  return { success: true };
}

// ==========================================
// USERS HELPERS
// ==========================================

export function getLocalUsers(): UserItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_USERS;
}

export function saveLocalUsers(users: UserItem[]) {
  try {
    localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
  } catch {}
}

export async function fetchUsersSafe(): Promise<UserItem[]> {
  // 1. Primary: Supabase Cloud Database
  try {
    const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: true });
    if (!error && Array.isArray(data) && data.length > 0) {
      const mapped = data.map(u => ({
        id: u.id,
        username: u.username,
        password: u.password,
        role: u.role || 'Quản trị',
        is_locked: Boolean(u.is_locked)
      }));
      saveLocalUsers(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('Supabase fetchUsers error:', err);
  }

  // 2. Secondary: Local Server SQLite
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const raw = await res.json();
      if (Array.isArray(raw)) {
        const data = raw.map(u => ({ ...u, is_locked: Boolean(u.is_locked) }));
        saveLocalUsers(data);
        return data;
      }
    }
  } catch (err) {
    console.warn('fetchUsersSafe API error:', err);
  }

  return getLocalUsers();
}

export async function addUserSafe(user: { username: string; password?: string; role: string }): Promise<UserItem> {
  const currentUsers = getLocalUsers();
  const newId = generateClientUuid();
  const newUser: UserItem = {
    id: newId,
    username: user.username.trim(),
    password: user.password,
    role: user.role || 'Điều hành',
    is_locked: false
  };

  // 1. Primary: Supabase Cloud Database
  try {
    await supabase.from('users').insert([{
      id: newId,
      username: newUser.username,
      password: newUser.password || '',
      role: newUser.role,
      is_locked: false
    }]);
  } catch (err) {
    console.warn('Supabase addUser error:', err);
  }

  // 2. Secondary: Local Server SQLite backup
  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUser)
    });
    if (res.ok) {
      const data = await res.json();
      newUser.id = data.id || newId;
    }
  } catch (err: any) {
    console.warn('addUser API error:', err);
  }

  const updated = [...currentUsers, newUser];
  saveLocalUsers(updated);
  return newUser;
}

export async function updateUserSafe(id: string | number, data: Partial<UserItem>): Promise<{ success: boolean; error?: string }> {
  const currentUsers = getLocalUsers();
  const updated = currentUsers.map(u => (String(u.id) === String(id) ? { ...u, ...data } : u));
  saveLocalUsers(updated);

  // 1. Supabase Cloud Database
  try {
    await supabase.from('users').update(data).eq('id', id);
  } catch (err) {
    console.warn('Supabase updateUser error:', err);
  }

  // 2. Local Server SQLite
  try {
    const encodedId = encodeURIComponent(String(id));
    await fetch(`/api/users/${encodedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err: any) {
    console.warn('updateUser API error:', err);
  }

  return { success: true };
}

export async function deleteUserSafe(id: string | number): Promise<{ success: boolean; error?: string }> {
  const currentUsers = getLocalUsers();
  const updated = currentUsers.filter(u => String(u.id) !== String(id));
  saveLocalUsers(updated);

  // 1. Supabase Cloud Database
  try {
    await supabase.from('users').delete().eq('id', id);
  } catch (err) {
    console.warn('Supabase deleteUser error:', err);
  }

  // 2. Local Server SQLite
  const encodedId = encodeURIComponent(String(id));
  try {
    await fetch(`/api/users/${encodedId}`, { method: 'DELETE' });
  } catch (err: any) {
    console.warn('deleteUser API error:', err);
  }

  return { success: true };
}

export async function toggleUserLockSafe(id: string | number, currentLocked?: boolean): Promise<boolean> {
  const newLocked = !currentLocked;
  const currentUsers = getLocalUsers();
  saveLocalUsers(currentUsers.map(u => (String(u.id) === String(id) ? { ...u, is_locked: newLocked } : u)));

  // 1. Supabase Cloud Database
  try {
    await supabase.from('users').update({ is_locked: newLocked }).eq('id', id);
  } catch (err) {
    console.warn('Supabase toggleUserLock error:', err);
  }

  // 2. Local Server SQLite
  try {
    await fetch(`/api/users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_locked: newLocked })
    });
  } catch (err: any) {
    console.warn('toggleUserLock API error:', err);
  }

  return newLocked;
}

/**
 * Sync entire local/cached dataset directly to Supabase Cloud Database
 */
export async function syncAllLocalToSupabase(): Promise<{
  success: boolean;
  count: { teams: number; regs: number; news: number; users: number; settings: number };
  error?: string;
}> {
  try {
    const teams = getLocalTeams();
    const regs = getLocalRegistrations();
    const news = getLocalNews();
    const users = getLocalUsers();

    let campaignSettings = null;
    try {
      const raw = localStorage.getItem('campaign_settings');
      if (raw) campaignSettings = JSON.parse(raw);
    } catch {}

    const res = await syncAllDataToSupabase({
      teams,
      registrations: regs,
      users,
      news,
      campaign_settings: campaignSettings
    });

    if (!res.success) throw new Error(res.error);

    return {
      success: true,
      count: {
        teams: res.details?.teams ?? teams.length,
        regs: res.details?.registrations ?? regs.length,
        news: res.details?.news ?? news.length,
        users: res.details?.users ?? users.length,
        settings: res.details?.settings ?? 1
      }
    };
  } catch (err: any) {
    return {
      success: false,
      count: { teams: 0, regs: 0, news: 0, users: 0, settings: 0 },
      error: err?.message || 'Có lỗi khi đồng bộ dữ liệu sang Supabase Cloud Database'
    };
  }
}
