import { useEffect, useState } from 'react';
import type { RestaurantSettings } from '@/lib/supabase';
import { fetchRestaurantSettings, updateRestaurantSettings, testTelegramNotification } from '@/lib/api';
import {
  Store, Clock, Phone, Mail, MapPin, DollarSign, Percent,
  Package, Save, ChevronRight, ToggleLeft, ToggleRight,
  ShoppingBag, Send, Bell, Bot, Eye, EyeOff,
  CheckCircle2, AlertCircle, HelpCircle, Sparkles
} from 'lucide-react';

type SettingsForm = {
  name: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  opening_time: string;
  closing_time: string;
  delivery_fee: string;
  min_delivery_order: string;
  tax_rate: string;
  currency: string;
  currency_symbol: string;
  default_prep_time: string;
  is_order_acceptance_open: boolean;
  is_pickup_enabled: boolean;
  is_delivery_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  telegram_bot_username: string;
  telegram_notifications_enabled: boolean;
  notify_on_new_order: boolean;
  notify_on_payment: boolean;
  notify_on_status_change: boolean;
  notify_on_low_stock: boolean;
};

const defaultForm: SettingsForm = {
  name: 'Savory Restaurant',
  tagline: 'Fresh & Delicious',
  phone: '',
  email: '',
  address: '',
  opening_time: '08:00',
  closing_time: '22:00',
  delivery_fee: '2.50',
  min_delivery_order: '5.00',
  tax_rate: '0',
  currency: 'USD',
  currency_symbol: '$',
  default_prep_time: '20',
  is_order_acceptance_open: true,
  is_pickup_enabled: true,
  is_delivery_enabled: true,
  telegram_bot_token: '',
  telegram_chat_id: '',
  telegram_bot_username: '@savoryfood_bot',
  telegram_notifications_enabled: true,
  notify_on_new_order: true,
  notify_on_payment: true,
  notify_on_status_change: true,
  notify_on_low_stock: true,
};

function Section({
  title,
  icon: Icon,
  badge,
  children
}: {
  title: string;
  icon: typeof Store;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
            <Icon className="w-4 h-4 text-orange-500" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        {badge}
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, tooltip, children }: { label: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {tooltip && (
          <span className="text-xs text-slate-400 cursor-help" title={tooltip}>
            <HelpCircle className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition-all bg-white"
    />
  );
}

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: () => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="flex items-center justify-between w-full py-3 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-left"
    >
      <div>
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {description && <div className="text-xs text-slate-400 mt-0.5">{description}</div>}
      </div>
      {checked
        ? <ToggleRight className="w-6 h-6 text-emerald-500 flex-shrink-0" />
        : <ToggleLeft className="w-6 h-6 text-slate-400 flex-shrink-0" />
      }
    </button>
  );
}

export default function RestaurantSettingsPage() {
  const [form, setForm] = useState<SettingsForm>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Telegram test states
  const [testingBot, setTestingBot] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; bot_username?: string } | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchRestaurantSettings();
        if (data) {
          setForm({
            name: data.name ?? '',
            tagline: data.tagline ?? '',
            phone: data.phone ?? '',
            email: data.email ?? '',
            address: data.address ?? '',
            opening_time: data.opening_time ?? '08:00',
            closing_time: data.closing_time ?? '22:00',
            delivery_fee: String(data.delivery_fee ?? '2.50'),
            min_delivery_order: String(data.min_delivery_order ?? '5.00'),
            tax_rate: String(data.tax_rate ?? '0'),
            currency: data.currency ?? 'USD',
            currency_symbol: data.currency_symbol ?? '$',
            default_prep_time: String(data.default_prep_time ?? '20'),
            is_order_acceptance_open: data.is_order_acceptance_open ?? true,
            is_pickup_enabled: data.is_pickup_enabled ?? true,
            is_delivery_enabled: data.is_delivery_enabled ?? true,
            telegram_bot_token: data.telegram_bot_token ?? '',
            telegram_chat_id: data.telegram_chat_id ?? '',
            telegram_bot_username: data.telegram_bot_username ?? '@savoryfood_bot',
            telegram_notifications_enabled: data.telegram_notifications_enabled ?? true,
            notify_on_new_order: data.notify_on_new_order ?? true,
            notify_on_payment: data.notify_on_payment ?? true,
            notify_on_status_change: data.notify_on_status_change ?? true,
            notify_on_low_stock: data.notify_on_low_stock ?? true,
          });
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);

    const payload: Partial<RestaurantSettings> = {
      name: form.name,
      tagline: form.tagline || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      opening_time: form.opening_time || undefined,
      closing_time: form.closing_time || undefined,
      delivery_fee: parseFloat(form.delivery_fee) || 0,
      min_delivery_order: form.min_delivery_order ? parseFloat(form.min_delivery_order) : undefined,
      tax_rate: parseFloat(form.tax_rate) || 0,
      currency: form.currency || 'USD',
      currency_symbol: form.currency_symbol || '$',
      default_prep_time: parseInt(form.default_prep_time) || 20,
      is_order_acceptance_open: form.is_order_acceptance_open,
      is_pickup_enabled: form.is_pickup_enabled,
      is_delivery_enabled: form.is_delivery_enabled,
      telegram_bot_token: form.telegram_bot_token,
      telegram_chat_id: form.telegram_chat_id,
      telegram_bot_username: form.telegram_bot_username || '@savoryfood_bot',
      telegram_notifications_enabled: form.telegram_notifications_enabled,
      notify_on_new_order: form.notify_on_new_order,
      notify_on_payment: form.notify_on_payment,
      notify_on_status_change: form.notify_on_status_change,
      notify_on_low_stock: form.notify_on_low_stock,
    };

    const res = await updateRestaurantSettings(payload);

    if (res && res.error) {
      setError(res.error);
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
    setSaving(false);
  };

  const handleTestTelegram = async () => {
    setTestingBot(true);
    setTestResult(null);
    try {
      const res = await testTelegramNotification(
        form.telegram_bot_token,
        form.telegram_chat_id
      );
      setTestResult(res);
      if (res.bot_username && res.bot_username !== form.telegram_bot_username) {
        setForm((prev) => ({ ...prev, telegram_bot_username: res.bot_username! }));
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Error occurred while dispatching test message.',
      });
    } finally {
      setTestingBot(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  const isConfigured = Boolean(
    form.telegram_bot_token &&
    form.telegram_chat_id &&
    !form.telegram_bot_token.includes('your-') &&
    !form.telegram_chat_id.includes('your-')
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Restaurant Settings</h2>
          <p className="text-sm text-slate-500 mt-0.5">Configure your restaurant profile, ordering options, and Telegram alerts</p>
        </div>
        <button
          type="submit" disabled={saving}
          className="px-5 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2 self-start transition-all shadow-md shadow-orange-500/20 active:scale-95"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Save className="w-4 h-4" />
          }
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {saved && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Settings saved successfully!
        </div>
      )}
      {error && (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600" />
          {error}
        </div>
      )}

      {/* Telegram Notifications Section */}
      <Section
        title="Telegram Notifications"
        icon={Bot}
        badge={
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 font-mono font-medium rounded-full bg-sky-50 text-sky-700 border border-sky-200">
              {form.telegram_bot_username || '@savoryfood_bot'}
            </span>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              isConfigured
                ? form.telegram_notifications_enabled
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}>
              {isConfigured
                ? (form.telegram_notifications_enabled ? '● Active' : '○ Paused')
                : '○ Not Configured'}
            </span>
          </div>
        }
      >
        <div className="bg-gradient-to-r from-sky-50 to-blue-50/50 rounded-xl p-4 border border-sky-100 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-600" />
              <h4 className="text-sm font-semibold text-slate-800">
                Instant Telegram Alerts via {form.telegram_bot_username || '@savoryfood_bot'}
              </h4>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Receive live notifications on orders, customer dine-in orders, Bakong KHQR payment confirmations, and kitchen status updates directly in Telegram.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="text-xs font-medium text-sky-700 hover:text-sky-800 underline whitespace-nowrap pt-0.5"
          >
            {showGuide ? 'Hide Guide' : 'Setup Guide'}
          </button>
        </div>

        {showGuide && (
          <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-2 text-xs text-slate-700 animate-fadeIn">
            <div className="font-semibold text-slate-900 mb-1">Quick 3-Minute Setup:</div>
            <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
              <li>
                Open Telegram and message <b>@BotFather</b>. Send <code>/newbot</code> or <code>/token</code> to get the API token for your bot (e.g. <b>@savoryfood_bot</b>).
              </li>
              <li>
                Paste your bot's <b>Bot Token</b> in the field below.
              </li>
              <li>
                Open <b>{form.telegram_bot_username || '@savoryfood_bot'}</b> in Telegram and press <b>Start</b> (or add it to your restaurant staff group).
              </li>
              <li>
                Find your numeric Chat ID: Message <b>@userinfobot</b> on Telegram to get your user ID, or add the bot to your Telegram group and paste the group Chat ID (e.g. <code>-100...</code>).
              </li>
              <li>
                Click <b>Send Test Notification</b> below to verify live delivery!
              </li>
            </ol>
          </div>
        )}

        {/* Master Notification Toggle */}
        <Toggle
          checked={form.telegram_notifications_enabled}
          onChange={() => setForm({ ...form, telegram_notifications_enabled: !form.telegram_notifications_enabled })}
          label="Enable Telegram Notifications"
          description="Global toggle for all restaurant alerts sent via Telegram bot"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <Field label="Bot Username" tooltip="The handle of your Telegram bot, e.g. @savoryfood_bot">
            <div className="relative">
              <Bot className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={form.telegram_bot_username}
                onChange={(e) => setForm({ ...form, telegram_bot_username: e.target.value })}
                placeholder="@savoryfood_bot"
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 font-mono"
              />
            </div>
          </Field>

          <Field label="Telegram Chat ID / Group ID *" tooltip="Your Telegram User ID or Group Chat ID where alerts should be sent">
            <div className="relative">
              <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={form.telegram_chat_id}
                onChange={(e) => setForm({ ...form, telegram_chat_id: e.target.value })}
                placeholder="e.g. 987654321 or -100123456789"
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 font-mono"
              />
            </div>
          </Field>
        </div>

        <Field label="Telegram Bot API Token *" tooltip="Issued by @BotFather on Telegram (e.g. 123456789:ABCdef...)">
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={form.telegram_bot_token}
              onChange={(e) => setForm({ ...form, telegram_bot_token: e.target.value })}
              placeholder="Paste token from @BotFather (e.g. 7123456789:AAH...)"
              className="w-full pl-3.5 pr-10 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Stored securely in your server settings and environment. Never shared publicly.
          </p>
        </Field>

        {/* Individual Notification Event Toggles */}
        <div className="pt-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
            Notification Event Triggers
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Toggle
              checked={form.notify_on_new_order}
              onChange={() => setForm({ ...form, notify_on_new_order: !form.notify_on_new_order })}
              label="🍽️ New Order Received"
              description="Dine-in table, pickup & delivery orders"
            />
            <Toggle
              checked={form.notify_on_payment}
              onChange={() => setForm({ ...form, notify_on_payment: !form.notify_on_payment })}
              label="💳 Payment Confirmed"
              description="Bakong KHQR and counter cash updates"
            />
            <Toggle
              checked={form.notify_on_status_change}
              onChange={() => setForm({ ...form, notify_on_status_change: !form.notify_on_status_change })}
              label="👨‍🍳 Order Status Updates"
              description="Cooking, Ready, Out for delivery, Cancelled"
            />
            <Toggle
              checked={form.notify_on_low_stock}
              onChange={() => setForm({ ...form, notify_on_low_stock: !form.notify_on_low_stock })}
              label="⚠️ Low Stock Inventory"
              description="Dishes that reach minimum thresholds"
            />
          </div>
        </div>

        {/* Test Connection Button & Result */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleTestTelegram}
            disabled={testingBot || !form.telegram_bot_token || !form.telegram_chat_id}
            className="px-4 py-2.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-xl text-xs font-semibold hover:bg-sky-100 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95"
          >
            {testingBot ? (
              <div className="w-3.5 h-3.5 border-2 border-sky-400 border-t-sky-700 rounded-full animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 text-sky-600" />
            )}
            {testingBot ? 'Pinging Telegram API...' : `Send Test Message to ${form.telegram_bot_username || '@savoryfood_bot'}`}
          </button>

          {testResult && (
            <div className={`px-3 py-2 rounded-xl text-xs flex items-center gap-2 flex-1 animate-fadeIn ${
              testResult.success
                ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                : 'bg-rose-50 border border-rose-200 text-rose-700'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-600" />
              )}
              <span className="leading-snug">{testResult.message}</span>
            </div>
          )}
        </div>
      </Section>

      {/* Restaurant Info */}
      <Section title="Restaurant Information" icon={Store}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Restaurant Name *">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Savory Restaurant" />
          </Field>
          <Field label="Tagline">
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Fresh & Delicious" />
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Phone Number">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+855 12 345 678"
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 bg-white"
              />
            </div>
          </Field>
          <Field label="Email Address">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="hello@savory.com"
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 bg-white"
              />
            </div>
          </Field>
        </div>
        <Field label="Address">
          <div className="relative">
            <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              placeholder="123 Main Street, Phnom Penh, Cambodia"
              className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 resize-none bg-white"
            />
          </div>
        </Field>
      </Section>

      {/* Operating Hours */}
      <Section title="Operating Hours" icon={Clock}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Opening Time">
            <Input
              type="time" value={form.opening_time}
              onChange={(e) => setForm({ ...form, opening_time: e.target.value })}
            />
          </Field>
          <Field label="Closing Time">
            <Input
              type="time" value={form.closing_time}
              onChange={(e) => setForm({ ...form, closing_time: e.target.value })}
            />
          </Field>
        </div>
        <div className="space-y-2">
          <Toggle
            checked={form.is_order_acceptance_open}
            onChange={() => setForm({ ...form, is_order_acceptance_open: !form.is_order_acceptance_open })}
            label={form.is_order_acceptance_open ? '✅ Accepting orders right now' : '🔴 Not accepting orders (manually paused)'}
          />
        </div>
      </Section>

      {/* Ordering Options */}
      <Section title="Ordering Options" icon={Package}>
        <div className="space-y-2">
          <Toggle
            checked={form.is_pickup_enabled}
            onChange={() => setForm({ ...form, is_pickup_enabled: !form.is_pickup_enabled })}
            label="Enable Pickup orders"
          />
          <Toggle
            checked={form.is_delivery_enabled}
            onChange={() => setForm({ ...form, is_delivery_enabled: !form.is_delivery_enabled })}
            label="Enable Delivery orders"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <Field label="Default Prep Time (minutes)">
            <Input
              type="number" min="1" step="1" value={form.default_prep_time}
              onChange={(e) => setForm({ ...form, default_prep_time: e.target.value })}
              placeholder="20"
            />
          </Field>
          <Field label="Delivery Fee ($)">
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="number" min="0" step="0.01" value={form.delivery_fee}
                onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })}
                className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 bg-white"
              />
            </div>
          </Field>
        </div>
        <Field label="Minimum Delivery Order ($)">
          <div className="relative">
            <ShoppingBag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="number" min="0" step="0.01" value={form.min_delivery_order}
              onChange={(e) => setForm({ ...form, min_delivery_order: e.target.value })}
              placeholder="No minimum"
              className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 bg-white"
            />
          </div>
        </Field>
      </Section>

      {/* Payment & Currency */}
      <Section title="Payment & Currency" icon={DollarSign}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency Code">
            <Input
              value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
              maxLength={3} placeholder="USD"
            />
          </Field>
          <Field label="Currency Symbol">
            <Input
              value={form.currency_symbol} onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })}
              maxLength={3} placeholder="$"
            />
          </Field>
        </div>
        <Field label="Tax Rate (%)">
          <div className="relative">
            <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="number" min="0" max="100" step="0.1" value={form.tax_rate}
              onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              placeholder="0"
              className="w-full pl-9 pr-3.5 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 bg-white"
            />
          </div>
          <p className="text-xs text-slate-400 mt-1">Set to 0 to disable tax. This is calculated server-side.</p>
        </Field>
      </Section>

      {/* Save button at bottom */}
      <div className="flex justify-end pb-4">
        <button
          type="submit" disabled={saving}
          className="px-6 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2 transition-all shadow-md shadow-orange-500/20 active:scale-95"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Save className="w-4 h-4" />
          }
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </form>
  );
}
