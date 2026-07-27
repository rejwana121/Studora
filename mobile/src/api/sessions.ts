import { request } from './client';
import type {
  ApiResult,
  SessionBreakActionResult,
  StudySessionBreakCreate,
  StudySessionCreate,
  StudySessionListQuery,
  StudySessionRead,
} from '@/types/api';

export function startSession(
  token: string,
  data?: StudySessionCreate
): Promise<ApiResult<StudySessionRead>> {
  return request<StudySessionRead>('/sessions/start', { method: 'POST', body: data, token });
}

export function pauseSession(token: string, sessionId: string): Promise<ApiResult<StudySessionRead>> {
  return request<StudySessionRead>(`/sessions/${sessionId}/pause`, { method: 'PATCH', token });
}

export function resumeSession(token: string, sessionId: string): Promise<ApiResult<StudySessionRead>> {
  return request<StudySessionRead>(`/sessions/${sessionId}/resume`, { method: 'PATCH', token });
}

export function finishSession(token: string, sessionId: string): Promise<ApiResult<StudySessionRead>> {
  return request<StudySessionRead>(`/sessions/${sessionId}/finish`, { method: 'PATCH', token });
}

export function listSessions(
  token: string,
  query: StudySessionListQuery = {}
): Promise<ApiResult<StudySessionRead[]>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return request<StudySessionRead[]>(`/sessions${qs ? `?${qs}` : ''}`, { token });
}

export function recordBreakAction(
  token: string,
  sessionId: string,
  data: StudySessionBreakCreate
): Promise<ApiResult<SessionBreakActionResult>> {
  return request<SessionBreakActionResult>(`/sessions/${sessionId}/break`, {
    method: 'POST',
    body: data,
    token,
  });
}
