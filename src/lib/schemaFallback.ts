import { syncToCloudflareDb, getApiBaseUrl } from './cloudflareD1';

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
    content: 'Chào mừng các chiến binh tham gia chiến dịch Spring Maneuvers 2026! Thời gian diễn ra từ 23/03/2026 đến 06/04/2026. Các đội vui lòng kiểm tra danh sách thành viên và chuẩn bị phương tiện tác chiến.',
    created_at: '2026-03-20T08:00:00Z'
  },
  {
    id: 'c6df86f3-ec10-4f2c-aacf-7bc9aa1c546c',
    title: 'Quy định đăng ký & Chốt danh sách',
    content: 'Mỗi chiến binh đăng ký với tên In-Game chính xác và các xe sử dụng. Khi đội tuyển được Ban Quản Trị / Điều Hành chốt danh sách, thành viên mới sẽ không thể đăng ký thêm vào đội đó.',
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
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/teams`);
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
    console.warn('fetchTeamsSafe API error, using local fallback:', err);
  }

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

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: teamId, name: trimmed, is_locked: false })
    });
    if (res.ok) {
      const data = await res.json();
      const updated = [...currentTeams.filter(t => t.id !== data.id && t.name !== data.name), { ...data, is_locked: Boolean(data.is_locked) }];
      saveLocalTeams(updated);
      window.dispatchEvent(new CustomEvent('teams_updated'));
      return { team: data };
    }
  } catch (err: any) {
    console.warn('Add team API error:', err);
  }

  // Fallback to local
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

  try {
    const encodedId = encodeURIComponent(idOrName);
    await fetch(`${getApiBaseUrl()}/api/teams/${encodedId}`, {
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

  const encodedId = encodeURIComponent(idOrName);
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/teams/${encodedId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: teamName })
    });

    if (!res.ok && baseUrl) {
      await fetch(`/api/teams/${encodedId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: teamName })
      });
    }
  } catch (err: any) {
    if (baseUrl) {
      try {
        await fetch(`/api/teams/${encodedId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: teamName })
        });
      } catch {}
    }
    console.warn('deleteTeam API error:', err);
  }

  window.dispatchEvent(new CustomEvent('teams_updated'));
  return { success: true };
}

export async function toggleTeamLockSafe(team: TeamItem): Promise<boolean> {
  const newLocked = !team.is_locked;
  const currentTeams = getLocalTeams();
  saveLocalTeams(currentTeams.map(t => ((t.name === team.name || t.id === team.id) ? { ...t, is_locked: newLocked } : t)));

  try {
    await fetch(`${getApiBaseUrl()}/api/teams/${team.id}`, {
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
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/registrations`);
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

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/register`, {
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

  try {
    await fetch(`${getApiBaseUrl()}/api/registrations/${id}`, {
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

  const encodedId = encodeURIComponent(String(id));
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/registrations/${encodedId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        in_game_name: fallbackInfo?.in_game_name,
        team: fallbackInfo?.team
      })
    });
    if (!res.ok && baseUrl) {
      // Fallback to local server
      await fetch(`/api/registrations/${encodedId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          in_game_name: fallbackInfo?.in_game_name,
          team: fallbackInfo?.team
        })
      });
    }
  } catch (err: any) {
    if (baseUrl) {
      try {
        await fetch(`/api/registrations/${encodedId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            in_game_name: fallbackInfo?.in_game_name,
            team: fallbackInfo?.team
          })
        });
      } catch {}
    }
    console.warn('deleteRegistration API error:', err);
  }

  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { success: true };
}

export async function toggleWinnerSafe(
  id: string | number,
  currentStatus: boolean | undefined,
  fallbackInGameName?: string
): Promise<boolean> {
  const newStatus = !currentStatus;
  const currentRegs = getLocalRegistrations();
  saveLocalRegistrations(currentRegs.map(r => (String(r.id) === String(id) || (fallbackInGameName && r.in_game_name === fallbackInGameName) ? { ...r, is_winner: newStatus } : r)));

  try {
    await fetch(`${getApiBaseUrl()}/api/registrations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_winner: newStatus })
    });
  } catch (err: any) {
    console.warn('toggleWinner API error:', err);
  }

  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return newStatus;
}

// ==========================================
// NEWS HELPERS
// ==========================================

export function getLocalNews(): NewsItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_NEWS_KEY);
    if (raw !== null) {
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
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/news`);
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

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/news`, {
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
  window.dispatchEvent(new CustomEvent('news_updated'));
  return { item: newItem };
}

export async function updateNewsSafe(id: string, title: string, content: string): Promise<{ success: boolean; error?: string }> {
  const currentNews = getLocalNews();
  const updated = currentNews.map(n => (n.id === id ? { ...n, title: title.trim(), content: content.trim() } : n));
  saveLocalNews(updated);

  try {
    const encodedId = encodeURIComponent(id);
    await fetch(`${getApiBaseUrl()}/api/news/${encodedId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    });
  } catch (err: any) {
    console.warn('updateNews API error:', err);
  }

  window.dispatchEvent(new CustomEvent('news_updated'));
  return { success: true };
}

export async function deleteNewsSafe(id: string): Promise<{ success: boolean; error?: string }> {
  const currentNews = getLocalNews();
  const updated = currentNews.filter(n => n.id !== id);
  saveLocalNews(updated);

  const encodedId = encodeURIComponent(id);
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/news/${encodedId}`, { method: 'DELETE' });
    if (!res.ok && baseUrl) {
      await fetch(`/api/news/${encodedId}`, { method: 'DELETE' });
    }
  } catch (err: any) {
    if (baseUrl) {
      try {
        await fetch(`/api/news/${encodedId}`, { method: 'DELETE' });
      } catch {}
    }
    console.warn('deleteNews API error:', err);
  }

  window.dispatchEvent(new CustomEvent('news_updated'));
  return { success: true };
}

// ==========================================
// USERS HELPERS
// ==========================================

export function getLocalUsers(): UserItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw !== null) {
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
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/users`);
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

  try {
    const res = await fetch(`${getApiBaseUrl()}/api/users`, {
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

  try {
    const encodedId = encodeURIComponent(String(id));
    await fetch(`${getApiBaseUrl()}/api/users/${encodedId}`, {
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

  const encodedId = encodeURIComponent(String(id));
  const baseUrl = getApiBaseUrl();

  try {
    const res = await fetch(`${baseUrl}/api/users/${encodedId}`, { method: 'DELETE' });
    if (!res.ok && baseUrl) {
      await fetch(`/api/users/${encodedId}`, { method: 'DELETE' });
    }
  } catch (err: any) {
    if (baseUrl) {
      try {
        await fetch(`/api/users/${encodedId}`, { method: 'DELETE' });
      } catch {}
    }
    console.warn('deleteUser API error:', err);
  }

  return { success: true };
}

export async function toggleUserLockSafe(id: string | number, currentLocked?: boolean): Promise<boolean> {
  const newLocked = !currentLocked;
  const currentUsers = getLocalUsers();
  saveLocalUsers(currentUsers.map(u => (String(u.id) === String(id) ? { ...u, is_locked: newLocked } : u)));

  try {
    await fetch(`${getApiBaseUrl()}/api/users/${id}`, {
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
 * Sync entire dataset to Cloudflare / SQLite backend
 */
export async function syncAllLocalToCloudflare(): Promise<{
  success: boolean;
  count: { teams: number; regs: number; news: number; users: number };
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

    const res = await syncToCloudflareDb({
      teams,
      users,
      news,
      registrations: regs,
      campaignSettings
    });

    if (!res.success) throw new Error(res.error);

    return {
      success: true,
      count: {
        teams: teams.length,
        regs: regs.length,
        news: news.length,
        users: users.length
      }
    };
  } catch (err: any) {
    return {
      success: false,
      count: { teams: 0, regs: 0, news: 0, users: 0 },
      error: err?.message || 'Có lỗi khi đồng bộ dữ liệu sang Cloudflare D1 / SQLite'
    };
  }
}
