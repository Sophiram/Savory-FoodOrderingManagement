import { useEffect, useState, useCallback } from 'react';
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Search,
  RefreshCw,
  Sliders,
  History,
  TrendingDown,
  Layers,
  ArrowUpRight,
  Loader2,
  Filter
} from 'lucide-react';
import {
  fetchInventoryItems,
  fetchInventorySummary,
  restockInventoryItem,
  updateInventoryItem,
  fetchInventoryLogs,
  type InventoryItem,
  type InventorySummary,
  type InventoryLog
} from '@/lib/api';

export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary>({
    total_items: 0,
    tracked_items: 0,
    out_of_stock: 0,
    low_stock: 0,
    in_stock: 0
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Restock modal
  const [restockModalItem, setRestockModalItem] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState<number>(10);
  const [restockNotes, setRestockNotes] = useState('Restock shipment');
  const [restocking, setRestocking] = useState(false);

  // Edit stock threshold modal
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [editQty, setEditQty] = useState<number>(50);
  const [editThreshold, setEditThreshold] = useState<number>(5);
  const [editTrack, setEditTrack] = useState<boolean>(true);
  const [savingEdit, setSavingEdit] = useState(false);

  // Logs modal
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sumData, itemsData] = await Promise.all([
        fetchInventorySummary(),
        fetchInventoryItems(statusFilter, search)
      ]);
      setSummary(sumData);
      setItems(itemsData);
    } catch (err) {
      console.error('Failed to load inventory data:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockModalItem || restockQty <= 0) return;
    setRestocking(true);
    const res = await restockInventoryItem(restockModalItem.id, restockQty, restockNotes);
    setRestocking(false);
    if (res.success) {
      setRestockModalItem(null);
      setRestockQty(10);
      loadData();
    } else {
      alert(res.error || 'Failed to restock');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItem) return;
    setSavingEdit(true);
    const res = await updateInventoryItem(editItem.id, {
      stock_quantity: editQty,
      low_stock_threshold: editThreshold,
      track_stock: editTrack
    });
    setSavingEdit(false);
    if (res.success) {
      setEditItem(null);
      loadData();
    } else {
      alert(res.error || 'Failed to update item inventory');
    }
  };

  const openLogsModal = async () => {
    setLogsModalOpen(true);
    setLoadingLogs(true);
    const data = await fetchInventoryLogs(40);
    setLogs(data);
    setLoadingLogs(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Package className="w-7 h-7 text-orange-500" />
            Inventory & Stock
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time kitchen ingredient and dish stock tracking with automatic deduction.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={openLogsModal}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <History className="w-4 h-4 text-slate-500" /> Stock History
          </button>
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-orange-500 text-white text-xs font-bold rounded-xl hover:bg-orange-600 transition-all shadow-sm shadow-orange-500/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Tracked Dishes</span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{summary.tracked_items} / {summary.total_items}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">In Stock</span>
            <div className="text-2xl font-black text-emerald-600 mt-0.5">{summary.in_stock}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Low Stock Alert</span>
            <div className="text-2xl font-black text-amber-600 mt-0.5">{summary.low_stock}</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shrink-0">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Sold Out</span>
            <div className="text-2xl font-black text-rose-600 mt-0.5">{summary.out_of_stock}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search dish or category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All Items' },
            { id: 'in_stock', label: 'In Stock' },
            { id: 'low_stock', label: 'Low Stock' },
            { id: 'out_of_stock', label: 'Out of Stock' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <span className="text-xs text-slate-400 font-semibold">Loading inventory levels...</span>
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-slate-700">No Inventory Items Found</h4>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your search query or status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-4">Dish</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Price</th>
                  <th className="py-3.5 px-4">Current Stock</th>
                  <th className="py-3.5 px-4">Threshold</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {items.map((item) => {
                  const isOutOfStock = item.stock_quantity <= 0 && item.track_stock;
                  const isLow = item.stock_quantity > 0 && item.stock_quantity <= item.low_stock_threshold && item.track_stock;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold shrink-0">
                              {item.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-900">{item.name}</div>
                            {!item.track_stock && (
                              <span className="text-[10px] text-slate-400 font-mono">Stock tracking disabled</span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-semibold">
                          {item.category_name || 'General'}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        ${Number(item.price).toFixed(2)}
                      </td>

                      <td className="py-3.5 px-4">
                        {item.track_stock ? (
                          <div className="space-y-1">
                            <span className={`font-black text-sm ${
                              isOutOfStock ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-900'
                            }`}>
                              {item.stock_quantity} units
                            </span>
                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isOutOfStock ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, Math.max(0, (item.stock_quantity / 50) * 100))}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 font-mono">Unlimited</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 font-mono">
                        {item.track_stock ? `≤ ${item.low_stock_threshold}` : '—'}
                      </td>

                      <td className="py-3.5 px-4">
                        {isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-rose-50 text-rose-700 border border-rose-200">
                            <XCircle className="w-3 h-3 text-rose-500" /> Sold Out
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-amber-50 text-amber-700 border border-amber-200">
                            <AlertTriangle className="w-3 h-3 text-amber-500" /> Low Stock
                          </span>
                        ) : item.track_stock ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> In Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                            Untracked
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setRestockModalItem(item);
                              setRestockQty(20);
                            }}
                            className="px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold rounded-lg text-xs transition-colors flex items-center gap-1 border border-orange-200/60"
                            title="Quick restock item"
                          >
                            <Plus className="w-3.5 h-3.5" /> Restock
                          </button>
                          <button
                            onClick={() => {
                              setEditItem(item);
                              setEditQty(item.stock_quantity);
                              setEditThreshold(item.low_stock_threshold);
                              setEditTrack(item.track_stock);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Configure stock settings"
                          >
                            <Sliders className="w-4 h-4" />
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

      {/* Restock Modal */}
      {restockModalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Restock Ingredient / Dish</h3>
                <p className="text-xs text-slate-500">{restockModalItem.name}</p>
              </div>
              <button onClick={() => setRestockModalItem(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Current Stock Level:</span>
              <span className="font-bold text-slate-900">{restockModalItem.stock_quantity} units</span>
            </div>

            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Add Quantity</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    required
                    value={restockQty}
                    onChange={(e) => setRestockQty(parseInt(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-bold"
                  />
                  <div className="flex gap-1">
                    {[10, 25, 50].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRestockQty(preset)}
                        className="px-2.5 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors text-slate-700"
                      >
                        +{preset}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Restock Reason / Notes</label>
                <input
                  type="text"
                  value={restockNotes}
                  onChange={(e) => setRestockNotes(e.target.value)}
                  placeholder="e.g. Weekly vendor delivery, Fresh prep"
                  className="w-full px-3.5 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRestockModalItem(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={restocking}
                  className="px-5 py-2 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors shadow-sm shadow-orange-500/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {restocking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Confirm Restock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Inventory Settings Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Configure Stock Settings</h3>
                <p className="text-xs text-slate-500">{editItem.name}</p>
              </div>
              <button onClick={() => setEditItem(null)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
                <div>
                  <div className="text-xs font-bold text-slate-800">Track Stock for this Dish</div>
                  <div className="text-[11px] text-slate-400">Auto-deduct when customers order</div>
                </div>
                <input
                  type="checkbox"
                  checked={editTrack}
                  onChange={(e) => setEditTrack(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-500 focus:ring-orange-400"
                />
              </div>

              {editTrack && (
                <>
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Set Exact Stock Quantity</label>
                    <input
                      type="number"
                      min="0"
                      value={editQty}
                      onChange={(e) => setEditQty(parseInt(e.target.value) || 0)}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-bold"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">Low Stock Warning Threshold</label>
                    <input
                      type="number"
                      min="1"
                      value={editThreshold}
                      onChange={(e) => setEditThreshold(parseInt(e.target.value) || 1)}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-bold"
                    />
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Alerts will appear when stock drops to or below this number.
                    </span>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditItem(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock History Log Drawer/Modal */}
      {logsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-bold text-slate-900">Inventory Movement History</h3>
              </div>
              <button onClick={() => setLogsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingLogs ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                  <span className="text-xs text-slate-400 font-medium">Fetching history logs...</span>
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">No inventory movements recorded yet.</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{log.menu_item_name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {log.notes || log.change_type} • <span className="font-mono">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`font-black text-xs px-2 py-0.5 rounded-lg ${
                        log.quantity_changed > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}>
                        {log.quantity_changed > 0 ? `+${log.quantity_changed}` : log.quantity_changed}
                      </span>
                      <div className="text-[10px] text-slate-400 mt-0.5">After: {log.quantity_after}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
