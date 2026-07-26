import { request } from './client';
import type { ApiResult, Subtask, SubtaskCreate, SubtaskUpdate } from '@/types/api';

export function createSubtask(
  token: string,
  taskId: string,
  data: SubtaskCreate
): Promise<ApiResult<Subtask>> {
  return request<Subtask>(`/tasks/${taskId}/subtasks`, { method: 'POST', body: data, token });
}

export function updateSubtask(
  token: string,
  taskId: string,
  subtaskId: string,
  changes: SubtaskUpdate
): Promise<ApiResult<Subtask>> {
  return request<Subtask>(`/tasks/${taskId}/subtasks/${subtaskId}`, {
    method: 'PATCH',
    body: changes,
    token,
  });
}

export function deleteSubtask(
  token: string,
  taskId: string,
  subtaskId: string
): Promise<ApiResult<null>> {
  return request<null>(`/tasks/${taskId}/subtasks/${subtaskId}`, { method: 'DELETE', token });
}
