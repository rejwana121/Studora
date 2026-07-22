/**
 * Typed access to build-time environment variables.
 * Expo inlines any `EXPO_PUBLIC_*` variable from `.env` at build time —
 * see mobile/.env.example for the required placeholder keys.
 * No real credentials exist in this repository; Phase 3 wires real values
 * into a local, gitignored `.env`.
 */
export const env = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
} as const;
