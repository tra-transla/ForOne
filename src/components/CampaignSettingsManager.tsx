import React, { useState, useEffect } from 'react';
import { Calendar, Save, RotateCcw, CheckCircle2, AlertCircle, Clock, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import {
  CampaignSettings,
  DEFAULT_CAMPAIGN_SETTINGS,
  fetchCampaignSettings,
  saveCampaignSettings,
} from '../lib/campaignSettings';

export default function CampaignSettingsManager() {
  const [settings, setSettings] = useState<CampaignSettings>(DEFAULT_CAMPAIGN_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Helper date conversions for date picker inputs (YYYY-MM-DD <-> DD/MM/YYYY)
  const ddmmyyyyToIso = (val: string): string => {
    if (!val) return '';
    const parts = val.trim().split('/');
    if (parts.length === 3) {
      const [d, m, y] = parts;
      return `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return '';
  };

  const isoToDdmmyyyy = (iso: string): string => {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    }
    return iso;
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const data = await fetchCampaignSettings();
      setSettings(data);
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await saveCampaignSettings(settings);
      if (res.success) {
        setStatusMessage({ type: 'success', text: 'Đã lưu thay đổi thời gian sự kiện thành công!' });
        setTimeout(() => setStatusMessage(null), 4000);
      } else {
        setStatusMessage({ type: 'error', text: res.error || 'Có lỗi xảy ra khi lưu' });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Có lỗi khi lưu' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Khôi phục thời gian về mặc định (23/03/2026 đến 06/04/2026)?')) {
      setSettings(DEFAULT_CAMPAIGN_SETTINGS);
      setStatusMessage({ type: 'success', text: 'Đã hoàn tác về giá trị mặc định. Bấm "Lưu thay đổi" để áp dụng.' });
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48 text-zinc-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900 mr-3"></div>
        <span>Đang tải thông tin sự kiện...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <Calendar className="text-indigo-600" size={24} />
            Cài Đặt Thời Gian & Thông Tin Sự Kiện
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Chỉnh sửa thời gian bắt đầu, kết thúc và tên sự kiện hiển thị ở đầu trang đăng ký
          </p>
        </div>
      </div>

      {statusMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`p-4 rounded-xl flex items-center gap-3 text-sm font-medium ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle size={18} className="text-red-600 flex-shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form Settings */}
        <div className="lg:col-span-7 bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-zinc-100">
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Tên chiến dịch
                </label>
                <input
                  type="text"
                  value={settings.campaign_name}
                  onChange={(e) => setSettings({ ...settings, campaign_name: e.target.value })}
                  placeholder="Campaign 2026"
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-zinc-900 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                  Tên giai đoạn / Hoạt động
                </label>
                <input
                  type="text"
                  value={settings.phase_name}
                  onChange={(e) => setSettings({ ...settings, phase_name: e.target.value })}
                  placeholder="Spring Maneuvers"
                  className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-zinc-900 text-sm"
                  required
                />
              </div>
            </div>

            <div className="border-t border-zinc-100 pt-5">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-1.5">
                <Clock size={16} className="text-indigo-600" />
                Thời Gian Tổ Chức
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Start Date */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Thời gian bắt đầu <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={settings.start_date}
                      onChange={(e) => setSettings({ ...settings, start_date: e.target.value })}
                      placeholder="dd/mm/yyyy (vd: 23/03/2026)"
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-zinc-900 text-sm"
                      required
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={ddmmyyyyToIso(settings.start_date)}
                        onChange={(e) => {
                          if (e.target.value) {
                            setSettings({ ...settings, start_date: isoToDdmmyyyy(e.target.value) });
                          }
                        }}
                        className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 outline-none cursor-pointer"
                        title="Chọn nhanh từ lịch"
                      />
                      <span className="text-xs text-zinc-400">Chọn lịch nhanh</span>
                    </div>
                  </div>
                </div>

                {/* End Date */}
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Thời gian kết thúc <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={settings.end_date}
                      onChange={(e) => setSettings({ ...settings, end_date: e.target.value })}
                      placeholder="dd/mm/yyyy (vd: 06/04/2026)"
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-zinc-900 text-sm"
                      required
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="date"
                        value={ddmmyyyyToIso(settings.end_date)}
                        onChange={(e) => {
                          if (e.target.value) {
                            setSettings({ ...settings, end_date: isoToDdmmyyyy(e.target.value) });
                          }
                        }}
                        className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 outline-none cursor-pointer"
                        title="Chọn nhanh từ lịch"
                      />
                      <span className="text-xs text-zinc-400">Chọn lịch nhanh</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-zinc-100 gap-3">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2.5 border border-zinc-200 rounded-xl text-zinc-600 hover:bg-zinc-50 font-medium text-sm flex items-center gap-2 transition-colors"
              >
                <RotateCcw size={16} />
                Mặc định
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-medium text-sm flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
              >
                <Save size={16} />
                {saving ? 'Đang lưu...' : 'Lưu Thay Đổi'}
              </button>
            </div>
          </form>
        </div>

        {/* Live Preview */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-zinc-900 text-white p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2 text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-4">
              <Sparkles size={14} className="text-yellow-400" />
              Xem trước hiển thị trang chủ
            </div>

            <div className="p-4 bg-zinc-800/80 rounded-xl border border-zinc-700/60 flex items-center gap-4">
              <img
                src="https://i.ibb.co/nsCSz9mT/AFO.png"
                alt="Campaign Logo"
                className="w-[60px] h-[60px] object-contain flex-shrink-0"
              />
              <div className="min-w-0">
                <h4 className="text-xl font-bold tracking-tight text-white truncate">
                  {settings.campaign_name || 'Campaign 2026'}
                </h4>
                <p className="text-sm text-zinc-300 break-words mt-0.5">
                  {settings.phase_name || 'Spring Maneuvers'}:{' '}
                  <span className="font-medium text-amber-300">
                    {settings.start_date} đến {settings.end_date}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-4 text-xs text-zinc-400 space-y-1">
              <p>• Dữ liệu thời gian sẽ tự động hiển thị trên banner ở trang Đăng ký.</p>
              <p>• Định dạng ngày khuyến nghị: ngày/tháng/năm (vd: 23/03/2026).</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
