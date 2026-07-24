import { env } from '../lib/env';
import type { ApiResult } from '../types/api';

/**
 * Typed API client. Per-domain modules (profile now; subjects, tasks,
 * planner, sessions, workload, recommendations, notifications, dashboard,
 * plans, feedback in later phases) call `request()` below, matching
 * docs/phase1/10-api-contract.md. Callers pass the current Supabase session's
 * access token as `token`; the backend independently verifies it.
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
