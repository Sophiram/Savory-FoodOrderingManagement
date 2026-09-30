import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  DollarSign,
  ShoppingBag,
  CreditCard,
  QrCode,
  Banknote,
  Download,
  Calendar,
  RefreshCw,
  Utensils,
  Truck,
  CheckCircle2,
  Percent,
  Layers,
  ArrowUpRight,
  Loader2
} from 'lucide-react';
import {
  fetchReportsSummary,
  getReportsExportCsvUrl,
  type ReportsSummary
} from '@/lib/api';

export default function ReportsPage() {
  const [rangeType, setRangeType] = useState('7days');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const summary = await fetchReportsSummary(
        rangeType,
        rangeType === 'custom' ? customStart : undefined,
        rangeType === 'custom' ? customEnd : undefined
      );
      setData(summary);
    } catch (err) {
      console.error('Failed to load report summary:', err);
    } finally {
      setLoading(false);
    }
  }, [rangeType, customStart, customEnd]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const maxDailyRevenue = Math.max(
    1,
    ...(data?.daily_trends.map((d) => d.revenue) || [100])
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <BarChart3 className="w-7 h-7 text-orange-500" />
            Financial & Sales Reports
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Revenue tracking, payment breakdown, sales trends, and order channels.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <a
            href={getReportsExportCsvUrl(
              rangeType === 'custom' ? customStart : undefined,
              rangeType === 'custom' ? customEnd : undefined
            )}
            download
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </a>

          <button
            onClick={() => loadReport()}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-50 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: '7days', label: 'Last 7 Days' },
            { id: '30days', label: 'Last 30 Days' },
            { id: 'this_month', label: 'This Month' },
            { id: 'all', label: 'All Time' },
            { id: 'custom', label: 'Custom' },
          ].map((preset) => (
            <button
              key={preset.id}
              onClick={() => setRangeType(preset.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                rangeType === preset.id
                  ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {rangeType === 'custom' && (
          <div className="flex items-center gap-2 w-full md:w-auto">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl"
            />
          </div>
        )}

        <div className="text-xs font-mono text-slate-400 hidden lg:block">
          {data ? `${data.start_date} → ${data.end_date}` : ''}
        </div>
      </div>

      {loading && !data ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
          <span className="text-xs text-slate-400 font-semibold">Compiling business analytics...</span>
        </div>
      ) : data ? (
        <>
          {/* Key Metric KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Gross Sales</span>
                <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600">
                  <DollarSign className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                ${data.kpis.gross_revenue.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Net: <strong className="text-slate-700">${data.kpis.net_revenue.toFixed(2)}</strong> (after discounts)
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Orders</span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                  <ShoppingBag className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                {data.kpis.total_orders}
              </div>
              <div className="text-[11px] text-emerald-600 font-medium mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {data.kpis.paid_orders} paid orders
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Average Ticket (AOV)</span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                ${data.kpis.average_order_value.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Avg spent per placed order
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Delivery & Discounts</span>
                <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                  <Percent className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 mt-2">
                -${data.kpis.total_discount.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                +${data.kpis.total_delivery_fee.toFixed(2)} delivery revenue
              </div>
            </div>
          </div>

          {/* Revenue Trends Chart */}
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-500" />
                  Revenue Trends Over Time
                </h3>
                <p className="text-xs text-slate-400">Daily gross revenue breakdown.</p>
              </div>
            </div>

            {data.daily_trends.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-xs text-slate-400">
                No orders recorded for this time range.
              </div>
            ) : (
              <div className="pt-4">
                <div className="h-48 flex items-end gap-2 sm:gap-4 justify-between border-b border-slate-100 pb-2">
                  {data.daily_trends.map((day) => {
                    const heightPct = Math.max(8, (day.revenue / maxDailyRevenue) * 100);
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative">
                        {/* Tooltip */}
                        <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none whitespace-nowrap z-20">
                          ${day.revenue.toFixed(2)} ({day.orders} orders)
                        </div>

                        {/* Bar */}
                        <div
                          className="w-full max-w-[40px] bg-gradient-to-t from-orange-500 to-amber-400 rounded-t-lg transition-all duration-500 group-hover:from-orange-600 group-hover:to-amber-500"
                          style={{ height: `${heightPct}%` }}
                        />

                        {/* Date label */}
                        <span className="text-[10px] font-mono text-slate-400 truncate max-w-full">
                          {day.date.slice(5)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Breakdown Section: Payment Methods & Order Types */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Payment Method Distribution */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-orange-500" />
                    Payment Method Share
                  </h3>
                  <p className="text-xs text-slate-400">KHQR Bakong vs Cash on Delivery vs Card.</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {data.payment_methods.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">No payment data available.</div>
                ) : (
                  data.payment_methods.map((pm) => {
                    const isKhqr = pm.method === 'khqr';
                    const isCash = pm.method === 'cash';
                    return (
                      <div key={pm.method} className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            {isKhqr ? <QrCode className="w-4 h-4 text-orange-500" />
                              : isCash ? <Banknote className="w-4 h-4 text-emerald-600" />
                              : <CreditCard className="w-4 h-4 text-blue-600" />}
                            <span className="uppercase">{pm.method}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-extrabold text-slate-900">${pm.revenue.toFixed(2)}</span>
                            <span className="text-[11px] text-slate-400 ml-1.5">({pm.percentage}%)</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-200/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isKhqr ? 'bg-orange-500' : isCash ? 'bg-emerald-500' : 'bg-blue-500'
                            }`}
                            style={{ width: `${pm.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Order Type Distribution */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-orange-500" />
                    Channel & Order Type Split
                  </h3>
                  <p className="text-xs text-slate-400">Dine-in (Table QR) vs Delivery.</p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {data.order_types.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">No channel data available.</div>
                ) : (
                  data.order_types.map((ot) => {
                    const isDelivery = ot.type === 'delivery';
                    return (
                      <div key={ot.type} className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 font-bold text-slate-800">
                            {isDelivery ? <Truck className="w-4 h-4 text-blue-500" /> : <Utensils className="w-4 h-4 text-orange-500" />}
                            <span className="capitalize">{ot.type.replace('_', ' ')}</span>
                            <span className="text-[10px] text-slate-400">({ot.count} orders)</span>
                          </div>
                          <div className="text-right">
                            <span className="font-extrabold text-slate-900">${ot.revenue.toFixed(2)}</span>
                            <span className="text-[11px] text-slate-400 ml-1.5">({ot.percentage}%)</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-200/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isDelivery ? 'bg-blue-500' : 'bg-orange-500'}`}
                            style={{ width: `${ot.percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Top 10 Best-Selling Items */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Utensils className="w-4 h-4 text-orange-500" />
                  Top 10 Best-Selling Dishes
                </h3>
                <p className="text-xs text-slate-400">Most ordered items and highest revenue generators.</p>
              </div>
            </div>

            {data.top_items.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">No dish sales recorded in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <th className="py-3 px-3">#</th>
                      <th className="py-3 px-3">Dish Name</th>
                      <th className="py-3 px-3 text-center">Units Sold</th>
                      <th className="py-3 px-3 text-right">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.top_items.map((item, idx) => (
                      <tr key={item.menu_item_id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center font-black text-[11px] ${
                            idx === 0 ? 'bg-amber-100 text-amber-700'
                              : idx === 1 ? 'bg-slate-200 text-slate-700'
                              : idx === 2 ? 'bg-orange-100 text-orange-700'
                              : 'text-slate-400'
                          }`}>
                            {idx + 1}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-900">{item.name}</td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700">{item.quantity_sold} sold</td>
                        <td className="py-3 px-3 text-right font-black text-slate-900">${item.revenue.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
