import { request } from './client';
import type { ApiResult, Subject, SubjectCreate, SubjectUpdate } from '@/types/api';

export function listSubjects(
  token: string,
  options: { includeArchived?: boolean; limit?: number; offset?: number } = {}
): Promise<ApiResult<Subject[]>> {
  const params = new URLSearchParams();
  if (options.includeArchived) params.set('include_archived', 'true');
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.offset !== undefined) params.set('offset', String(options.offset));
  const query = params.toString();
  return request<Subject[]>(`/subjects${query ? `?${query}` : ''}`, { token });
}

export function createSubject(token: string, data: SubjectCreate): Promise<ApiResult<Subject>> {
  return request<Subject>('/subjects', { method: 'POST', body: data, token });
}

export function updateSubject(
  token: string,
  subjectId: string,
  changes: SubjectUpdate
): Promise<ApiResult<Subject>> {
  return request<Subject>(`/subjects/${subjectId}`, { method: 'PATCH', body: changes, token });
}
