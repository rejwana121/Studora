import { env } from '../lib/env';
import type { ApiResult } from '../types/api';

/**
 * Typed API client skeleton (Phase 2 — Foundation only).
 * No domain endpoints are wired here yet; per-domain modules (subjects,
 * tasks, planner, sessions, workload, recommendations, notifications,
 * dashboard, plans, feedback) are added starting Phase 3+, each calling
 * `request()` below and matching docs/phase1/10-api-contract.md.
 *
 * Auth: the bearer token is attached once Supabase auth exists (Phase 3);
 * this client accepts an optional token now so callers don't need to change
 * shape later.
 */

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const response = await fetch(`${env.apiBaseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: json?.error ?? { code: 'UNKNOWN', message: 'Request failed', field: null },
      };
    }

    return { ok: true, data: json as T };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: { code: 'NETWORK_ERROR', message: (err as Error).message, field: null },
    };
  }
}
