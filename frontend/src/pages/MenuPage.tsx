import { useEffect, useState } from 'react';
import type { Category, MenuItem } from '@/lib/supabase';
import {
  fetchCategories, fetchMenuItems, createMenuItem, updateMenuItem,
  deleteMenuItem as apiDeleteMenuItem, toggleMenuItemAvailability,
  createCategory as apiCreateCategory, updateCategory as apiUpdateCategory,
  deleteCategory as apiDeleteCategory
} from '@/lib/api';
import {
  Plus, Pencil, Trash2, X, Utensils, Search, DollarSign, Eye, EyeOff,
  Clock, Star, TrendingUp,
} from 'lucide-react';

type MenuItemWithCategory = MenuItem & { category_name?: string };

type ItemForm = {
  name: string;
  description: string;
  price: string;
  category_id: string;
  image_url: string;
  is_available: boolean;
  preparation_time: string;
  is_featured: boolean;
  is_popular: boolean;
};

const emptyItemForm = (defaultCategoryId = ''): ItemForm => ({
  name: '',
  description: '',
  price: '',
  category_id: defaultCategoryId,
  image_url: '',
  is_available: true,
  preparation_time: '20',
  is_featured: false,
  is_popular: false,
});

export default function MenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItemWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [errorMsg, setErrorMsg] = useState('');

  // Item modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemWithCategory | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyItemForm());

  // Category modal
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  async function loadData() {
    setLoading(true);
    setErrorMsg('');
    try {
      const [cats, menuItems] = await Promise.all([
        fetchCategories(),
        fetchMenuItems(),
      ]);
      const catMap = new Map(cats.map((c) => [c.id, c.name]));
      const itemsWithCat = menuItems.map((item: any) => ({
        ...item,
        category_name: item.category_name || catMap.get(item.category_id) || 'Unknown',
      }));
      setCategories(cats);
      setItems(itemsWithCat);
    } catch (err) {
      console.error('Failed to load menu data:', err);
      setErrorMsg('Failed to load menu data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const filtered = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.description ?? '').toLowerCase().includes(search.toLowerCase());
    const matchesCat = filterCategory === 'all' || item.category_id === filterCategory;
    return matchesSearch && matchesCat;
  });

  const openAdd = () => {
    setEditingItem(null);
    setForm(emptyItemForm(categories[0]?.id ?? ''));
    setModalOpen(true);
  };

  const openEdit = (item: MenuItemWithCategory) => {
    setEditingItem(item);
    setForm({
      name: item.name,
      description: item.description ?? '',
      price: String(item.price),
      category_id: item.category_id,
      image_url: item.image_url ?? '',
      is_available: item.is_available,
      preparation_time: String(item.preparation_time ?? 20),
      is_featured: item.is_featured ?? false,
      is_popular: item.is_popular ?? false,
    });
    setModalOpen(true);
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description,
      price: parseFloat(form.price),
      category_id: form.category_id,
      image_url: form.image_url || null,
      is_available: form.is_available,
      preparation_time: parseInt(form.preparation_time) || 20,
      is_featured: form.is_featured,
      is_popular: form.is_popular,
    };
    
    let res;
    if (editingItem) {
      res = await updateMenuItem(editingItem.id, payload);
    } else {
      res = await createMenuItem(payload);
    }
    
    if (res && res.error) {
      alert(`Error saving item: ${res.error}`);
      return;
    }
    setModalOpen(false);
    loadData();
  };

  const deleteItem = async (item: MenuItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    const res = await apiDeleteMenuItem(item.id);
    if (res && res.error) {
      alert(`Error deleting item: ${res.error}`);
      return;
    }
    loadData();
  };

  const toggleAvailability = async (item: MenuItem) => {
    const res = await toggleMenuItemAvailability(item.id, !item.is_available);
    if (res && res.error) {
      alert(`Error: ${res.error}`);
      return;
    }
    loadData();
  };

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    let res;
    if (editingCat) {
      res = await apiUpdateCategory(editingCat.id, { name: catForm.name, description: catForm.description });
    } else {
      res = await apiCreateCategory({ name: catForm.name, description: catForm.description });
    }
    if (res && res.error) {
      alert(`Error saving category: ${res.error}`);
      return;
    }
    setCatModalOpen(false);
    setCatForm({ name: '', description: '' });
    setEditingCat(null);
    loadData();
  };

  const deleteCategory = async (cat: Category) => {
    if (!confirm(`Delete category "${cat.name}" and all its items?`)) return;
    const res = await apiDeleteCategory(cat.id);
    if (res && res.error) {
      alert(`Error deleting category: ${res.error}`);
      return;
    }
    loadData();
  };

  const stats = {
    total: items.length,
    available: items.filter((i) => i.is_available).length,
    featured: items.filter((i) => i.is_featured).length,
    popular: items.filter((i) => i.is_popular).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Menu Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage categories, items, availability, and featured items</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setEditingCat(null); setCatForm({ name: '', description: '' }); setCatModalOpen(true); }}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Category
          </button>
          <button
            onClick={openAdd}
            className="px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Items', value: stats.total, icon: Utensils, cls: 'text-slate-700', bg: 'bg-slate-50' },
          { label: 'Available', value: stats.available, icon: Eye, cls: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'Featured', value: stats.featured, icon: Star, cls: 'text-amber-700', bg: 'bg-amber-50' },
          { label: 'Popular', value: stats.popular, icon: TrendingUp, cls: 'text-orange-700', bg: 'bg-orange-50' },
        ].map(({ label, value, icon: Icon, cls, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon className={`w-3.5 h-3.5 ${cls}`} />
            </div>
            <div className="text-xl font-bold text-slate-900">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Categories chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory('all')}
          className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filterCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          All ({items.length})
        </button>
        {categories.map((cat) => {
          const count = items.filter((i) => i.category_id === cat.id).length;
          return (
            <div key={cat.id} className="flex items-center group">
              <button
                onClick={() => setFilterCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-l-lg text-sm font-medium transition-colors ${
                  filterCategory === cat.id ? 'bg-slate-900 text-white' : 'bg-white border border-r-0 border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {cat.name} ({count})
              </button>
              <button
                onClick={() => { setEditingCat(cat); setCatForm({ name: cat.name, description: cat.description }); setCatModalOpen(true); }}
                className={`px-2 py-1.5 border border-slate-200 text-slate-400 hover:text-slate-700 transition-colors ${
                  filterCategory === cat.id ? 'bg-slate-900 border-l-0 border-slate-700' : 'bg-white hover:bg-slate-50'
                }`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => deleteCategory(cat)}
                className={`px-2 py-1.5 border border-l-0 border-slate-200 text-slate-400 hover:text-rose-500 rounded-r-lg transition-colors ${
                  filterCategory === cat.id ? 'bg-slate-900 border-slate-700' : 'bg-white hover:bg-rose-50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search items..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition-all"
        />
      </div>

      {/* Items grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <Utensils className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">No items found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl border border-slate-200 overflow-hidden group hover:shadow-md transition-shadow"
            >
              <div className="relative h-32 bg-slate-100 overflow-hidden">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Utensils className="w-8 h-8 text-slate-300" />
                  </div>
                )}
                {/* Badges */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {item.is_featured && (
                    <span className="px-1.5 py-0.5 bg-amber-500 text-white text-[10px] font-bold rounded-md flex items-center gap-0.5">
                      <Star className="w-2.5 h-2.5" /> Featured
                    </span>
                  )}
                  {item.is_popular && (
                    <span className="px-1.5 py-0.5 bg-orange-500 text-white text-[10px] font-bold rounded-md flex items-center gap-0.5">
                      <TrendingUp className="w-2.5 h-2.5" /> Popular
                    </span>
                  )}
                </div>
                {/* Availability toggle */}
                <div className="absolute top-2 right-2">
                  <button
                    onClick={() => toggleAvailability(item)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center backdrop-blur-sm transition-colors ${
                      item.is_available ? 'bg-emerald-500/90 text-white' : 'bg-slate-500/90 text-white'
                    }`}
                    title={item.is_available ? 'Available' : 'Unavailable'}
                  >
                    {item.is_available ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
                {!item.is_available && (
                  <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center">
                    <span className="text-white text-xs font-medium bg-slate-900/80 px-3 py-1 rounded-lg">Unavailable</span>
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{item.name}</h3>
                    <span className="text-xs text-slate-400">{item.category_name}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 shrink-0">${Number(item.price).toFixed(2)}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{item.description}</p>
                {item.preparation_time && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{item.preparation_time} min prep</span>
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => openEdit(item)}
                    className="flex-1 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => deleteItem(item)}
                    className="px-3 py-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Item Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-base font-semibold text-slate-900">
                {editingItem ? 'Edit Item' : 'Add New Item'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={saveItem} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Name *</label>
                <input
                  type="text" required value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Price ($) *</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number" required min="0" step="0.01" value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Prep Time (min)</label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="number" min="1" max="180" step="1" value={form.preparation_time}
                      onChange={(e) => setForm({ ...form, preparation_time: e.target.value })}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                    />
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Category *</label>
                <select
                  required value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 bg-white"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Image URL</label>
                <input
                  type="url" value={form.image_url}
                  onChange={(e) => setForm({ ...form, image_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
                {form.image_url && (
                  <img src={form.image_url} alt="Preview" className="mt-2 w-full h-28 object-cover rounded-xl border border-slate-100" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
              </div>
              <div className="space-y-2.5">
                {[
                  { key: 'is_available', label: 'Available for ordering', icon: Eye },
                  { key: 'is_featured', label: 'Featured (shown prominently in menu)', icon: Star },
                  { key: 'is_popular', label: 'Mark as Popular', icon: TrendingUp },
                ].map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form[key as keyof ItemForm] as boolean}
                      onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                      className="w-4 h-4 rounded accent-orange-500"
                    />
                    <Icon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-sm text-slate-700">{label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600"
                >
                  {editingItem ? 'Save Changes' : 'Add Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {catModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCatModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {editingCat ? 'Edit Category' : 'Add Category'}
              </h3>
              <button onClick={() => setCatModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={saveCategory} className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Name *</label>
                <input
                  type="text" required value={catForm.name}
                  onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Description</label>
                <input
                  type="text" value={catForm.description}
                  onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setCatModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600"
                >
                  {editingCat ? 'Save' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
