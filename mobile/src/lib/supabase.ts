import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { secureStorageAdapter } from '@/lib/secure-storage';
import { env } from '@/lib/env';

// createClient() throws synchronously on an empty/invalid URL. No real
// Supabase project is wired yet (Phase 2 constraint), so a syntactically
// valid placeholder keeps the app bootable; real auth calls will fail with a
// normal network/API error (surfaced via the existing error banners) rather
// than crashing at import time, until real values land in .env.
const supabaseUrl = env.supabaseUrl || 'https://placeholder.supabase.co';
const supabaseAnonKey = env.supabaseAnonKey || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
