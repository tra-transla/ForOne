import { supabase } from './supabase';

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
  // Try fetching from Supabase first
  try {
    const { data, error } = await supabase
      .from('campaign_settings')
      .select('campaign_name, phase_name, start_date, end_date')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      const settings: CampaignSettings = {
        campaign_name: data.campaign_name || DEFAULT_CAMPAIGN_SETTINGS.campaign_name,
        phase_name: data.phase_name || DEFAULT_CAMPAIGN_SETTINGS.phase_name,
        start_date: data.start_date || DEFAULT_CAMPAIGN_SETTINGS.start_date,
        end_date: data.end_date || DEFAULT_CAMPAIGN_SETTINGS.end_date,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      return settings;
    }
  } catch (err) {
    console.warn('Could not fetch campaign settings from Supabase, using local fallback:', err);
  }

  // Fallback to localStorage or default
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

  // Try updating Supabase
  try {
    // Check if a row exists
    const { data: existingRows } = await supabase
      .from('campaign_settings')
      .select('id')
      .limit(1);

    if (existingRows && existingRows.length > 0) {
      const targetId = existingRows[0].id;
      const { error } = await supabase
        .from('campaign_settings')
        .update({
          campaign_name: settings.campaign_name,
          phase_name: settings.phase_name,
          start_date: settings.start_date,
          end_date: settings.end_date,
        })
        .eq('id', targetId);

      if (error) {
        console.warn('Supabase campaign_settings update warning:', error.message);
      }
    } else {
      const { error } = await supabase
        .from('campaign_settings')
        .insert([
          {
            campaign_name: settings.campaign_name,
            phase_name: settings.phase_name,
            start_date: settings.start_date,
            end_date: settings.end_date,
          },
        ]);

      if (error) {
        console.warn('Supabase campaign_settings insert warning:', error.message);
      }
    }
  } catch (err) {
    console.warn('Supabase save error (saved locally):', err);
  }

  return { success: true };
};
