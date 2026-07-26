import { request } from './client';
import type { ApiResult, Task, TaskCreate, TaskListQuery, TaskTodayView, TaskUpdate } from '@/types/api';

export function listTasks(token: string, query: TaskListQuery = {}): Promise<ApiResult<Task[]>> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return request<Task[]>(`/tasks${qs ? `?${qs}` : ''}`, { token });
}

export function getTasksToday(token: string): Promise<ApiResult<TaskTodayView>> {
  return request<TaskTodayView>('/tasks/today', { token });
}

export function createTask(token: string, data: TaskCreate): Promise<ApiResult<Task>> {
  return request<Task>('/tasks', { method: 'POST', body: data, token });
}

export function getTask(token: string, taskId: string): Promise<ApiResult<Task>> {
  return request<Task>(`/tasks/${taskId}`, { token });
}

export function updateTask(
  token: string,
  taskId: string,
  changes: TaskUpdate
): Promise<ApiResult<Task>> {
  return request<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: changes, token });
}

export function deleteTask(token: string, taskId: string): Promise<ApiResult<null>> {
  return request<null>(`/tasks/${taskId}`, { method: 'DELETE', token });
}
