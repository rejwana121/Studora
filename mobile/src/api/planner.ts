import { request } from './client';
import type { ApiResult, CalendarResponse, DayView } from '@/types/api';

export function getCalendar(
  token: string,
  startDate: string,
  endDate: string
): Promise<ApiResult<CalendarResponse>> {
  return request<CalendarResponse>(
    `/planner/calendar?start_date=${startDate}&end_date=${endDate}`,
    { token }
  );
}

export function getDay(token: string, date: string): Promise<ApiResult<DayView>> {
  return request<DayView>(`/planner/day?date=${date}`, { token });
}
