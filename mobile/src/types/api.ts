/** Shared API types — mirrors docs/phase1/10-api-contract.md §10.14 error contract. */

export interface ApiError {
  error: {
    code: string;
    message: string;
    field: string | null;
  };
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError['error']; status: number };

/** Mirrors docs/phase1/09-data-dictionary.md §9.1. */
export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  study_preferences: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdate {
  display_name?: string;
  timezone?: string;
  study_preferences?: Record<string, unknown>;
}
