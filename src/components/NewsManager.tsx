import React, { useState, useEffect } from 'react';
import { Trash2, Plus, Edit2, Save, X, Megaphone, Check } from 'lucide-react';
import { motion } from 'motion/react';
import {
  NewsItem,
  fetchNewsSafe,
  addNewsSafe,
  updateNewsSafe,
  deleteNewsSafe
} from '../lib/schemaFallback';

export default function NewsManager() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [isTableSupported, setIsTableSupported] = useState(true);
  
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const [deletingNews, setDeletingNews] = useState<NewsItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchNews();

    const handleNewsUpdate = () => {
      fetchNews();
    };
    window.addEventListener('news_updated', handleNewsUpdate);
    window.addEventListener('supabase_config_updated', handleNewsUpdate);
    return () => {
      window.removeEventListener('news_updated', handleNewsUpdate);
      window.removeEventListener('supabase_config_updated', handleNewsUpdate);
    };
  }, []);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchNewsSafe();
      setNews(res.data || []);
      setIsTableSupported(res.isTableSupported);
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
    }
  };

  const handleAddNews = async () => {
    if (!newTitle.trim() || !newContent.trim()) {
      setError('Vui lòng nhập tiêu đề và nội dung tin tức');
      return;
    }

    try {
      setError(null);
      const res = await addNewsSafe(newTitle, newContent);
      setNews(prev => [res.item, ...prev.filter(n => n.id !== res.item.id)]);
      setNewTitle('');
      setNewContent('');
      setIsAdding(false);
    } catch (err: any) {
      setError('Lỗi khi thêm tin tức: ' + (err?.message || 'Vui lòng thử lại'));
    }
  };

  const handleDeleteNews = (item: NewsItem) => {
    setDeletingNews(item);
  };

  const handleConfirmDeleteNews = async () => {
    if (!deletingNews) return;
    setIsDeleting(true);
    try {
      setError(null);
      await deleteNewsSafe(deletingNews.id);
      setNews(prev => prev.filter(n => n.id !== deletingNews.id));
      setFeedbackMsg(`Đã xóa tin tức "${deletingNews.title}" thành công!`);
      setDeletingNews(null);
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      setError('Lỗi khi xóa tin tức: ' + (err?.message || 'Vui lòng thử lại'));
    } finally {
      setIsDeleting(false);
    }
  };

  const startEditing = (item: NewsItem) => {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditContent(item.content);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
    setEditContent('');
  };

  const handleUpdateNews = async () => {
    if (!editingId || !editTitle.trim() || !editContent.trim()) {
      setError('Vui lòng nhập tiêu đề và nội dung tin tức');
      return;
    }

    try {
      setError(null);
      await updateNewsSafe(editingId, editTitle, editContent);
      setNews(prev => prev.map(n => n.id === editingId ? { ...n, title: editTitle.trim(), content: editContent.trim() } : n));
      cancelEditing();
    } catch (err: any) {
      setError('Lỗi khi cập nhật tin tức');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-zinc-200 overflow-hidden">
      <div className="bg-zinc-50 px-6 py-4 border-b border-zinc-200 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Megaphone className="text-zinc-500" size={20} />
          <h2 className="text-lg font-semibold text-zinc-800">Quản lý Tin tức</h2>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-1 bg-camo-accent hover:bg-camo-accent/90 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
        >
          {isAdding ? <X size={16} /> : <Plus size={16} />}
          {isAdding ? 'Hủy' : 'Thêm tin tức'}
        </button>
      </div>

      <div className="p-6">


        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md text-sm">
            {error}
          </div>
        )}

        {isAdding && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 bg-zinc-50 rounded-lg border border-zinc-200"
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Tiêu đề</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-camo-accent"
                  placeholder="Nhập tiêu đề tin tức..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">Nội dung</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-camo-accent min-h-[100px]"
                  placeholder="Nhập nội dung tin tức..."
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleAddNews}
                  className="flex items-center gap-2 bg-camo-accent hover:bg-camo-accent/90 text-white px-4 py-2 rounded-md font-medium transition-colors"
                >
                  <Save size={16} />
                  Lưu tin tức
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {loading ? (
          <div className="text-center py-8 text-zinc-500">Đang tải tin tức...</div>
        ) : news.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">Chưa có tin tức nào</div>
        ) : (
          <div className="space-y-4">
            {news.map((item) => (
              <div key={item.id} className="border border-zinc-200 rounded-lg p-4">
                {editingId === item.id ? (
                  <div className="space-y-4">
                    <div>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-camo-accent"
                      />
                    </div>
                    <div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:outline-none focus:ring-2 focus:ring-camo-accent min-h-[100px]"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-md text-sm font-medium"
                      >
                        Hủy
                      </button>
                      <button
                        onClick={handleUpdateNews}
                        className="flex items-center gap-1 bg-camo-accent hover:bg-camo-accent/90 text-white px-3 py-1.5 rounded-md text-sm font-medium"
                      >
                        <Save size={16} />
                        Lưu
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-lg text-zinc-900">{item.title}</h3>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEditing(item)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="Sửa"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteNews(item)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          title="Xóa tin tức"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <p className="text-zinc-600 whitespace-pre-wrap text-sm mb-2">{item.content}</p>
                    <div className="text-xs text-zinc-400">
                      {new Date(item.created_at).toLocaleString('vi-VN')}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Xác nhận Xóa Tin tức */}
      {deletingNews && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="p-3 bg-red-100 rounded-xl">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-900">Xác nhận xóa tin tức</h3>
                <p className="text-xs text-zinc-500">Xóa bài đăng tin tức khỏi trang chủ</p>
              </div>
            </div>

            <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 text-xs text-zinc-700 space-y-2 mb-6">
              <div>
                <span className="text-zinc-500 font-medium">Tiêu đề:</span>
                <strong className="text-zinc-900 block mt-0.5">{deletingNews.title}</strong>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingNews(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteNews}
                disabled={isDeleting}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={14} />
                <span>{isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
