import { useEffect, useState } from 'react';
import type { Coupon } from '@/lib/supabase';
import { fetchCoupons, createCoupon, updateCoupon, deleteCoupon as apiDeleteCoupon } from '@/lib/api';
import {
  Plus, Pencil, Trash2, X, Tag, Search, ToggleLeft, ToggleRight,
  Percent, DollarSign, Calendar, Users, TrendingUp,
} from 'lucide-react';

type CouponForm = {
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: string;
  min_order_amount: string;
  max_usage: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
};

const emptyForm: CouponForm = {
  code: '',
  description: '',
  discount_type: 'percentage',
  discount_value: '',
  min_order_amount: '',
  max_usage: '',
  start_date: '',
  end_date: '',
  is_active: true,
};

function statusBadge(coupon: Coupon) {
  if (!coupon.is_active) return { label: 'Inactive', cls: 'bg-slate-100 text-slate-500' };
  const now = new Date();
  if (coupon.start_date && new Date(coupon.start_date) > now) return { label: 'Scheduled', cls: 'bg-sky-50 text-sky-700' };
  if (coupon.end_date && new Date(coupon.end_date) < now) return { label: 'Expired', cls: 'bg-rose-50 text-rose-600' };
  if (coupon.max_usage && coupon.current_usage >= coupon.max_usage) return { label: 'Used Up', cls: 'bg-amber-50 text-amber-700' };
  return { label: 'Active', cls: 'bg-emerald-50 text-emerald-700' };
}

export default function CouponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await fetchCoupons();
      setCoupons(data);
    } catch (err) {
      console.error('Failed to load coupons:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = coupons.filter(
    (c) =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.description ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingCoupon(null);
    setForm(emptyForm);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setForm({
      code: coupon.code,
      description: coupon.description ?? '',
      discount_type: coupon.discount_type,
      discount_value: String(coupon.discount_value),
      min_order_amount: coupon.min_order_amount ? String(coupon.min_order_amount) : '',
      max_usage: coupon.max_usage ? String(coupon.max_usage) : '',
      start_date: coupon.start_date ? coupon.start_date.slice(0, 10) : '',
      end_date: coupon.end_date ? coupon.end_date.slice(0, 10) : '',
      is_active: coupon.is_active,
    });
    setError('');
    setModalOpen(true);
  };

  const saveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      code: form.code.toUpperCase().trim(),
      description: form.description || '',
      discount_type: form.discount_type,
      discount_value: parseFloat(form.discount_value),
      min_order_amount: form.min_order_amount ? parseFloat(form.min_order_amount) : 0,
      max_usage: form.max_usage ? parseInt(form.max_usage) : undefined,
      start_date: form.start_date || undefined,
      end_date: form.end_date || undefined,
      is_active: form.is_active,
    };

    let res;
    if (editingCoupon) {
      res = await updateCoupon(editingCoupon.id, payload);
    } else {
      res = await createCoupon(payload);
    }

    if (res && res.error) {
      setError(res.error.includes('unique') || res.error.includes('already exists') ? 'Coupon code already exists.' : res.error);
      setSaving(false);
      return;
    }
    setModalOpen(false);
    load();
    setSaving(false);
  };

  const deleteCoupon = async (coupon: Coupon) => {
    if (!confirm(`Delete coupon "${coupon.code}"?`)) return;
    const res = await apiDeleteCoupon(coupon.id);
    if (res && res.error) {
      alert(`Error deleting coupon: ${res.error}`);
      return;
    }
    load();
  };

  const toggleActive = async (coupon: Coupon) => {
    const res = await updateCoupon(coupon.id, { is_active: !coupon.is_active });
    if (res && res.error) {
      alert(`Error updating coupon: ${res.error}`);
      return;
    }
    setCoupons((prev) => prev.map((c) => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c));
  };

  const stats = {
    total: coupons.length,
    active: coupons.filter((c) => statusBadge(c).label === 'Active').length,
    totalUsage: coupons.reduce((sum, c) => sum + (c.current_usage ?? 0), 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Coupons & Promotions</h2>
          <p className="text-sm text-slate-500 mt-0.5">Create discount codes for your customers</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-2 self-start"
        >
          <Plus className="w-4 h-4" /> New Coupon
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Tag, label: 'Total Coupons', value: stats.total, color: 'text-slate-700', bg: 'bg-slate-50' },
          { icon: TrendingUp, label: 'Active', value: stats.active, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { icon: Users, label: 'Total Uses', value: stats.totalUsage, color: 'text-orange-700', bg: 'bg-orange-50' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search coupons..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition-all"
        />
      </div>

      {/* Coupons table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Tag className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No coupons found</p>
            <button onClick={openAdd} className="mt-3 text-sm text-orange-500 hover:underline font-medium">
              Create your first coupon
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 sm:px-6 py-3">Code</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 hidden sm:table-cell">Discount</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 hidden md:table-cell">Usage</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 hidden lg:table-cell">Validity</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((coupon) => {
                  const badge = statusBadge(coupon);
                  return (
                    <tr key={coupon.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                            <Tag className="w-4 h-4 text-orange-500" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900 font-mono tracking-wide">{coupon.code}</div>
                            {coupon.description && (
                              <div className="text-xs text-slate-500 max-w-[160px] truncate">{coupon.description}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          {coupon.discount_type === 'percentage'
                            ? <Percent className="w-3.5 h-3.5 text-slate-400" />
                            : <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                          }
                          <span className="text-sm font-semibold text-slate-900">
                            {coupon.discount_type === 'percentage'
                              ? `${coupon.discount_value}%`
                              : `$${Number(coupon.discount_value).toFixed(2)}`
                            }
                          </span>
                        </div>
                        {coupon.min_order_amount && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            Min: ${Number(coupon.min_order_amount).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="text-sm text-slate-900">
                          {coupon.current_usage ?? 0}
                          {coupon.max_usage ? ` / ${coupon.max_usage}` : ' used'}
                        </div>
                        {coupon.max_usage && (
                          <div className="w-20 h-1.5 bg-slate-100 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className="h-full bg-orange-400 rounded-full"
                              style={{ width: `${Math.min(100, ((coupon.current_usage ?? 0) / coupon.max_usage) * 100)}%` }}
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Calendar className="w-3.5 h-3.5" />
                          {coupon.start_date
                            ? new Date(coupon.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                            : '—'
                          }
                          {' → '}
                          {coupon.end_date
                            ? new Date(coupon.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                            : 'No expiry'
                          }
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => toggleActive(coupon)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                            title={coupon.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {coupon.is_active
                              ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                              : <ToggleLeft className="w-5 h-5" />
                            }
                          </button>
                          <button
                            onClick={() => openEdit(coupon)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteCoupon(coupon)}
                            className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-base font-semibold text-slate-900">
                {editingCoupon ? 'Edit Coupon' : 'New Coupon'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={saveCoupon} className="p-6 space-y-4">
              {error && (
                <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
                  {error}
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Coupon Code *</label>
                <input
                  type="text" required value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. SAVE20"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm font-mono uppercase tracking-wider focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Description</label>
                <input
                  type="text" value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="e.g. 20% off for new customers"
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Discount Type *</label>
                  <select
                    value={form.discount_type}
                    onChange={(e) => setForm({ ...form, discount_type: e.target.value as 'percentage' | 'fixed' })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 bg-white"
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                    Value {form.discount_type === 'percentage' ? '(%)' : '($)'} *
                  </label>
                  <div className="relative">
                    {form.discount_type === 'percentage'
                      ? <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      : <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    }
                    <input
                      type="number" required min="0" max={form.discount_type === 'percentage' ? 100 : undefined} step="0.01"
                      value={form.discount_value}
                      onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                      className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Min Order ($)</label>
                  <input
                    type="number" min="0" step="0.01" value={form.min_order_amount}
                    onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })}
                    placeholder="No minimum"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Max Uses</label>
                  <input
                    type="number" min="1" step="1" value={form.max_usage}
                    onChange={(e) => setForm({ ...form, max_usage: e.target.value })}
                    placeholder="Unlimited"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Start Date</label>
                  <input
                    type="date" value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">End Date</label>
                  <input
                    type="date" value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox" checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 rounded accent-orange-500"
                />
                <span className="text-sm text-slate-700">Active (customers can use this coupon)</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button
                  type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  {editingCoupon ? 'Save Changes' : 'Create Coupon'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
