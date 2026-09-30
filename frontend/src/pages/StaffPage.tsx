import { useEffect, useState } from 'react';
import { supabase, type Profile, type UserRole } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  Users, Shield, UserCog, Search, ShieldCheck, User as UserIcon,
  Crown, Filter,
} from 'lucide-react';

type ProfileWithEmail = Profile & { email?: string };

const roleConfig: Record<UserRole, { label: string; color: string; icon: typeof Shield }> = {
  admin: { label: 'Admin', color: 'bg-rose-50 text-rose-700 border-rose-200', icon: Shield },
  manager: { label: 'Manager', color: 'bg-purple-50 text-purple-700 border-purple-200', icon: Crown },
  staff: { label: 'Staff', color: 'bg-sky-50 text-sky-700 border-sky-200', icon: UserCog },
  customer: { label: 'Customer', color: 'bg-slate-50 text-slate-600 border-slate-200', icon: UserIcon },
};

export default function StaffPage() {
  const { profile: currentProfile, refreshProfile } = useAuth();
  const [profiles, setProfiles] = useState<ProfileWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      // Fetch profiles
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error || !profileData) {
        setLoading(false);
        return;
      }

      // Try to fetch user emails via admin RPC (only works if user is admin with service role)
      // We'll do best-effort: show email from auth if available
      const profilesWithEmail: ProfileWithEmail[] = profileData as ProfileWithEmail[];
      setProfiles(profilesWithEmail);
      setLoading(false);
    }
    load();
  }, []);

  const changeRole = async (profileId: string, newRole: UserRole) => {
    setUpdating(profileId);
    await supabase.from('profiles').update({ role: newRole }).eq('id', profileId);
    setProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, role: newRole } : p))
    );
    if (profileId === currentProfile?.id) refreshProfile();
    setUpdating(null);
  };

  const allRoles: UserRole[] = ['admin', 'manager', 'staff', 'customer'];

  const filtered = profiles.filter((p) => {
    const matchesSearch =
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      p.id.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || p.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const counts = {
    all: profiles.length,
    admin: profiles.filter((p) => p.role === 'admin').length,
    manager: profiles.filter((p) => p.role === 'manager').length,
    staff: profiles.filter((p) => p.role === 'staff').length,
    customer: profiles.filter((p) => p.role === 'customer').length,
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
      <div>
        <h2 className="text-xl font-bold text-slate-900">Staff & User Management</h2>
        <p className="text-sm text-slate-500 mt-0.5">Manage user roles and access levels across your team</p>
      </div>

      {/* Role summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {allRoles.map((role) => {
          const config = roleConfig[role];
          const Icon = config.icon;
          return (
            <div key={role} className="bg-white rounded-2xl border border-slate-200 p-4">
              <div className={`w-8 h-8 rounded-lg border ${config.color} flex items-center justify-center mb-2`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-slate-900">{counts[role]}</div>
              <div className="text-xs text-slate-500">{config.label}s</div>
            </div>
          );
        })}
      </div>

      {/* Permission info */}
      <div className="bg-sky-50 border border-sky-200 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="text-sm text-sky-900">
            <p className="font-medium mb-1">Role Permissions</p>
            <ul className="space-y-0.5 text-sky-800">
              <li>• <strong>Admin</strong> — Full access including staff management, settings, coupons</li>
              <li>• <strong>Manager</strong> — Dashboard, orders, menu, coupons, settings (no staff management)</li>
              <li>• <strong>Staff</strong> — Can manage orders and menu items only</li>
              <li>• <strong>Customer</strong> — Can browse the menu and place orders only</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Search & filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
            className="pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 cursor-pointer"
          >
            <option value="all">All roles ({counts.all})</option>
            {allRoles.map((role) => (
              <option key={role} value={role}>
                {roleConfig[role].label} ({counts[role]})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">No users found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 sm:px-6 py-3">User</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 hidden md:table-cell">Joined</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Role</th>
                  <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3">Change Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((p) => {
                  const config = roleConfig[p.role];
                  const Icon = config.icon;
                  const isSelf = p.id === currentProfile?.id;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                            {p.full_name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                              <span className="truncate">{p.full_name || 'Unnamed'}</span>
                              {isSelf && <span className="text-xs text-slate-400 font-normal shrink-0">(You)</span>}
                            </div>
                            {p.phone && (
                              <div className="text-xs text-slate-400 truncate">{p.phone}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        <div className="text-xs text-slate-500">
                          {new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${config.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <select
                          value={p.role}
                          onChange={(e) => changeRole(p.id, e.target.value as UserRole)}
                          disabled={updating === p.id || isSelf}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          <option value="admin">Admin</option>
                          <option value="manager">Manager</option>
                          <option value="staff">Staff</option>
                          <option value="customer">Customer</option>
                        </select>
                        {updating === p.id && (
                          <span className="ml-2 inline-block w-4 h-4 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin align-middle" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        You cannot change your own role. At least one admin must always exist.
      </p>
    </div>
  );
}
