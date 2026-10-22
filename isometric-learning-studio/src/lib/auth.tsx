import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './supabase';
import type { Profile } from '../types';

interface AuthState {
  session: Session | null; profile: Profile | null; loading: boolean; isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); return; }
    const { data } = await supabase.from('users').select('id,name,email,role').eq('id', s.user.id).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => { if (!alive) return; setSession(data.session); await loadProfile(data.session); if (alive) setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); void loadProfile(s); });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const value = useMemo<AuthState>(() => ({
    session, profile, loading, isAdmin: profile?.role === 'admin',
    async signIn(email, password) { const { error } = await supabase.auth.signInWithPassword({ email, password }); return error ? error.message : null; },
    async signUp(name, email, password) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
      if (error) return error.message;
      return data.session ? null : 'Check your email to confirm the account, then sign in.';
    },
    async signOut() { await supabase.auth.signOut(); }
  }), [session, profile, loading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth(): AuthState { const v = useContext(Ctx); if (!v) throw new Error('useAuth outside AuthProvider'); return v; }
