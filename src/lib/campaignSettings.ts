import { getApiBaseUrl } from './cloudflareD1';

export interface CampaignSettings {
  campaign_name: string;
  phase_name: string;
  start_date: string;
  end_date: string;
}

export const DEFAULT_CAMPAIGN_SETTINGS: CampaignSettings = {
  campaign_name: 'Campaign 2026',
  phase_name: 'Spring Maneuvers',
  start_date: '23/03/2026',
  end_date: '06/04/2026',
};

const LOCAL_STORAGE_KEY = 'campaign_settings';

export const getStoredCampaignSettings = (): CampaignSettings => {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        campaign_name: parsed.campaign_name || DEFAULT_CAMPAIGN_SETTINGS.campaign_name,
        phase_name: parsed.phase_name || DEFAULT_CAMPAIGN_SETTINGS.phase_name,
        start_date: parsed.start_date || DEFAULT_CAMPAIGN_SETTINGS.start_date,
        end_date: parsed.end_date || DEFAULT_CAMPAIGN_SETTINGS.end_date,
      };
    }
  } catch (err) {
    console.warn('Error reading campaign settings from local storage:', err);
  }
  return DEFAULT_CAMPAIGN_SETTINGS;
};

export const fetchCampaignSettings = async (): Promise<CampaignSettings> => {
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/campaign-settings`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.campaign_name) {
        const settings: CampaignSettings = {
          campaign_name: data.campaign_name,
          phase_name: data.phase_name,
          start_date: data.start_date,
          end_date: data.end_date,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
        return settings;
      }
    }
  } catch (err) {
    console.warn('Could not fetch campaign settings from API, using fallback:', err);
  }

  return getStoredCampaignSettings();
};

export const saveCampaignSettings = async (
  settings: CampaignSettings
): Promise<{ success: boolean; error?: string }> => {
  // Always update localStorage first
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(
      new CustomEvent('campaign_settings_updated', { detail: settings })
    );
  } catch (err) {
    console.warn('Failed to save campaign settings to localStorage', err);
  }

  // Update backend SQLite / Cloudflare D1
  try {
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/api/campaign-settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) {
      const data = await res.json();
      return { success: false, error: data.error };
    }
    return { success: true };
  } catch (err: any) {
    return { success: true }; // LocalStorage saved
  }
};
