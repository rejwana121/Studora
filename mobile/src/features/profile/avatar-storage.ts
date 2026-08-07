import { supabase } from '@/lib/supabase';

/**
 * Direct-to-Storage avatar upload/remove/render, scoped by the caller's own
 * Supabase session (RLS on `storage.objects` enforces ownership server-side
 * — see backend Checkpoint 2B — so this module never needs a service key).
 */

const BUCKET = 'profile-avatars';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — regenerated on demand, never persisted

export function isAllowedAvatarMimeType(mimeType: string | null | undefined): mimeType is AllowedMimeType {
  return !!mimeType && (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function isAvatarFileTooLarge(fileSizeBytes: number | null | undefined): boolean {
  return typeof fileSizeBytes === 'number' && fileSizeBytes > MAX_BYTES;
}

/** No extension — matches the backend's exact accepted `ProfileUpdate.avatar_path`
 * shape (`<uuid>/avatar`). MIME is carried as Storage object metadata instead. */
export function avatarPathFor(userId: string): string {
  return `${userId}/avatar`;
}

export type StorageResult = { ok: true } | { ok: false; message: string };

/** Uploads to the fixed per-user key with `upsert: true`, so a re-upload
 * overwrites the previous photo in place — no orphaned old files, no
 * separate cleanup step. Reads the picked file via `fetch` (not
 * expo-file-system, which isn't a direct project dependency) — the
 * standard React Native pattern for turning a local `file://`/`content://`
 * URI into binary data. */
export async function uploadAvatar(
  userId: string,
  localUri: string,
  mimeType: AllowedMimeType
): Promise<StorageResult> {
  try {
    const response = await fetch(localUri);
    const arrayBuffer = await response.arrayBuffer();

    const { error } = await supabase.storage.from(BUCKET).upload(avatarPathFor(userId), arrayBuffer, {
      contentType: mimeType,
      upsert: true,
    });

    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}

/** Treats "object already missing" as success — the end state (no object
 * at this path) is identical to a successful delete, so a retry or a
 * second remove attempt is safe. */
export async function removeAvatar(userId: string): Promise<StorageResult> {
  const { data, error } = await supabase.storage.from(BUCKET).remove([avatarPathFor(userId)]);

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes('not found') || message.includes('does not exist')) {
      return { ok: true };
    }
    return { ok: false, message: error.message };
  }

  // Some Storage backends return an empty `data` array (no error) when the
  // key didn't exist rather than throwing — also a safe no-op success.
  void data;
  return { ok: true };
}

/** Never persist the result — signed URLs expire. Callers regenerate this
 * on load/focus and hold it only in memory. Returns `null` on any failure
 * so callers can fall back to initials without surfacing a hard error for
 * what is, from the user's perspective, just "no photo shown right now". */
export async function getAvatarSignedUrl(avatarPath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(avatarPath, SIGNED_URL_TTL_SECONDS);

  if (error || !data) return null;
  return data.signedUrl;
}

export const AVATAR_MAX_BYTES = MAX_BYTES;
export const AVATAR_ALLOWED_MIME_TYPES = ALLOWED_MIME_TYPES;
