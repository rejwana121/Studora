import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { secureStorageAdapter } from '@/lib/secure-storage';
import { env } from '@/lib/env';

// createClient() throws synchronously on an empty/invalid URL. No real
// Supabase project is wired yet (Phase 2 constraint), so a syntactically
// valid placeholder keeps the app bootable; real auth calls will fail with a
// normal network/API error (surfaced via the existing error banners) rather
// than crashing at import time, until real values land in .env.
const supabaseUrl = env.supabaseUrl || 'https://placeholder.supabase.co';
const supabaseAnonKey = env.supabaseAnonKey || 'placeholder-anon-key';

const isWeb = Platform.OS === 'web';

export interface WebAuthRedirect {
  /** True when the page was loaded from a Supabase auth redirect (email
   * confirmation, magic link, recovery) rather than a normal visit. */
  isConfirmation: boolean;
  /** Human-readable failure reason from the redirect, e.g. an expired or
   * already-used confirmation link. Null when the redirect carried no error. */
  errorDescription: string | null;
}

function parseWebAuthRedirect(href: string): WebAuthRedirect {
  const url = new URL(href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const searchParams = url.searchParams;

  const errorDescription =
    hashParams.get('error_description') ??
    searchParams.get('error_description') ??
    hashParams.get('error') ??
    searchParams.get('error');

  const isConfirmation =
    hashParams.has('access_token') ||
    searchParams.has('code') ||
    hashParams.has('type') ||
    searchParams.has('type') ||
    Boolean(errorDescription);

  return { isConfirmation, errorDescription };
}

// Captured once at module load — before Supabase's own detectSessionInUrl
// parsing strips the token hash from the address bar — so screens can still
// tell "this page load came from an email confirmation redirect" after the
// client cleans the URL. Native never has a URL to inspect here; confirmation
// links open in a browser, not inside the app.
export const initialWebAuthRedirect: WebAuthRedirect | null =
  isWeb && typeof window !== 'undefined' ? parseWebAuthRedirect(window.location.href) : null;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Web: Supabase's email-confirmation redirect carries the session as a
    // URL fragment (#access_token=...) that only the client can parse — it
    // must detect and consume it. Native has no such URL to parse.
    detectSessionInUrl: isWeb,
  },
});
