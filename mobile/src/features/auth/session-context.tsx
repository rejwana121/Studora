import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { getProfile, updateProfile } from '@/api/profile';
import { getAvatarSignedUrl } from '@/features/profile/avatar-storage';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/api';

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
  /** Loaded once per session (plus the one-time device-timezone sync below)
   * and shared by every screen — the single source of truth for
   * `display_name`/`avatar_path`, so Today and Profile can never disagree. */
  profile: Profile | null;
  isProfileLoading: boolean;
  profileError: string | null;
  /** Freshly generated from `profile.avatar_path` — never persisted, since
   * signed URLs expire. `null` when there's no photo or generation failed;
   * callers fall back to initials either way. */
  avatarSignedUrl: string | null;
  /** Refetches the profile row from the backend (e.g. after an external
   * change, or to recover from a load error). */
  refreshProfile: () => Promise<void>;
  /** Merges a known-good server response into local state without a round
   * trip — used right after a successful PATCH /profile, since the
   * response body is already the authoritative new row. */
  applyProfile: (next: Profile) => void;
  /** Regenerates the signed URL from the current `profile.avatar_path`
   * (e.g. after upload/remove, or if the previous URL expired). */
  refreshAvatarSignedUrl: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoading: true,
  profile: null,
  isProfileLoading: false,
  profileError: null,
  avatarSignedUrl: null,
  refreshProfile: async () => {},
  applyProfile: () => {},
  refreshAvatarSignedUrl: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);

  // Guards against the effect below re-fetching on every token refresh —
  // only a genuine user change (or sign-out -> sign-in) should refetch.
  const loadedForUserId = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession);
      setIsLoading(false);
      if (!nextSession) {
        loadedForUserId.current = null;
        setProfile(null);
        setProfileError(null);
        setAvatarSignedUrl(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = useCallback(async (currentSession: Session) => {
    setIsProfileLoading(true);
    const result = await getProfile(currentSession.access_token);
    if (!result.ok) {
      setProfileError(result.error.message);
      setIsProfileLoading(false);
      return;
    }

    let nextProfile = result.data;
    // Preserves the pre-existing device-timezone auto-sync behavior, now
    // run once per session here rather than in the Profile screen, so it
    // still happens even if the user never opens Profile.
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (deviceTimezone && deviceTimezone !== nextProfile.timezone) {
      const syncResult = await updateProfile(currentSession.access_token, { timezone: deviceTimezone });
      if (syncResult.ok) nextProfile = syncResult.data;
    }

    setProfile(nextProfile);
    setProfileError(null);
    setIsProfileLoading(false);
  }, []);

  useEffect(() => {
    if (!session) return;
    if (loadedForUserId.current === session.user.id) return;
    loadedForUserId.current = session.user.id;
    fetchProfile(session);
  }, [session, fetchProfile]);

  useEffect(() => {
    let isCurrent = true;
    if (!profile?.avatar_path) {
      setAvatarSignedUrl(null);
      return;
    }
    getAvatarSignedUrl(profile.avatar_path).then((url) => {
      if (isCurrent) setAvatarSignedUrl(url);
    });
    return () => {
      isCurrent = false;
    };
  }, [profile?.avatar_path]);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    await fetchProfile(session);
  }, [session, fetchProfile]);

  const applyProfile = useCallback((next: Profile) => {
    setProfile(next);
    setProfileError(null);
  }, []);

  const refreshAvatarSignedUrl = useCallback(async () => {
    if (!profile?.avatar_path) {
      setAvatarSignedUrl(null);
      return;
    }
    const url = await getAvatarSignedUrl(profile.avatar_path);
    setAvatarSignedUrl(url);
  }, [profile?.avatar_path]);

  return (
    <SessionContext.Provider
      value={{
        session,
        isLoading,
        profile,
        isProfileLoading,
        profileError,
        avatarSignedUrl,
        refreshProfile,
        applyProfile,
        refreshAvatarSignedUrl,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
