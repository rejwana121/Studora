import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * expo-secure-store persists to the OS keychain/keystore, never plaintext
 * AsyncStorage (docs/phase1/14-security-privacy-plan.md §14.1). Supabase
 * session payloads (access + refresh token) can exceed a single SecureStore
 * item's practical size limit, so large values are split across numbered
 * chunk keys and reassembled on read — everything still lives in SecureStore
 * only, nothing falls back to unencrypted storage.
 *
 * SecureStore has no web implementation at all (no OS keychain in a browser).
 * `localStorage` is not used as a substitute — it is plaintext and
 * script-readable, the same risk the security plan excludes AsyncStorage for.
 * Web instead keeps the session in a module-level in-memory Map: it never
 * touches disk, so a page refresh signs the user out on web by design for
 * MVP security. Native (iOS/Android) keeps the real persisted session via
 * SecureStore below.
 */

const CHUNK_SIZE = 1800;
const CHUNK_COUNT_SUFFIX = '__chunks';

function chunkKey(key: string, index: number): string {
  return `${key}__${index}`;
}

const nativeSecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    if (countRaw === null) return null;

    const count = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count <= 0) return null;

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    await nativeSecureStorageAdapter.removeItem(key);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    await SecureStore.setItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`, String(chunks.length));
    await Promise.all(
      chunks.map((chunk, index) => SecureStore.setItemAsync(chunkKey(key, index), chunk))
    );
  },

  async removeItem(key: string): Promise<void> {
    const countRaw = await SecureStore.getItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`);
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;

    await Promise.all([
      SecureStore.deleteItemAsync(`${key}${CHUNK_COUNT_SUFFIX}`),
      ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i))),
    ]);
  },
};

const webMemoryStore = new Map<string, string>();

const webStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    return webMemoryStore.get(key) ?? null;
  },
  async setItem(key: string, value: string): Promise<void> {
    webMemoryStore.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    webMemoryStore.delete(key);
  },
};

export const secureStorageAdapter =
  Platform.OS === 'web' ? webStorageAdapter : nativeSecureStorageAdapter;
