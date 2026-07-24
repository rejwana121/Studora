import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

export interface AuthResult {
  ok: boolean;
  message: string | null;
}

export interface SignUpResult extends AuthResult {
  session: Session | null;
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { ok: !error, message: error?.message ?? null, session: data.session };
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { ok: !error, message: error?.message ?? null };
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  return { ok: !error, message: error?.message ?? null };
}

export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { ok: !error, message: error?.message ?? null };
}
