import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { ReactNode } from 'react';
import { requireSupabase, supabase } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('Unable to restore the authentication session.', error);
      setSession(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    loading,
    async signIn(email, password) {
      const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
      if (error) throw error;
    },
    async signUp(email, password, displayName) {
      const { error } = await requireSupabase().auth.signUp({
        email,
        password,
        options: { data: { display_name: displayName } },
      });
      if (error) throw error;
    },
    async signOut() {
      const { error } = await requireSupabase().auth.signOut();
      if (error) throw error;
    },
    async resetPassword(email) {
      const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}${window.location.pathname}#/reset-password`,
      });
      if (error) throw error;
    },
    async updatePassword(password) {
      const { error } = await requireSupabase().auth.updateUser({ password });
      if (error) throw error;
    },
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider.');
  return context;
}
