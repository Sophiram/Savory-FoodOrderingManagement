import { useEffect, useState, useRef } from 'react';
import type { RestaurantTable } from '@/lib/supabase';
import { fetchTables, createTable, updateTable, deleteTable as apiDeleteTable } from '@/lib/api';
import {
  Plus, Pencil, Trash2, X, QrCode, Download, ToggleLeft, ToggleRight,
  TableProperties, Search, Users, Wifi,
} from 'lucide-react';
import QRCode from 'qrcode';

type TableForm = {
  table_number: string;
  name: string;
  capacity: string;
  is_active: boolean;
};

const emptyForm: TableForm = {
  table_number: '',
  name: '',
  capacity: '4',
  is_active: true,
};

export default function TablesPage() {
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [form, setForm] = useState<TableForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [qrModal, setQrModal] = useState<RestaurantTable | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const orderBaseUrl = window.location.origin + '/order';

  async function load() {
    setLoading(true);
    try {
      const data = await fetchTables();
      setTables(data);
    } catch (err) {
      console.error('Failed to load tables:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = tables.filter(
    (t) =>
      String(t.table_number).includes(search) ||
      (t.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => {
    setEditingTable(null);
    const nextNumber = tables.length > 0 ? Math.max(...tables.map((t) => t.table_number)) + 1 : 1;
    setForm({ ...emptyForm, table_number: String(nextNumber), name: `Table ${nextNumber}` });
    setError('');
    setModalOpen(true);
  };

  const openEdit = (table: RestaurantTable) => {
    setEditingTable(table);
    setForm({
      table_number: String(table.table_number),
      name: table.name ?? '',
      capacity: String(table.capacity ?? 4),
      is_active: table.is_active,
    });
    setError('');
    setModalOpen(true);
  };

  const saveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      table_number: parseInt(form.table_number),
      name: form.name || `Table ${form.table_number}`,
      capacity: parseInt(form.capacity) || 4,
      is_active: form.is_active,
    };

    let res;
    if (editingTable) {
      res = await updateTable(editingTable.id, payload);
    } else {
      res = await createTable(payload);
    }

    if (res && res.error) {
      setError(res.error.includes('unique') || res.error.includes('already exists') ? 'Table number already exists.' : res.error);
      setSaving(false);
      return;
    }
    setModalOpen(false);
    load();
    setSaving(false);
  };

  const deleteTable = async (table: RestaurantTable) => {
    if (!confirm(`Delete "${table.name ?? `Table ${table.table_number}`}"?`)) return;
    const res = await apiDeleteTable(table.id);
    if (res && res.error) {
      alert(`Error deleting table: ${res.error}`);
      return;
    }
    load();
  };

  const toggleActive = async (table: RestaurantTable) => {
    const res = await updateTable(table.id, { is_active: !table.is_active });
    if (res && res.error) {
      alert(`Error updating table: ${res.error}`);
      return;
    }
    setTables((prev) => prev.map((t) => t.id === table.id ? { ...t, is_active: !t.is_active } : t));
  };

  const openQR = async (table: RestaurantTable) => {
    setQrModal(table);
    const url = `${orderBaseUrl}?table=${table.table_number}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: '#1e293b', light: '#ffffff' },
        errorCorrectionLevel: 'H',
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl('');
    }
  };

  const downloadQR = (table: RestaurantTable) => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `savory-table-${table.table_number}-qr.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const printQR = (table: RestaurantTable) => {
    if (!qrDataUrl) return;
    const url = `${orderBaseUrl}?table=${table.table_number}`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR Code — ${table.name ?? `Table ${table.table_number}`}</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; }
            img { width: 300px; height: 300px; }
            h1 { font-size: 28px; margin: 20px 0 4px; }
            p { color: #64748b; font-size: 14px; }
            .url { font-size: 11px; word-break: break-all; color: #94a3b8; margin-top: 12px; }
            .logo { font-size: 20px; font-weight: 700; color: #f97316; margin-bottom: 24px; letter-spacing: -0.5px; }
          </style>
        </head>
        <body>
          <div class="logo">🍽️ Savory</div>
          <img src="${qrDataUrl}" alt="QR Code" />
          <h1>${table.name ?? `Table ${table.table_number}`}</h1>
          <p>Scan to order</p>
          <p class="url">${url}</p>
        </body>
      </html>
    `);
    win.document.close();
    win.print();
  };

  const stats = {
    total: tables.length,
    active: tables.filter((t) => t.is_active).length,
    capacity: tables.reduce((sum, t) => sum + (t.capacity ?? 0), 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Tables & QR Codes</h2>
          <p className="text-sm text-slate-500 mt-0.5">Manage dine-in tables and generate QR codes for ordering</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors flex items-center gap-2 self-start"
        >
          <Plus className="w-4 h-4" /> Add Table
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: TableProperties, label: 'Total Tables', value: stats.total, color: 'text-slate-700', bg: 'bg-slate-50' },
          { icon: Wifi, label: 'Active', value: stats.active, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { icon: Users, label: 'Total Capacity', value: stats.capacity, color: 'text-orange-700', bg: 'bg-orange-50' },
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

      {/* QR URL info */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <QrCode className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="text-sm text-sky-900">
            <p className="font-medium mb-1">QR Code URL Format</p>
            <p className="text-sky-700 font-mono text-xs break-all">{orderBaseUrl}?table=<strong>TABLE_NUMBER</strong></p>
            <p className="text-sky-600 text-xs mt-1">
              Each table's QR code links directly to the ordering page with the table pre-selected.
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tables..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition-all"
        />
      </div>

      {/* Tables grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center">
          <TableProperties className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm text-slate-400">No tables found</p>
          <button onClick={openAdd} className="mt-3 text-sm text-orange-500 hover:underline font-medium">
            Add your first table
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((table) => (
            <div
              key={table.id}
              className={`bg-white rounded-2xl border overflow-hidden transition-shadow hover:shadow-md ${
                table.is_active ? 'border-slate-200' : 'border-slate-100 opacity-60'
              }`}
            >
              {/* QR Preview area */}
              <div
                className="h-36 bg-gradient-to-br from-slate-50 to-orange-50 flex items-center justify-center cursor-pointer relative group"
                onClick={() => openQR(table)}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 bg-white rounded-xl shadow-sm flex items-center justify-center border border-slate-100">
                    <QrCode className="w-8 h-8 text-slate-700" />
                  </div>
                  <span className="text-xs text-slate-500 font-medium">Click to view QR</span>
                </div>
                <div className="absolute inset-0 bg-orange-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-t-2xl" />
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      {table.name ?? `Table ${table.table_number}`}
                    </h3>
                    <p className="text-xs text-slate-500">#{table.table_number} · {table.capacity ?? 4} seats</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${
                    table.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {table.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <p className="text-xs text-slate-400 font-mono truncate mb-3">
                  /order?table={table.table_number}
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => openQR(table)}
                    className="flex-1 py-2 bg-orange-50 text-orange-600 rounded-lg text-xs font-medium hover:bg-orange-100 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <QrCode className="w-3.5 h-3.5" /> QR Code
                  </button>
                  <button
                    onClick={() => toggleActive(table)}
                    className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                    title={table.is_active ? 'Deactivate' : 'Activate'}
                  >
                    {table.is_active ? <ToggleRight className="w-4 h-4 text-emerald-500" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(table)}
                    className="p-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteTable(table)}
                    className="p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {editingTable ? 'Edit Table' : 'Add Table'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={saveTable} className="p-6 space-y-4">
              {error && (
                <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">
                  {error}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Table Number *</label>
                  <input
                    type="number" required min="1" value={form.table_number}
                    onChange={(e) => setForm({ ...form, table_number: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1.5 block">Capacity (seats)</label>
                  <input
                    type="number" min="1" max="50" value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1.5 block">Display Name</label>
                <input
                  type="text" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`Table ${form.table_number}`}
                  className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
                />
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox" checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="w-4 h-4 rounded accent-orange-500"
                />
                <span className="text-sm text-slate-700">Table is active (visible for ordering)</span>
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
                  {editingTable ? 'Save Changes' : 'Add Table'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setQrModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-scale-in">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">
                {qrModal.name ?? `Table ${qrModal.table_number}`} — QR Code
              </h3>
              <button onClick={() => setQrModal(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-center">
                {qrDataUrl ? (
                  <div className="p-4 bg-white rounded-2xl border-2 border-slate-100 shadow-inner">
                    <img src={qrDataUrl} alt="QR Code" className="w-56 h-56" />
                  </div>
                ) : (
                  <div className="w-56 h-56 flex items-center justify-center bg-slate-50 rounded-2xl">
                    <div className="w-8 h-8 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold text-slate-900 mb-0.5">
                  Scan to order at {qrModal.name ?? `Table ${qrModal.table_number}`}
                </div>
                <div className="text-xs text-slate-400 font-mono break-all">
                  {orderBaseUrl}?table={qrModal.table_number}
                </div>
              </div>
              <canvas ref={canvasRef} className="hidden" />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => downloadQR(qrModal)}
                  disabled={!qrDataUrl}
                  className="py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
                <button
                  onClick={() => printQR(qrModal)}
                  disabled={!qrDataUrl}
                  className="py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
                  🖨️ Print
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
