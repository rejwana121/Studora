import { request } from './client';
import type { ApiResult, WorkloadCurrentResponse } from '@/types/api';

export function getCurrentWorkload(token: string): Promise<ApiResult<WorkloadCurrentResponse>> {
  return request<WorkloadCurrentResponse>('/workload/current', { token });
}
