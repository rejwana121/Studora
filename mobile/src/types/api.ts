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
