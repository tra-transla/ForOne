import { supabase, runSupabaseDiagnostics } from './supabase';

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

// Helper to check standard UUID format (v1-v5 or general 8-4-4-4-12 hex)
export function isValidUuid(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val.trim());
}

// Generate client UUID safe for PostgreSQL
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
    password: 'Sonla@2026#',
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
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
  const localLocked = getLocalLockedTeams();
  const localTeams = getLocalTeams();

  try {
    const { data, error } = await supabase
      .from('teams')
      .select('id, name, is_locked, created_at')
      .order('created_at', { ascending: true });

    if (!error && data) {
      if (data.length > 0) {
        const mapped = data.map(t => ({
          ...t,
          is_locked: t.is_locked !== undefined && t.is_locked !== null ? Boolean(t.is_locked) : localLocked.includes(t.name)
        }));
        saveLocalTeams(mapped);
        return { data: mapped, isLockedColumnSupported: true };
      } else {
        // Supabase has 0 teams. If local has teams, sync them up!
        if (localTeams.length > 0) {
          syncTeamsToSupabase(localTeams);
          return { data: localTeams, isLockedColumnSupported: true };
        }
      }
    }
  } catch (err) {
    console.warn('fetchTeamsSafe failed, using local teams:', err);
  }

  return {
    data: localTeams.map(t => ({
      ...t,
      is_locked: t.is_locked !== undefined ? t.is_locked : localLocked.includes(t.name)
    })),
    isLockedColumnSupported: false
  };
}

export async function addTeamSafe(name: string): Promise<{ team: TeamItem; error?: string }> {
  const trimmed = name.trim();
  const currentTeams = getLocalTeams();
  const fallbackId = generateClientUuid();
  const newTeam: TeamItem = {
    id: fallbackId,
    name: trimmed,
    is_locked: false,
    created_at: new Date().toISOString()
  };

  let supabaseErrorMsg: string | undefined;

  try {
    const { data, error } = await supabase
      .from('teams')
      .insert([{ id: fallbackId, name: trimmed, is_locked: false }])
      .select();

    if (!error && data && data.length > 0) {
      const created = data[0];
      const updated = [...currentTeams.filter(t => t.id !== created.id && t.name !== created.name), created];
      saveLocalTeams(updated);
      window.dispatchEvent(new CustomEvent('teams_updated'));
      return { team: created };
    } else if (error) {
      supabaseErrorMsg = error.message;
      console.warn('Supabase add team warning:', error);
    }
  } catch (e: any) {
    supabaseErrorMsg = e?.message;
  }

  // Fallback to local
  const updated = [...currentTeams.filter(t => t.name !== trimmed), newTeam];
  saveLocalTeams(updated);
  window.dispatchEvent(new CustomEvent('teams_updated'));
  return { team: newTeam, error: supabaseErrorMsg };
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

  // Update registrations that had oldName -> trimmedNew
  const localRegs = getLocalRegistrations();
  const updatedRegs = localRegs.map(r => (r.team === oldName ? { ...r, team: trimmedNew } : r));
  saveLocalRegistrations(updatedRegs);

  let supabaseError: string | undefined;

  try {
    if (isValidUuid(idOrName)) {
      const res = await supabase.from('teams').update({ name: trimmedNew }).eq('id', idOrName);
      if (res.error) supabaseError = res.error.message;
    } else {
      const res = await supabase.from('teams').update({ name: trimmedNew }).eq('name', oldName);
      if (res.error) supabaseError = res.error.message;
    }

    // Update registrations in Supabase as well
    await supabase.from('registrations').update({ team: trimmedNew }).eq('team', oldName);
  } catch (err: any) {
    supabaseError = err?.message;
  }

  window.dispatchEvent(new CustomEvent('teams_updated'));
  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { success: !supabaseError, error: supabaseError };
}

export async function deleteTeamSafe(idOrName: string, teamName: string): Promise<{ success: boolean; error?: string }> {
  const currentTeams = getLocalTeams();
  const updatedTeams = currentTeams.filter(t => t.id !== idOrName && t.name !== teamName && t.name !== idOrName);
  saveLocalTeams(updatedTeams);

  let supabaseError: string | undefined;

  try {
    if (isValidUuid(idOrName)) {
      const res = await supabase.from('teams').delete().eq('id', idOrName);
      if (res.error) supabaseError = res.error.message;
    }
    // Also try by name to ensure no orphaned team record remains
    const resName = await supabase.from('teams').delete().eq('name', teamName);
    if (!supabaseError && resName.error) supabaseError = resName.error.message;
  } catch (err: any) {
    supabaseError = err?.message;
  }

  window.dispatchEvent(new CustomEvent('teams_updated'));
  return { success: !supabaseError, error: supabaseError };
}

export async function toggleTeamLockSafe(team: TeamItem): Promise<boolean> {
  const newLocked = !team.is_locked;
  const currentLocked = getLocalLockedTeams();
  let updatedLocked = [...currentLocked];

  if (newLocked) {
    if (!updatedLocked.includes(team.name)) updatedLocked.push(team.name);
  } else {
    updatedLocked = updatedLocked.filter(n => n !== team.name);
  }
  saveLocalLockedTeams(updatedLocked);

  const currentTeams = getLocalTeams();
  saveLocalTeams(currentTeams.map(t => ((t.name === team.name || t.id === team.id) ? { ...t, is_locked: newLocked } : t)));

  try {
    if (isValidUuid(team.id)) {
      await supabase.from('teams').update({ is_locked: newLocked }).eq('id', team.id);
    } else {
      await supabase.from('teams').update({ is_locked: newLocked }).eq('name', team.name);
    }
  } catch {}

  window.dispatchEvent(new CustomEvent('teams_updated'));
  return newLocked;
}

// ==========================================
// REGISTRATIONS HELPERS
// ==========================================

export function getLocalRegistrations(): RegistrationItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_REGISTRATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalRegistrations(regs: RegistrationItem[]) {
  try {
    localStorage.setItem(LOCAL_REGISTRATIONS_KEY, JSON.stringify(regs));
  } catch {}
}

export function getLocalWinnerIds(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_WINNERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalWinnerIds(ids: string[]) {
  try {
    localStorage.setItem(LOCAL_WINNERS_KEY, JSON.stringify(ids));
  } catch {}
}

export async function fetchRegistrationsSafe(): Promise<{ data: RegistrationItem[]; isWinnerColumnSupported: boolean }> {
  const localWinners = getLocalWinnerIds();
  const localRegs = getLocalRegistrations();

  try {
    const { data, error } = await supabase
      .from('registrations')
      .select('id, team, in_game_name, tanks, created_at, is_winner')
      .order('created_at', { ascending: true });

    if (!error && data) {
      if (data.length > 0) {
        const mapped = data.map(r => ({
          ...r,
          is_winner: r.is_winner !== undefined && r.is_winner !== null ? Boolean(r.is_winner) : localWinners.includes(String(r.id))
        }));
        saveLocalRegistrations(mapped);
        return { data: mapped, isWinnerColumnSupported: true };
      } else {
        // Supabase returned 0 rows. If local has registrations, sync them up!
        if (localRegs.length > 0) {
          syncRegistrationsToSupabase(localRegs);
          return { data: localRegs, isWinnerColumnSupported: true };
        }
        saveLocalRegistrations([]);
        return { data: [], isWinnerColumnSupported: true };
      }
    }
  } catch (err) {
    console.warn('fetchRegistrationsSafe error, using local:', err);
  }

  return {
    data: localRegs.map(r => ({
      ...r,
      is_winner: r.is_winner !== undefined ? r.is_winner : localWinners.includes(String(r.id))
    })),
    isWinnerColumnSupported: false
  };
}

export async function addRegistrationSafe(reg: { team: string; in_game_name: string; tanks: string }): Promise<{ registration: RegistrationItem; error?: string }> {
  const localList = getLocalRegistrations();
  const newId = generateClientUuid();
  const newReg: RegistrationItem = {
    id: newId,
    team: reg.team.trim(),
    in_game_name: reg.in_game_name.trim(),
    tanks: reg.tanks.trim(),
    is_winner: false,
    created_at: new Date().toISOString()
  };

  let supabaseErrorMsg: string | undefined;

  try {
    const { data, error } = await supabase
      .from('registrations')
      .insert([{
        id: newId,
        team: reg.team.trim(),
        in_game_name: reg.in_game_name.trim(),
        tanks: reg.tanks.trim(),
        is_winner: false
      }])
      .select();

    if (!error && data && data.length > 0) {
      const serverReg = data[0];
      const updated = [...localList.filter(r => r.id !== serverReg.id), serverReg];
      saveLocalRegistrations(updated);
      window.dispatchEvent(new CustomEvent('registrations_updated'));
      return { registration: serverReg };
    } else if (error) {
      supabaseErrorMsg = error.message;
      console.warn('Supabase registration insert error:', error);
    }
  } catch (err: any) {
    supabaseErrorMsg = err?.message;
    console.warn('Failed to insert registration to Supabase, stored locally:', err);
  }

  const updated = [...localList, newReg];
  saveLocalRegistrations(updated);
  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { registration: newReg, error: supabaseErrorMsg };
}

export async function updateRegistrationSafe(
  id: string | number,
  data: { team: string; in_game_name: string; tanks: string }
): Promise<{ success: boolean; error?: string }> {
  const localList = getLocalRegistrations();
  const updated = localList.map(r => (r.id === id ? { ...r, ...data } : r));
  saveLocalRegistrations(updated);

  let supabaseError: string | undefined;

  try {
    if (isValidUuid(id)) {
      const { error } = await supabase
        .from('registrations')
        .update({
          team: data.team.trim(),
          in_game_name: data.in_game_name.trim(),
          tanks: data.tanks.trim()
        })
        .eq('id', id);

      if (error) supabaseError = error.message;
    } else {
      // Non-UUID: match by in_game_name or insert if not exists
      const { data: existing } = await supabase
        .from('registrations')
        .select('id')
        .eq('in_game_name', data.in_game_name.trim())
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from('registrations')
          .update({
            team: data.team.trim(),
            in_game_name: data.in_game_name.trim(),
            tanks: data.tanks.trim()
          })
          .eq('id', existing[0].id);
      } else {
        await supabase.from('registrations').insert([{
          id: generateClientUuid(),
          team: data.team.trim(),
          in_game_name: data.in_game_name.trim(),
          tanks: data.tanks.trim(),
          is_winner: false
        }]);
      }
    }
  } catch (err: any) {
    supabaseError = err?.message;
  }

  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { success: !supabaseError, error: supabaseError };
}

export async function deleteRegistrationSafe(
  id: string | number,
  fallbackInfo?: { in_game_name?: string; team?: string }
): Promise<{ success: boolean; error?: string }> {
  const localList = getLocalRegistrations();
  const updated = localList.filter(r => r.id !== id);
  saveLocalRegistrations(updated);

  let supabaseError: string | undefined;

  try {
    if (isValidUuid(id)) {
      const { error } = await supabase.from('registrations').delete().eq('id', id);
      if (error) supabaseError = error.message;
    } else if (fallbackInfo?.in_game_name) {
      const { error } = await supabase.from('registrations').delete().eq('in_game_name', fallbackInfo.in_game_name);
      if (error) supabaseError = error.message;
    }
  } catch (err: any) {
    supabaseError = err?.message;
  }

  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return { success: !supabaseError, error: supabaseError };
}

export async function toggleWinnerSafe(
  id: string | number,
  currentStatus: boolean,
  fallbackInGameName?: string
): Promise<boolean> {
  const newStatus = !currentStatus;
  const idStr = String(id);
  const currentWinners = getLocalWinnerIds();
  let updatedWinners = [...currentWinners];

  if (newStatus) {
    if (!updatedWinners.includes(idStr)) updatedWinners.push(idStr);
  } else {
    updatedWinners = updatedWinners.filter(item => item !== idStr);
  }
  saveLocalWinnerIds(updatedWinners);

  const localRegs = getLocalRegistrations();
  saveLocalRegistrations(localRegs.map(r => (String(r.id) === idStr ? { ...r, is_winner: newStatus } : r)));

  try {
    if (isValidUuid(id)) {
      await supabase.from('registrations').update({ is_winner: newStatus }).eq('id', id);
    } else if (fallbackInGameName) {
      await supabase.from('registrations').update({ is_winner: newStatus }).eq('in_game_name', fallbackInGameName);
    }
  } catch {}

  window.dispatchEvent(new CustomEvent('registrations_updated'));
  return newStatus;
}

// ==========================================
// NEWS HELPERS
// ==========================================

export function getLocalNews(): NewsItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_NEWS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
    const { data, error } = await supabase
      .from('news')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      saveLocalNews(data);
      return { data, isTableSupported: true };
    }
  } catch {}

  const local = getLocalNews();
  return { data: local, isTableSupported: false };
}

export async function addNewsSafe(title: string, content: string): Promise<{ item: NewsItem; isTableSupported: boolean }> {
  const localList = getLocalNews();
  const newId = generateClientUuid();
  const newItem: NewsItem = {
    id: newId,
    title: title.trim(),
    content: content.trim(),
    created_at: new Date().toISOString()
  };

  try {
    const { data, error } = await supabase
      .from('news')
      .insert([{ id: newId, title: title.trim(), content: content.trim() }])
      .select();

    if (!error && data && data.length > 0) {
      const serverItem = data[0];
      saveLocalNews([serverItem, ...localList.filter(n => n.id !== serverItem.id)]);
      window.dispatchEvent(new CustomEvent('news_updated'));
      return { item: serverItem, isTableSupported: true };
    }
  } catch {}

  const updated = [newItem, ...localList];
  saveLocalNews(updated);
  window.dispatchEvent(new CustomEvent('news_updated'));
  return { item: newItem, isTableSupported: false };
}

export async function updateNewsSafe(id: string, title: string, content: string): Promise<{ success: boolean; isTableSupported: boolean }> {
  const localList = getLocalNews();
  const updated = localList.map(n => (n.id === id ? { ...n, title: title.trim(), content: content.trim() } : n));
  saveLocalNews(updated);

  try {
    if (isValidUuid(id)) {
      const { error } = await supabase
        .from('news')
        .update({ title: title.trim(), content: content.trim() })
        .eq('id', id);

      if (!error) {
        window.dispatchEvent(new CustomEvent('news_updated'));
        return { success: true, isTableSupported: true };
      }
    }
  } catch {}

  window.dispatchEvent(new CustomEvent('news_updated'));
  return { success: true, isTableSupported: false };
}

export async function deleteNewsSafe(id: string): Promise<{ success: boolean; isTableSupported: boolean }> {
  const localList = getLocalNews();
  const updated = localList.filter(n => n.id !== id);
  saveLocalNews(updated);

  try {
    if (isValidUuid(id)) {
      const { error } = await supabase.from('news').delete().eq('id', id);
      if (!error) {
        window.dispatchEvent(new CustomEvent('news_updated'));
        return { success: true, isTableSupported: true };
      }
    }
  } catch {}

  window.dispatchEvent(new CustomEvent('news_updated'));
  return { success: true, isTableSupported: false };
}

// ==========================================
// USERS HELPERS (SAFE AUTH & MANAGEMENT)
// ==========================================

export function getLocalUsers(): UserItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
    const { data, error } = await supabase
      .from('users')
      .select('id, username, role, is_locked')
      .order('username', { ascending: true });

    if (!error && data && data.length > 0) {
      const mapped = data.map(u => ({
        ...u,
        is_locked: Boolean(u.is_locked)
      }));
      const local = getLocalUsers();
      const merged = mapped.map(u => {
        const found = local.find(l => l.username.toLowerCase() === u.username.toLowerCase());
        return found?.password ? { ...u, password: found.password } : u;
      });
      saveLocalUsers(merged);
      return merged;
    }
  } catch {}

  return getLocalUsers();
}

export async function addUserSafe(user: { username: string; password: string; role: string }): Promise<UserItem> {
  const localUsers = getLocalUsers();
  const newId = generateClientUuid();
  const newUser: UserItem = {
    id: newId,
    username: user.username.trim(),
    password: user.password,
    role: user.role,
    is_locked: false
  };

  try {
    const { data, error } = await supabase
      .from('users')
      .insert([{
        id: newId,
        username: user.username.trim(),
        password: user.password,
        role: user.role
      }])
      .select();

    if (!error && data && data.length > 0) {
      const created = { ...data[0], password: user.password };
      const updated = [...localUsers.filter(u => u.username !== created.username), created];
      saveLocalUsers(updated);
      return created;
    }
  } catch {}

  const updated = [...localUsers, newUser];
  saveLocalUsers(updated);
  return newUser;
}

export async function updateUserSafe(
  id: string | number,
  data: { role?: string; password?: string; is_locked?: boolean }
): Promise<void> {
  const localUsers = getLocalUsers();
  const updated = localUsers.map(u => (u.id === id ? { ...u, ...data } : u));
  saveLocalUsers(updated);

  try {
    if (isValidUuid(id)) {
      await supabase.from('users').update(data).eq('id', id);
    }
  } catch {}
}

export async function deleteUserSafe(id: string | number): Promise<void> {
  const localUsers = getLocalUsers();
  const updated = localUsers.filter(u => u.id !== id);
  saveLocalUsers(updated);

  try {
    if (isValidUuid(id)) {
      await supabase.from('users').delete().eq('id', id);
    }
  } catch {}
}

export async function toggleUserLockSafe(id: string | number, currentLocked: boolean): Promise<boolean> {
  const newLocked = !currentLocked;
  const localUsers = getLocalUsers();
  const updated = localUsers.map(u => (u.id === id ? { ...u, is_locked: newLocked } : u));
  saveLocalUsers(updated);

  try {
    if (isValidUuid(id)) {
      await supabase.from('users').update({ is_locked: newLocked }).eq('id', id);
    }
  } catch {}

  return newLocked;
}

// ==========================================
// FULL SYNC UTILITIES
// ==========================================

export async function syncTeamsToSupabase(teams: TeamItem[]) {
  try {
    for (const t of teams) {
      const teamId = isValidUuid(t.id) ? t.id : generateClientUuid();
      await supabase.from('teams').upsert(
        { id: teamId, name: t.name, is_locked: Boolean(t.is_locked) },
        { onConflict: 'name' }
      );
    }
  } catch (e) {
    console.warn('Sync teams error:', e);
  }
}

export async function syncRegistrationsToSupabase(regs: RegistrationItem[]) {
  try {
    for (const r of regs) {
      const regId = isValidUuid(r.id) ? r.id : generateClientUuid();
      await supabase.from('registrations').insert([{
        id: regId,
        team: r.team,
        in_game_name: r.in_game_name,
        tanks: r.tanks,
        is_winner: Boolean(r.is_winner)
      }]);
    }
  } catch (e) {
    console.warn('Sync registrations error:', e);
  }
}

export async function syncAllLocalToSupabase(): Promise<{ success: boolean; count: { teams: number; regs: number; news: number; users: number }; error?: string }> {
  const diag = await runSupabaseDiagnostics();
  if (!diag.ok) {
    return { success: false, count: { teams: 0, regs: 0, news: 0, users: 0 }, error: diag.message };
  }

  const teams = getLocalTeams();
  const regs = getLocalRegistrations();
  const news = getLocalNews();
  const users = getLocalUsers();

  try {
    // 1. Teams
    for (const t of teams) {
      const id = isValidUuid(t.id) ? t.id : generateClientUuid();
      await supabase.from('teams').upsert({ id, name: t.name, is_locked: Boolean(t.is_locked) }, { onConflict: 'name' });
    }

    // 2. Users
    for (const u of users) {
      const id = isValidUuid(u.id) ? u.id : generateClientUuid();
      await supabase.from('users').upsert({
        id,
        username: u.username,
        password: u.password || 'Sonla@2026#',
        role: u.role,
        is_locked: Boolean(u.is_locked)
      }, { onConflict: 'username' });
    }

    // 3. News
    for (const n of news) {
      const id = isValidUuid(n.id) ? n.id : generateClientUuid();
      await supabase.from('news').upsert({ id, title: n.title, content: n.content });
    }

    // 4. Registrations
    for (const r of regs) {
      const id = isValidUuid(r.id) ? r.id : generateClientUuid();
      await supabase.from('registrations').upsert({
        id,
        team: r.team,
        in_game_name: r.in_game_name,
        tanks: r.tanks,
        is_winner: Boolean(r.is_winner)
      });
    }

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
      error: err?.message || 'Có lỗi khi đồng bộ dữ liệu lên Supabase'
    };
  }
}

// ==========================================
// SUPABASE SQL SCRIPT EXPORT
// ==========================================

export const SUPABASE_SETUP_SQL = `-- ==============================================================
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
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

INSERT INTO users (username, password, role) VALUES 
('admin', 'Sonla@2026#', 'Quản trị'),
('admin1', 'Sonla', 'Quản trị'),
('operator', 'operator123', 'Điều hành')
ON CONFLICT (username) DO NOTHING;

-- 2. BẢNG TEAMS (Danh sách các đội được tạo và quản lý)
CREATE TABLE IF NOT EXISTS teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE teams ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE;

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
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS is_winner BOOLEAN DEFAULT FALSE;

-- 4. BẢNG NEWS (Tin tức & Thông báo chiến dịch)
CREATE TABLE IF NOT EXISTS news (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

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
`;
