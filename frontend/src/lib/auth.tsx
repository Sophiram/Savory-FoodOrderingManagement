import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, type Profile, type UserRole } from './supabase';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updateProfile: (data: Partial<Profile>) => Promise<{ error: string | null }>;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('Profile fetch error:', error.message);
      }
      
      let merged = (data as Profile) || {
        id: userId,
        full_name: '',
        role: 'customer',
        avatar_url: null,
        created_at: new Date().toISOString(),
      };

      try {
        const cached = localStorage.getItem(`profile_${userId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          merged = {
            ...merged,
            phone: merged.phone || parsed.phone || '',
            address: merged.address || parsed.address || '',
          };
        }
      } catch {}

      setProfile(merged);
    } catch (err) {
      console.error('Profile fetch error:', err);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        if (session?.user) {
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Sign in failed' };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    phone?: string
  ) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone || '',
          },
        },
      });

      if (error) return { error: error.message };

      if (data.user) {
        // Ensure profile record is inserted/updated
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: fullName,
          role: 'customer' as UserRole,
          phone: phone || null,
        });
      }

      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Sign up failed' };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      return { error: error?.message ?? null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Password reset failed' };
    }
  };

  const updateProfile = async (data: Partial<Profile>) => {
    if (!session?.user) return { error: 'Not authenticated' };
    try {
      // First try updating full data
      let { error } = await supabase
        .from('profiles')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id);

      // If 'address' or 'phone' or 'schema cache' is missing in Supabase schema:
      if (error && (error.message.includes('address') || error.message.includes('phone') || error.message.includes('schema cache') || error.message.includes('PGRST204'))) {
        console.warn('Supabase profiles table missing columns, retrying with core fields:', error.message);
        const { address, phone, ...coreData }: any = data;
        ({ error } = await supabase
          .from('profiles')
          .update(coreData)
          .eq('id', session.user.id));
      }

      // Save to localStorage so delivery address and phone are always remembered!
      const updated = { ...(profile || {}), ...data } as Profile;
      try {
        localStorage.setItem(`profile_${session.user.id}`, JSON.stringify(updated));
      } catch {}

      setProfile(updated);
      return { error: null };
    } catch (err) {
      const updated = { ...(profile || {}), ...data } as Profile;
      setProfile(updated);
      return { error: null };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  const refreshProfile = async () => {
    if (session?.user) await fetchProfile(session.user.id);
  };

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager' || isAdmin;
  const isStaff = profile?.role === 'staff' || isManager;

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updateProfile,
        refreshProfile,
        isAdmin,
        isManager,
        isStaff,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
