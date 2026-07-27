import { request } from './client';
import type { ApiResult, StudyBlockCreate, StudyBlockRead, StudyBlockUpdate } from '@/types/api';

export function createStudyBlock(
  token: string,
  data: StudyBlockCreate
): Promise<ApiResult<StudyBlockRead>> {
  return request<StudyBlockRead>('/study-blocks', { method: 'POST', body: data, token });
}

export function updateStudyBlock(
  token: string,
  blockId: string,
  changes: StudyBlockUpdate
): Promise<ApiResult<StudyBlockRead>> {
  return request<StudyBlockRead>(`/study-blocks/${blockId}`, {
    method: 'PATCH',
    body: changes,
    token,
  });
}

export function deleteStudyBlock(token: string, blockId: string): Promise<ApiResult<null>> {
  return request<null>(`/study-blocks/${blockId}`, { method: 'DELETE', token });
}
